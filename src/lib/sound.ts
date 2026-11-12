"use client";

/** Tiny synthesized sound kit (no audio files). Muted state persists per browser. */
type Sfx = "chip" | "card" | "flip" | "win" | "blackjack" | "lose" | "push" | "click";

const KEY = "inferno:muted";
let ctx: AudioContext | null = null;
let muted = false;
const listeners = new Set<(m: boolean) => void>();

try {
  if (typeof window !== "undefined") muted = localStorage.getItem(KEY) === "1";
} catch {}

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(KEY, m ? "1" : "0");
  } catch {}
  listeners.forEach((l) => l(m));
}
export function onMuteChange(l: (m: boolean) => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

function audio() {
  if (typeof window === "undefined") return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(a: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(a.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

function noise(a: AudioContext, start: number, dur: number, freq: number, gain: number) {
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = 0.8;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(start);
}

export function play(sfx: Sfx, delaySec = 0) {
  if (muted) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delaySec;
  switch (sfx) {
    case "chip":
      tone(a, 2400, t, 0.05, "triangle", 0.08);
      tone(a, 3100, t + 0.025, 0.05, "triangle", 0.05);
      break;
    case "card":
      noise(a, t, 0.09, 2600, 0.5);
      break;
    case "flip":
      noise(a, t, 0.06, 1800, 0.4);
      noise(a, t + 0.05, 0.05, 3200, 0.25);
      break;
    case "click":
      tone(a, 900, t, 0.04, "square", 0.03);
      break;
    case "win":
      [523, 659, 784].forEach((f, i) => tone(a, f, t + i * 0.08, 0.35, "triangle", 0.09));
      break;
    case "blackjack":
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(a, f, t + i * 0.07, 0.5, "triangle", 0.09));
      noise(a, t + 0.3, 0.6, 5000, 0.08);
      break;
    case "push":
      tone(a, 440, t, 0.25, "sine", 0.08);
      break;
    case "lose":
      tone(a, 180, t, 0.4, "sine", 0.14);
      tone(a, 120, t + 0.08, 0.5, "sine", 0.1);
      break;
  }
}
