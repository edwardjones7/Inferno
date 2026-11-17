"use client";

/**
 * Inferno sound engine.
 *
 * - Cards and chips play real CC0 foley (Kenney "Casino Audio", see public/sfx/LICENSE.txt),
 *   lazily fetched + decoded after the first user gesture, with random variant / pitch / gain / pan
 *   per hit and per-sound voice caps. Until a buffer is ready a synthesized stand-in plays instead.
 * - Stingers, fire effects and the lighter are synthesized with WebAudio.
 * - The ambience bed is a smoky back room: a slow swung jazz loop (walking bass, brushes,
 *   Rhodes) rendered once by sound-bed.ts, under vinyl crackle, a faint room murmur and room tone.
 * - Everything runs through master gain -> glue compressor -> limiter. Mute fades the master.
 * - Safe to import during SSR: nothing touches window/AudioContext until called in the browser.
 */
import { haptic, type Haptic } from "./haptics";
import { BED_RATE, BED_SECONDS, bedRenderer, renderVinyl, type Bed } from "./sound-bed";

export type Sfx =
  | "chip"
  | "card"
  | "flip"
  | "win"
  | "blackjack"
  | "lose"
  | "push"
  | "click"
  /** a losing hand burning away */
  | "burn"
  /** the payoff on a blackjack: sparks off a struck match and a lamp flare */
  | "flame"
  /** chips landing / settling on the felt */
  | "clack"
  /** low boom that opens a slow-motion dealer reveal */
  | "drama"
  /** a lighter: lid flick, flint strike, the flame catching */
  | "lighter";

const KEY = "inferno:muted";
const isBrowser = typeof window !== "undefined";
const MASTER_LEVEL = 0.9;
/** ambience bed level, ≈ -30 dBFS */
const AMB_LEVEL = 0.032;

let muted = false;
const listeners = new Set<(m: boolean) => void>();

try {
  if (isBrowser) muted = localStorage.getItem(KEY) === "1";
} catch {}

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(KEY, m ? "1" : "0");
  } catch {}
  applyMute();
  listeners.forEach((l) => l(m));
}
export function onMuteChange(l: (m: boolean) => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

/* ------------------------------------------------------------------ engine */

type Engine = {
  ctx: AudioContext;
  /** master volume / mute */
  master: GainNode;
  /** dry sfx bus */
  sfx: GainNode;
  /** reverb send input */
  verb: GainNode;
  /** 2s looping white noise */
  noise: AudioBuffer;
  /** 4s looping brown noise */
  brown: AudioBuffer;
};

let eng: Engine | null = null;
let unlocked = false;
let hidden = false;
let suspendTimer: ReturnType<typeof setTimeout> | null = null;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function makeNoise(ctx: AudioContext, sec: number, brown: boolean) {
  const len = Math.floor(ctx.sampleRate * sec);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last;
    } else d[i] = w;
    peak = Math.max(peak, Math.abs(d[i]));
  }
  if (brown && peak > 0) for (let i = 0; i < len; i++) d[i] /= peak;
  // short crossfade at the loop seam to avoid a click
  const fade = Math.min(512, len >> 2);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[len - fade + i] = d[len - fade + i] * (1 - k) + d[i] * k;
  }
  return buf;
}

/** warm, slightly dark stereo plate made from decaying filtered noise */
function makeImpulse(ctx: AudioContext, sec: number) {
  const len = Math.floor(ctx.sampleRate * sec);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      lp += (Math.random() * 2 - 1 - lp) * (0.55 - 0.4 * k); // darker as it decays
      d[i] = lp * (1 - k) ** 2.4 * (i < 200 ? i / 200 : 1);
    }
  }
  return buf;
}

function engine(): Engine | null {
  if (!isBrowser) return null;
  if (eng) return eng;
  const AC =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  let ctx: AudioContext;
  try {
    ctx = new AC({ latencyHint: "interactive" });
  } catch {
    return null;
  }

  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -18;
  glue.knee.value = 12;
  glue.ratio.value = 3;
  glue.attack.value = 0.005;
  glue.release.value = 0.2;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;

  const master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER_LEVEL;
  master.connect(glue).connect(limiter).connect(ctx.destination);

  const sfx = ctx.createGain();
  sfx.connect(master);

  const verb = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx, 1.8);
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  verb.connect(conv).connect(wet).connect(master);

  eng = { ctx, master, sfx, verb, noise: makeNoise(ctx, 2, false), brown: makeNoise(ctx, 4, true) };
  ctx.addEventListener("statechange", onRunning);
  return eng;
}

/** Get the engine and try to resume it (works when called inside a user gesture). */
function audio(): Engine | null {
  const e = engine();
  if (!e) return null;
  if (e.ctx.state !== "running" && !hidden) e.ctx.resume().then(onRunning, () => {});
  return e;
}

function onRunning() {
  if (unlocked || !eng || eng.ctx.state !== "running") return;
  unlocked = true;
  removeUnlockListeners();
  preloadSamples();
  if (ambWanted) ensureAmbience();
}

const GESTURES = ["pointerdown", "keydown", "touchend"] as const;
/** Browsers refuse to start audio before a user gesture; don't even try until one happens. */
let gestureSeen = false;
function unlockFromGesture() {
  gestureSeen = true;
  audio();
}
function removeUnlockListeners() {
  GESTURES.forEach((g) => window.removeEventListener(g, unlockFromGesture, true));
}

function applyMute() {
  if (!eng) return;
  const now = eng.ctx.currentTime;
  eng.master.gain.cancelScheduledValues(now);
  eng.master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, now, 0.06);
  updateAmbienceLevel();
}

if (isBrowser) {
  GESTURES.forEach((g) => window.addEventListener(g, unlockFromGesture, { capture: true, passive: true }));
  hidden = document.visibilityState === "hidden";
  document.addEventListener("visibilitychange", () => {
    hidden = document.visibilityState === "hidden";
    if (!eng) return;
    updateAmbienceLevel();
    if (suspendTimer) clearTimeout(suspendTimer);
    suspendTimer = null;
    if (hidden) {
      const c = eng.ctx;
      suspendTimer = setTimeout(() => {
        if (hidden && c.state === "running") c.suspend().catch(() => {});
      }, 500);
    } else if (unlocked && eng.ctx.state !== "running") {
      eng.ctx.resume().catch(() => {});
    }
  });
}

/* ------------------------------------------------------------------ building blocks */

/** a gain node feeding the dry bus plus a reverb send */
function bus(e: Engine, verbAmt: number, gain = 1) {
  const g = e.ctx.createGain();
  g.gain.value = gain;
  g.connect(e.sfx);
  if (verbAmt > 0) {
    const s = e.ctx.createGain();
    s.gain.value = verbAmt;
    g.connect(s).connect(e.verb);
  }
  return g;
}

/** percussive envelope: exp attack to peak, exp decay */
function env(p: AudioParam, t: number, attack: number, peak: number, decay: number) {
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  p.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noiseSrc(e: Engine, t: number, dur: number, buf: AudioBuffer = e.noise) {
  const s = e.ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.start(t, Math.random() * (buf.duration - 0.05));
  s.stop(t + dur + 0.05);
  return s;
}

function filter(e: Engine, type: BiquadFilterType, freq: number, q = 0.707) {
  const f = e.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function osc(e: Engine, type: OscillatorType, freq: number, t: number, dur: number, detune = 0) {
  const o = e.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

/** soft mallet / bell-ish note with inharmonic partials (marimba-ish, warm) */
function mallet(e: Engine, out: AudioNode, f: number, t: number, gain: number, decay: number) {
  const partials: [number, number, number][] = [
    [1, 1, 1],
    [2.0, 0.32, 0.55],
    [3.01, 0.12, 0.32],
    [4.17, 0.05, 0.2],
  ];
  for (const [m, g, d] of partials) {
    const o = osc(e, "sine", f * m, t, decay * d + 0.01, rand(-3, 3));
    const a = e.ctx.createGain();
    env(a.gain, t, 0.004, gain * g, decay * d);
    o.connect(a).connect(out);
  }
}

/** detuned saw pad / brass through a sweeping low-pass */
function pad(
  e: Engine,
  out: AudioNode,
  freqs: number[],
  t: number,
  dur: number,
  gain: number,
  sweep: [number, number, number],
  attack = 0.12,
) {
  const lp = filter(e, "lowpass", sweep[0], 0.9);
  lp.frequency.setValueAtTime(sweep[0], t);
  lp.frequency.exponentialRampToValueAtTime(sweep[1], t + attack + 0.05);
  lp.frequency.exponentialRampToValueAtTime(sweep[2], t + dur);
  const g = e.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.linearRampToValueAtTime(gain * 0.7, t + attack + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  lp.connect(g).connect(out);
  for (const f of freqs) for (const dt of [-7, 7]) osc(e, "sawtooth", f, t, dur, dt + rand(-2, 2)).connect(lp);
}

/** one fire crackle: tiny band-passed noise burst. `bright` scales the colour. */
function crackle(e: Engine, out: AudioNode, t: number, gain: number, bright = 1) {
  const pop = Math.random() < 0.15;
  const dur = pop ? rand(0.012, 0.03) : rand(0.002, 0.009);
  const bp = filter(e, "bandpass", (pop ? rand(500, 1400) : rand(1500, 6000)) * bright, pop ? 1.2 : rand(1.5, 4));
  const g = e.ctx.createGain();
  env(g.gain, t, 0.0006, gain * (pop ? 1.4 : 1), dur);
  noiseSrc(e, t, dur + 0.01).connect(bp).connect(g).connect(out);
}

/** pitch-dropping sine thump (kick / boom / heartbeat) */
function thump(e: Engine, out: AudioNode, t: number, f0: number, f1: number, drop: number, gain: number, decay: number) {
  const o = osc(e, "sine", f0, t, decay + 0.05);
  o.frequency.exponentialRampToValueAtTime(f1, t + drop);
  const g = e.ctx.createGain();
  env(g.gain, t, 0.006, gain, decay);
  o.connect(g).connect(out);
}

/* ------------------------------------------------------------------ synthesized sounds */

const N = { D3: 146.83, F3: 174.61, A3: 220, D4: 293.66, Fs4: 369.99, A4: 440, D5: 587.33, Fs5: 739.99, A5: 880, D6: 1174.66 };

function synthChip(e: Engine, t: number, gain: number) {
  const o = bus(e, 0.05);
  const hits = gain > 0.5 ? 2 : 1;
  for (let h = 0; h < hits; h++) {
    const th = t + h * rand(0.03, 0.05);
    const k = h ? 0.45 : 1;
    // pitched a little low with a woody knock underneath, for a heavier clay chip
    for (const [f, g, d] of [
      [1150, 0.05, 0.035],
      [2050, 0.06, 0.05],
      [2710, 0.09, 0.04],
      [4190, 0.06, 0.03],
      [5520, 0.04, 0.02],
    ]) {
      const x = osc(e, "sine", f * rand(0.97, 1.03), th, d);
      const a = e.ctx.createGain();
      env(a.gain, th, 0.001, g * gain * k, d);
      x.connect(a).connect(o);
    }
    const n = e.ctx.createGain();
    env(n.gain, th, 0.0005, 0.25 * gain * k, 0.006);
    noiseSrc(e, th, 0.01).connect(filter(e, "bandpass", 5000, 1.5)).connect(n).connect(o);
  }
}

function synthCard(e: Engine, t: number) {
  const o = bus(e, 0.04);
  const bp = filter(e, "bandpass", 1800, 0.9);
  bp.frequency.setValueAtTime(1600, t);
  bp.frequency.exponentialRampToValueAtTime(4200, t + 0.1);
  const g = e.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.025);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  noiseSrc(e, t, 0.14).connect(bp).connect(g).connect(o);
  const tap = e.ctx.createGain();
  env(tap.gain, t + 0.1, 0.001, 0.35, 0.03);
  noiseSrc(e, t + 0.1, 0.04).connect(filter(e, "lowpass", 900)).connect(tap).connect(o);
}

function synthFlip(e: Engine, t: number) {
  const o = bus(e, 0.04);
  const snap = e.ctx.createGain();
  env(snap.gain, t, 0.002, 0.4, 0.035);
  noiseSrc(e, t, 0.05).connect(filter(e, "bandpass", 2600, 1.1)).connect(snap).connect(o);
  const tap = e.ctx.createGain();
  env(tap.gain, t + 0.05, 0.001, 0.4, 0.035);
  noiseSrc(e, t + 0.05, 0.05).connect(filter(e, "lowpass", 750)).connect(tap).connect(o);
}

const SYNTH: Record<Sfx, (e: Engine, t: number) => void> = {
  chip: (e, t) => synthChip(e, t, 1),
  clack: (e, t) => synthChip(e, t, 0.45),
  card: synthCard,
  flip: synthFlip,

  click(e, t) {
    const o = bus(e, 0);
    for (const [f, g, d] of [
      [2200, 0.05, 0.02],
      [1100, 0.04, 0.035],
    ]) {
      const x = osc(e, "sine", f, t, d);
      const a = e.ctx.createGain();
      env(a.gain, t, 0.001, g, d);
      x.connect(a).connect(o);
    }
  },

  win(e, t) {
    const o = bus(e, 0.45);
    thump(e, o, t, 110, 73, 0.12, 0.22, 0.45);
    [N.D4, N.Fs4, N.A4, N.D5].forEach((f, i) => mallet(e, o, f, t + i * 0.075, 0.15, 0.9));
    pad(e, o, [N.D3, N.A3, N.D4, N.Fs4], t + 0.05, 1.4, 0.035, [500, 2200, 700]);
    mallet(e, o, N.D6, t + 0.33, 0.04, 0.6);
    mallet(e, o, N.A5, t + 0.38, 0.03, 0.5);
  },

  blackjack(e, t) {
    const o = bus(e, 0.5);
    [N.D4, N.Fs4, N.A4, N.D5, N.Fs5, N.A5, N.D6].forEach((f, i) => mallet(e, o, f, t + i * 0.055, 0.13, 1.2));
    const hit = t + 0.4;
    thump(e, o, hit, 90, 42, 0.2, 0.5, 0.8);
    pad(e, o, [N.D3, N.A3, N.D4, N.Fs4, N.A4], hit, 1.9, 0.06, [300, 3200, 900], 0.03);
    const sh = e.ctx.createGain();
    sh.gain.setValueAtTime(0.0001, hit);
    sh.gain.exponentialRampToValueAtTime(0.035, hit + 0.35);
    sh.gain.exponentialRampToValueAtTime(0.0001, hit + 1.6);
    noiseSrc(e, hit, 1.6).connect(filter(e, "highpass", 6500)).connect(sh).connect(o);
  },

  push(e, t) {
    const o = bus(e, 0.4);
    mallet(e, o, N.A4, t, 0.12, 0.6);
    mallet(e, o, N.D4 * 1.122, t + 0.13, 0.1, 0.7); // E4
    pad(e, o, [N.A3, N.D4 * 1.122], t + 0.08, 0.8, 0.022, [400, 1200, 500]);
  },

  lose(e, t) {
    const o = bus(e, 0.45);
    thump(e, o, t, 80, 44, 0.25, 0.3, 0.55);
    pad(e, o, [98, 116.54, 146.83], t, 1.5, 0.05, [900, 700, 160], 0.06); // G minor, closing down
    const dark = filter(e, "lowpass", 1600);
    dark.connect(o);
    [311.13, 261.63, 196].forEach((f, i) => mallet(e, dark, f, t + 0.06 + i * 0.13, 0.11, 0.8));
    const hiss = e.ctx.createGain();
    hiss.gain.setValueAtTime(0.0001, t + 0.2);
    hiss.gain.exponentialRampToValueAtTime(0.018, t + 0.5);
    hiss.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    noiseSrc(e, t + 0.2, 1.3).connect(filter(e, "bandpass", 2800, 0.6)).connect(hiss).connect(o);
  },

  burn(e, t) {
    const o = bus(e, 0.25);
    // whoosh of paper catching
    const bp = filter(e, "bandpass", 350, 0.7);
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.exponentialRampToValueAtTime(2200, t + 0.35);
    bp.frequency.exponentialRampToValueAtTime(800, t + 1.2);
    const wg = e.ctx.createGain();
    wg.gain.setValueAtTime(0.0001, t);
    wg.gain.exponentialRampToValueAtTime(0.5, t + 0.18);
    wg.gain.exponentialRampToValueAtTime(0.22, t + 0.6);
    wg.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
    noiseSrc(e, t, 1.3).connect(bp).connect(wg).connect(o);
    // body
    const bg = e.ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.6, t + 0.12);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    noiseSrc(e, t, 1.15, e.brown).connect(filter(e, "lowpass", 260)).connect(bg).connect(o);
    // crackles, dense early then thinning out
    for (let i = 0; i < 36; i++) crackle(e, o, t + 0.04 + Math.random() ** 1.7 * 1.1, rand(0.12, 0.5), 1.1);
  },

  flame(e, t) {
    const o = bus(e, 0.2);
    const end = t + 1.55;
    // roar
    const lp = filter(e, "lowpass", 400, 1.4);
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(2400, t + 0.15);
    lp.frequency.exponentialRampToValueAtTime(1100, end);
    const rg = e.ctx.createGain();
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.exponentialRampToValueAtTime(0.6, t + 0.07);
    rg.gain.exponentialRampToValueAtTime(0.42, t + 1.0);
    rg.gain.exponentialRampToValueAtTime(0.0001, end);
    // turbulent flutter on the roar (multiplies the envelope, so it dies with it)
    const flutter = e.ctx.createGain();
    flutter.gain.value = 1;
    const lfo = osc(e, "sine", rand(9, 13), t, 1.6);
    const depth = e.ctx.createGain();
    depth.gain.value = 0.25;
    lfo.connect(depth).connect(flutter.gain);
    noiseSrc(e, t, 1.6).connect(lp).connect(rg).connect(flutter).connect(o);
    // hiss of the jet
    const hg = e.ctx.createGain();
    hg.gain.setValueAtTime(0.0001, t);
    hg.gain.exponentialRampToValueAtTime(0.1, t + 0.05);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    noiseSrc(e, t, 1.35).connect(filter(e, "highpass", 3800)).connect(hg).connect(o);
    // low rumble + ignition whump
    const sg = e.ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.9, t + 0.08);
    sg.gain.exponentialRampToValueAtTime(0.0001, end);
    noiseSrc(e, t, 1.6, e.brown).connect(filter(e, "lowpass", 140)).connect(sg).connect(o);
    thump(e, o, t, 95, 42, 0.3, 0.45, 0.5);
    for (let i = 0; i < 14; i++) crackle(e, o, t + rand(0.1, 1.4), rand(0.08, 0.3), 1.2);
  },

  drama(e, t) {
    const o = bus(e, 0.4);
    // sub boom + an octave-up layer so it reads on laptop speakers
    thump(e, o, t, 85, 32, 0.9, 0.95, 2.2);
    thump(e, o, t, 170, 64, 0.5, 0.22, 0.7);
    const n = e.ctx.createGain();
    env(n.gain, t, 0.004, 0.55, 0.3);
    noiseSrc(e, t, 0.35, e.brown).connect(filter(e, "lowpass", 200)).connect(n).connect(o);
    // heartbeat
    for (const b of [0.75, 1.42]) {
      thump(e, o, t + b, 64, 44, 0.1, 0.5, 0.16);
      thump(e, o, t + b + 0.17, 58, 40, 0.1, 0.36, 0.2);
    }
    // tension riser underneath
    const bp = filter(e, "bandpass", 300, 2.5);
    bp.frequency.setValueAtTime(300, t + 0.2);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 1.6);
    const rg = e.ctx.createGain();
    rg.gain.setValueAtTime(0.0001, t + 0.2);
    rg.gain.exponentialRampToValueAtTime(0.1, t + 1.55);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    noiseSrc(e, t + 0.2, 1.5).connect(bp).connect(rg).connect(o);
  },

  lighter(e, t) {
    const o = bus(e, 0.12);
    // the lid flicks open: a bright metal clink
    for (const [f, g, d] of [
      [3150, 0.06, 0.05],
      [4720, 0.05, 0.04],
      [6930, 0.03, 0.03],
    ]) {
      const x = osc(e, "sine", f * rand(0.98, 1.02), t, d);
      const a = e.ctx.createGain();
      env(a.gain, t, 0.001, g, d);
      x.connect(a).connect(o);
    }
    const tick = e.ctx.createGain();
    env(tick.gain, t, 0.0005, 0.2, 0.008);
    noiseSrc(e, t, 0.015).connect(filter(e, "bandpass", 4000, 1.2)).connect(tick).connect(o);
    // the thumb rolls the flint wheel: a gritty scrape and a spray of sparks
    const s = t + rand(0.15, 0.2);
    const scrape = e.ctx.createGain();
    env(scrape.gain, s, 0.005, 0.22, 0.07);
    noiseSrc(e, s, 0.09).connect(filter(e, "bandpass", 3200, 2)).connect(scrape).connect(o);
    for (let i = 0; i < 9; i++) crackle(e, o, s + rand(0, 0.07), rand(0.08, 0.25), 1.6);
    // the flame catches: a soft whump that opens up, and a breathy hiss
    const w = s + 0.05;
    const lp = filter(e, "lowpass", 300, 0.8);
    lp.frequency.setValueAtTime(300, w);
    lp.frequency.exponentialRampToValueAtTime(900, w + 0.12);
    lp.frequency.exponentialRampToValueAtTime(500, w + 0.55);
    const wg = e.ctx.createGain();
    wg.gain.setValueAtTime(0.0001, w);
    wg.gain.exponentialRampToValueAtTime(0.35, w + 0.06);
    wg.gain.exponentialRampToValueAtTime(0.0001, w + 0.55);
    noiseSrc(e, w, 0.6, e.brown).connect(lp).connect(wg).connect(o);
    const hg = e.ctx.createGain();
    hg.gain.setValueAtTime(0.0001, w);
    hg.gain.exponentialRampToValueAtTime(0.025, w + 0.08);
    hg.gain.exponentialRampToValueAtTime(0.0001, w + 0.6);
    noiseSrc(e, w, 0.65).connect(filter(e, "highpass", 5000)).connect(hg).connect(o);
    thump(e, o, w, 120, 70, 0.08, 0.12, 0.2);
  },
};

/* ------------------------------------------------------------------ samples */

type Bank = {
  files: string[];
  gain: number;
  /** base playback rate (below 1 = lower and heavier) */
  rate?: number;
  /** ± playback-rate jitter */
  pitch: number;
  /** max overlapping voices; extra hits are dropped */
  cap: number;
  /** min seconds between starts (0 = none) */
  gap: number;
  verb: number;
};

const range = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}-${i + 1}`);

const BANKS: Partial<Record<Sfx, Bank>> = {
  card: { files: range("card-deal", 6), gain: 0.55, pitch: 0.05, cap: 4, gap: 0.025, verb: 0.05 },
  flip: { files: range("card-flip", 4), gain: 0.6, pitch: 0.04, cap: 3, gap: 0.03, verb: 0.05 },
  // chips are pitched down a touch so they land like heavy clay, not plastic
  chip: { files: range("chip-stack", 6), gain: 0.6, rate: 0.87, pitch: 0.04, cap: 4, gap: 0.03, verb: 0.05 },
  clack: {
    files: [...range("chip-clack", 4), ...range("chip-lay", 3)],
    gain: 0.44,
    rate: 0.9,
    pitch: 0.06,
    cap: 5,
    gap: 0.035,
    verb: 0.04,
  },
};

const buffers = new Map<string, AudioBuffer | null>(); // null = failed to load
const loading = new Map<string, Promise<AudioBuffer | null>>();
const lastPick = new Map<Sfx, number>();
const voices = new Map<Sfx, { s: number; e: number }[]>();

let formats: string[] | null = null;
function sampleFormats() {
  if (formats) return formats;
  let ogg = false;
  try {
    ogg = new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== "";
  } catch {}
  formats = ogg ? ["ogg", "m4a"] : ["m4a", "ogg"];
  return formats;
}

function decode(ctx: AudioContext, data: ArrayBuffer) {
  // callback form for old Safari, promise form everywhere else
  return new Promise<AudioBuffer>((res, rej) => {
    const p = ctx.decodeAudioData(data, res, rej) as Promise<AudioBuffer> | undefined;
    p?.catch(rej);
  });
}

function load(name: string): Promise<AudioBuffer | null> {
  const e = eng;
  if (!e) return Promise.resolve(null);
  const pending = loading.get(name);
  if (pending) return pending;
  const p = (async () => {
    for (const ext of sampleFormats()) {
      try {
        const r = await fetch(`/sfx/${name}.${ext}`);
        if (!r.ok) continue;
        const buf = await decode(e.ctx, await r.arrayBuffer());
        buffers.set(name, buf);
        return buf;
      } catch {}
    }
    buffers.set(name, null);
    return null;
  })();
  loading.set(name, p);
  return p;
}

function preloadSamples() {
  for (const b of Object.values(BANKS)) b?.files.forEach((f) => void load(f));
}

/** reserve a voice slot at time t; false = drop this hit */
function claimVoice(sfx: Sfx, bank: Bank, t: number, dur: number, now: number) {
  const list = (voices.get(sfx) ?? []).filter((v) => v.e > now);
  voices.set(sfx, list);
  if (list.filter((v) => v.s <= t && v.e > t).length >= bank.cap) return false;
  if (bank.gap > 0 && list.some((v) => Math.abs(v.s - t) < bank.gap)) return false;
  list.push({ s: t, e: t + dur });
  return true;
}

function playBuffer(e: Engine, sfx: Sfx, bank: Bank, buf: AudioBuffer, t: number) {
  const src = e.ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = (bank.rate ?? 1) * (1 + rand(-bank.pitch, bank.pitch));
  const g = e.ctx.createGain();
  // gentle ducking when many voices overlap (e.g. a pile of chips)
  const overlap = (voices.get(sfx) ?? []).filter((v) => v.s <= t && v.e > t).length;
  g.gain.value = bank.gain * rand(0.8, 1) / Math.sqrt(Math.max(1, overlap));
  let node: AudioNode = src.connect(g);
  if (e.ctx.createStereoPanner) {
    const pan = e.ctx.createStereoPanner();
    pan.pan.value = rand(-0.18, 0.18);
    node = node.connect(pan);
  }
  node.connect(bus(e, bank.verb));
  src.start(Math.max(t, e.ctx.currentTime));
}

function pickVariant(sfx: Sfx, ready: AudioBuffer[]) {
  let i = Math.floor(Math.random() * ready.length);
  if (ready.length > 1 && i === lastPick.get(sfx)) i = (i + 1) % ready.length;
  lastPick.set(sfx, i);
  return ready[i];
}

function playBank(e: Engine, sfx: Sfx, bank: Bank, t: number) {
  const now = e.ctx.currentTime;
  if (!claimVoice(sfx, bank, t, 0.35, now)) return;
  const ready = bank.files.map((f) => buffers.get(f)).filter((b): b is AudioBuffer => !!b);
  if (ready.length) return playBuffer(e, sfx, bank, pickVariant(sfx, ready), t);

  const failed = bank.files.every((f) => buffers.get(f) === null);
  if (!failed && e.ctx.state === "running") {
    const first = load(bank.files[0]);
    bank.files.slice(1).forEach((f) => void load(f));
    if (t - now > 0.12) {
      // there is time: wait for the sample, use the synth only if we'd miss the slot
      void first.then((buf) => {
        if (muted) return;
        if (buf && t > e.ctx.currentTime + 0.005) playBuffer(e, sfx, bank, buf, t);
        else SYNTH[sfx](e, Math.max(t, e.ctx.currentTime));
      });
      return;
    }
  }
  SYNTH[sfx](e, t);
}

const HAPTIC: Partial<Record<Sfx, Haptic>> = {
  chip: "light",
  click: "tap",
  flip: "light",
  win: "success",
  blackjack: "heavy",
  lose: "medium",
  push: "light",
  drama: "heavy",
  lighter: "light",
};

export function play(sfx: Sfx, delaySec = 0) {
  const h = HAPTIC[sfx];
  if (h && gestureSeen) haptic(h, delaySec);
  if (muted || !gestureSeen) return;
  const e = audio();
  if (!e) return;
  const t = e.ctx.currentTime + Math.max(0, delaySec || 0);
  try {
    const bank = BANKS[sfx];
    if (bank) playBank(e, sfx, bank, t);
    else SYNTH[sfx]?.(e, t);
  } catch {
    // never let a sound break the game
  }
}

/* ------------------------------------------------------------------ ambience */

type Amb = {
  out: GainNode;
  /** warmth of the whole bed, follows the heat */
  tone: BiquadFilterNode;
  music: GainNode;
  vinyl: GainNode;
  murmur: GainNode;
  srcs: AudioScheduledSourceNode[];
  timer: ReturnType<typeof setInterval>;
  /** the band's loop is playing (it starts once rendered) */
  musicOn: boolean;
  /** next time the murmur swells or dips */
  breathe: number;
};

/** levels inside the bed, before AMB_LEVEL */
const BED_MIX = { music: 0.95, vinyl: 0.3, murmur: 0.22, rumble: 0.22 };

let amb: Amb | null = null;
let bedBuffers: { music: AudioBuffer; vinyl: AudioBuffer } | null = null;
let ambWanted = false;
let heat = 0;
let heatSmooth = 0;
let teardownTimer: ReturnType<typeof setTimeout> | null = null;

function ambienceTarget() {
  return ambWanted && !muted && !hidden ? AMB_LEVEL : 0;
}

function updateAmbienceLevel() {
  if (!amb || !eng) return;
  const now = eng.ctx.currentTime;
  const target = ambienceTarget();
  amb.out.gain.cancelScheduledValues(now);
  amb.out.gain.setTargetAtTime(target, now, target > 0 ? 0.6 : 0.2);
}

function ensureAmbience() {
  const e = eng;
  if (!e || !unlocked) return;
  if (teardownTimer) clearTimeout(teardownTimer);
  teardownTimer = null;
  if (amb) return updateAmbienceLevel();

  const ctx = e.ctx;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(e.master);
  const tone = filter(e, "lowpass", 3500, 0.5);
  tone.connect(out);

  const loop = (buf: AudioBuffer) => {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start(ctx.currentTime, Math.random() * buf.duration);
    return s;
  };

  // room tone: the low hum of a basement full of people
  const rumbleSrc = loop(e.brown);
  const rumble = ctx.createGain();
  rumble.gain.value = BED_MIX.rumble;
  rumbleSrc.connect(filter(e, "lowpass", 120)).connect(rumble).connect(tone);

  // murmur: talk two rooms away, noise through two voice-like bands, swelling and dipping
  const murmurSrc = loop(e.noise);
  const murmur = ctx.createGain();
  murmur.gain.value = BED_MIX.murmur;
  const lowVoice = ctx.createGain();
  lowVoice.gain.value = 0.55;
  const highVoice = ctx.createGain();
  highVoice.gain.value = 0.2;
  murmurSrc.connect(filter(e, "bandpass", 420, 1.2)).connect(lowVoice).connect(murmur);
  murmurSrc.connect(filter(e, "bandpass", 950, 2)).connect(highVoice).connect(murmur);
  murmur.connect(tone);

  const music = ctx.createGain();
  music.gain.value = BED_MIX.music;
  music.connect(tone);

  // the record's surface skips the tone filter so its clicks stay crisp
  const vinyl = ctx.createGain();
  vinyl.gain.value = BED_MIX.vinyl;
  vinyl.connect(filter(e, "highpass", 600)).connect(out);

  const a: Amb = {
    out,
    tone,
    music,
    vinyl,
    murmur,
    srcs: [rumbleSrc, murmurSrc],
    timer: setInterval(ambienceTick, 150),
    musicOn: false,
    breathe: 0,
  };
  amb = a;
  // the band joins once its loop is rendered (immediately on every visit after the first)
  if (bedBuffers) startBand(e, a, bedBuffers);
  else renderBedInSlices(e);

  heatSmooth = heat;
  ambienceTick();
  updateAmbienceLevel();
}

function startBand(e: Engine, a: Amb, bufs: NonNullable<typeof bedBuffers>) {
  if (a.musicOn) return;
  a.musicOn = true;
  const ctx = e.ctx;
  const surface = ctx.createBufferSource();
  surface.buffer = bufs.vinyl;
  surface.loop = true;
  surface.connect(a.vinyl);
  surface.start(ctx.currentTime, Math.random() * bufs.vinyl.duration);
  const song = ctx.createBufferSource();
  song.buffer = bufs.music;
  song.loop = true;
  // a slow wow, like a record that isn't quite flat
  const wow = osc(e, "sine", 0.55, ctx.currentTime, 1e6);
  const depth = ctx.createGain();
  depth.gain.value = 0.0015;
  wow.connect(depth).connect(song.playbackRate);
  song.connect(a.music);
  // start on a random bar so the tune doesn't always open the same way
  song.start(ctx.currentTime, (Math.floor(Math.random() * 8) * BED_SECONDS) / 8);
  a.srcs.push(surface, song, wow);
}

let bedJob: Generator<void, Bed, void> | null = null;
let bedTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Render the band's loop once, a few ms per slice, so the first tap and the 3D table never
 * stall on it (the whole render is ~100 ms on a desktop, several times that on a phone).
 */
function renderBedInSlices(e: Engine) {
  if (bedBuffers || bedTimer) return;
  bedJob ??= bedRenderer(BED_RATE);
  const slice = () => {
    bedTimer = null;
    const job = bedJob;
    if (!job) return;
    const until = performance.now() + 6;
    try {
      for (;;) {
        const r = job.next();
        if (r.done) {
          bedJob = null;
          bedBuffers = makeBedBuffers(e.ctx, r.value);
          if (amb) startBand(e, amb, bedBuffers);
          return;
        }
        if (performance.now() > until) break;
      }
    } catch {
      bedJob = null; // no band; the room tone and murmur still play
      return;
    }
    bedTimer = setTimeout(slice, 16);
  };
  bedTimer = setTimeout(slice, 30);
}

function makeBedBuffers(ctx: AudioContext, bed: Bed) {
  const music = ctx.createBuffer(2, bed.left.length, BED_RATE);
  music.getChannelData(0).set(bed.left);
  music.getChannelData(1).set(bed.right);
  const v = renderVinyl(BED_RATE);
  const vinyl = ctx.createBuffer(1, v.length, BED_RATE);
  vinyl.getChannelData(0).set(v);
  return { music, vinyl };
}

function ambienceTick() {
  const e = eng;
  const a = amb;
  if (!e || !a) return;
  const now = e.ctx.currentTime;
  if (hidden || muted || e.ctx.state !== "running") return;
  heatSmooth += (heat - heatSmooth) * 0.1;
  const h = (heatSmooth + 1) / 2; // 0 cold .. 1 hot

  // a hot table opens the room up a little: brighter band, livelier crowd
  a.tone.frequency.setTargetAtTime(2400 + 3600 * h, now, 0.8);
  a.music.gain.setTargetAtTime(BED_MIX.music * (0.85 + 0.15 * h), now, 0.8);
  if (now > a.breathe) {
    a.breathe = now + rand(0.2, 0.6);
    a.murmur.gain.setTargetAtTime(BED_MIX.murmur * (0.7 + 0.5 * h) * rand(0.55, 1.2), now, 0.15);
  }
}

function teardownAmbience() {
  if (!amb) return;
  clearInterval(amb.timer);
  amb.srcs.forEach((s) => {
    try {
      s.stop();
    } catch {}
  });
  amb.out.disconnect();
  amb = null;
}

/** Start the looping back-room bed (deferred until audio is unlocked by a user gesture). */
export function startAmbience() {
  if (!isBrowser) return;
  ambWanted = true;
  if (unlocked) ensureAmbience();
}

/** Fade out and stop the ambience bed. */
export function stopAmbience() {
  ambWanted = false;
  if (!amb || !eng) return;
  updateAmbienceLevel();
  if (teardownTimer) clearTimeout(teardownTimer);
  teardownTimer = setTimeout(() => {
    teardownTimer = null;
    if (!ambWanted) teardownAmbience();
  }, 1200);
}

/** -1 (cold) .. 1 (on fire): how bright and lively the room sounds. */
export function setAmbienceHeat(h: number) {
  heat = Number.isFinite(h) ? Math.max(-1, Math.min(1, h)) : 0;
}
