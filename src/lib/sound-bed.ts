/**
 * The back-room bed: a slow, swung jazz loop and a vinyl surface, rendered once into plain
 * sample arrays. Pure math with a fixed seed, no WebAudio, so it's safe to import anywhere
 * and the same every time. sound.ts copies the arrays into looping AudioBuffers.
 *
 * The tune: 8 bars at 72 bpm in D minor, | Dm9 | Dm9 | Gm9 | Gm9 | Em7b5 | A7b9 | Dm9 | A7b9b13 |.
 * Walking upright bass in quarters, brushes (a circular swish with pats on 2 and 4 and a
 * swung ghost after each), and sparse rootless Rhodes chords. Every note's tail wraps past the
 * end back to the start, so the loop has no seam. Rendered at 22.05 kHz: the bed sits under a
 * low-pass anyway, and half the rate is half the work.
 */

export const BED_RATE = 22050;
const BPM = 72;
const BEAT = 60 / BPM;
const BARS = 8;
/** length of the music loop in seconds (26.67 s) */
export const BED_SECONDS = BARS * 4 * BEAT;
/** the vinyl loop is a different, unrelated length so the clicks never line up with the tune */
export const VINYL_SECONDS = 7.3;

const midi = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** rootless voicing for each bar; the bass carries the root */
const COMP: number[][] = [
  [53, 57, 60, 64], // Dm9: F A C E
  [53, 57, 60, 64],
  [53, 57, 58, 62], // Gm9: F A Bb D
  [53, 57, 58, 62],
  [52, 55, 58, 62], // Em7b5: E G Bb D
  [55, 58, 61, 64], // A7b9: G Bb C# E
  [53, 57, 60, 64], // Dm9
  [55, 58, 61, 65], // A7b9b13: G Bb C# F
];

/** walking bass, one note per beat; each bar ends on a chromatic or scale approach to the next root */
const WALK = [
  38, 41, 45, 48, 50, 48, 45, 44, 43, 45, 46, 48, 50, 46, 43, 41, 40, 43, 46, 44, 45, 43, 40, 39, 38, 41, 45, 46, 45, 43, 40,
  37,
];

/** Rhodes hits: [bar, beat in bar, length in beats, velocity]. Off-beats sit at 2/3 of the beat (swing). */
const HITS: [number, number, number, number][] = [
  [0, 0, 3, 0.8],
  [1, 1 + 2 / 3, 2, 0.6],
  [2, 0, 3, 0.8],
  [3, 2 + 2 / 3, 1.3, 0.55],
  [4, 0, 2.5, 0.75],
  [4, 2 + 2 / 3, 1.3, 0.5],
  [5, 0, 3, 0.8],
  [6, 0, 2.5, 0.75],
  [7, 1 + 2 / 3, 2.3, 0.65],
];

/** small deterministic PRNG (mulberry32) so the bed renders identically every time */
function seeded(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Bed = { left: Float32Array; right: Float32Array };

/** Render the jazz loop as stereo arrays, peak-normalised to 0.9, in one go. */
export function renderBed(rate = BED_RATE): Bed {
  const job = bedRenderer(rate);
  for (;;) {
    const r = job.next();
    if (r.done) return r.value;
  }
}

/**
 * The same render as a generator that yields after every small piece of work (a note, a
 * slice of brushes), so a caller can spread it over several frames instead of stalling one.
 */
export function* bedRenderer(rate = BED_RATE): Generator<void, Bed, void> {
  const len = Math.round(BED_SECONDS * rate);
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  const rnd = seeded(1947);
  const TAU = 2 * Math.PI;
  /** mix a sample in at index i (wrapping), pan -1 (left) .. 1 (right) */
  const add = (i: number, v: number, pan: number) => {
    const j = ((i % len) + len) % len;
    L[j] += v * (1 - 0.5 * pan);
    R[j] += v * (1 + 0.5 * pan);
  };

  // upright bass: thumb pluck that bends slightly sharp then settles, upper harmonics fade first
  for (let n = 0; n < WALK.length; n++) {
    const m = WALK[n];
    const start = Math.round((n * BEAT + (rnd() - 0.5) * 0.012) * rate);
    const f = midi(m);
    const count = Math.round(BEAT * 1.15 * rate);
    const fadeOut = 0.04 * rate;
    const vel = (n % 4 === 0 ? 1 : 0.85) * (0.9 + rnd() * 0.15);
    // exponential decays as per-sample multipliers: cheaper than Math.exp every sample
    const [k40, k2, k6, k10] = [40, 2.2, 6, 10].map((r) => Math.exp(-r / rate));
    let [bend, body, h2, h3] = [0.012, 1, 0.45, 0.2];
    let ph = 0;
    for (let i = 0; i < count; i++) {
      ph += (TAU * f * (1 + bend)) / rate;
      const a = Math.min(1, i / (0.006 * rate)) * body * Math.min(1, (count - i) / fadeOut);
      const s = Math.sin(ph) + h2 * Math.sin(2 * ph) + h3 * Math.sin(3 * ph);
      add(start + i, 0.5 * vel * a * s, 0);
      bend *= k40;
      body *= k2;
      h2 *= k6;
      h3 *= k10;
    }
    yield;
  }

  // Rhodes: a sine with a decaying self-modulation for the tine's bark, notes rolled a few ms apart
  for (const [bar, beat, beats, vel] of HITS) {
    const at = (bar * 4 + beat) * BEAT;
    for (let k = 0; k < COMP[bar].length; k++) {
      const f = midi(COMP[bar][k]);
      const start = Math.round((at + k * 0.011 + rnd() * 0.008) * rate);
      const hold = beats * BEAT;
      const count = Math.round((hold + 0.25) * rate);
      const v = vel * (0.8 + rnd() * 0.25) * 0.11;
      const holdN = hold * rate;
      const dPh = (TAU * f) / rate;
      const [kBark, kRing, kRel] = [9, 0.9, 22].map((r) => Math.exp(-r / rate));
      let [bark, ring, rel] = [1.1, 1, 1];
      let ph = 0;
      for (let i = 0; i < count; i++) {
        ph += dPh;
        const amp = Math.min(1, i / (0.004 * rate)) * ring * rel;
        add(start + i, v * amp * Math.sin(ph + (0.25 + bark) * Math.sin(ph)), 0.3);
        bark *= kBark;
        ring *= kRing;
        if (i > holdN) rel *= kRel;
      }
      yield;
    }
  }

  // brushes: band-limited noise, swept in a slow circle each beat, a pat on 2 and 4, a swung ghost after
  const aHp = Math.exp((-TAU * 1800) / rate);
  const aLp = 1 - Math.exp((-TAU * 6000) / rate);
  const beatLen = BEAT * rate;
  let hp = 0;
  let lp = 0;
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const w = rnd() * 2 - 1;
    hp = aHp * (hp + w - prev);
    prev = w;
    lp += aLp * (hp - lp);
    const pos = i / beatLen;
    const nb = Math.floor(pos);
    const ph = pos - nb;
    const sw = Math.sin(Math.PI * ph);
    let a = 0.22 + 0.3 * sw * sw;
    if (nb % 2 === 1) {
      // only the first 0.15 s of a pat or ghost is audible; skip the exp after that
      if (ph < 0.18) a += 1.1 * Math.exp(-ph * BEAT * 30);
      else if (ph >= 2 / 3 && ph < 0.85) a += 0.4 * Math.exp(-(ph - 2 / 3) * BEAT * 40);
    }
    add(i, 0.06 * a * lp, -0.35);
    if (i % 20000 === 19999) yield;
  }

  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  if (peak > 0) {
    const k = 0.9 / peak;
    for (let i = 0; i < len; i++) {
      L[i] *= k;
      R[i] *= k;
    }
  }
  return { left: L, right: R };
}

/** Render a record's surface: Poisson clicks, the odd fat pop, faint hiss. Mono, peak 1. */
export function renderVinyl(rate = BED_RATE, sec = VINYL_SECONDS): Float32Array {
  const len = Math.round(sec * rate);
  const d = new Float32Array(len);
  const rnd = seeded(78);

  for (let t = 0; ; ) {
    t += -Math.log(1 - rnd()) / 9; // about 9 clicks a second
    if (t >= sec) break;
    const i0 = Math.floor(t * rate);
    const big = rnd() < 0.08;
    let v = (big ? 0.9 : 0.15 + 0.45 * rnd() ** 2) * (rnd() < 0.5 ? -1 : 1);
    // small clicks ring bright (alternating sign), pops thud (same sign, slower decay)
    const ring = big ? 0.8 : -0.55;
    for (let k = 0; k < (big ? 40 : 12); k++) {
      d[(i0 + k) % len] += v;
      v *= ring;
    }
  }

  let lp = 0;
  for (let i = 0; i < len; i++) {
    lp += 0.35 * (rnd() * 2 - 1 - lp);
    d[i] += 0.025 * lp;
  }

  // DC blocker, run twice around the loop so the seam settles, then normalise
  let x1 = 0;
  let y1 = 0;
  const out = new Float32Array(len);
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < len; i++) {
      const y = d[i] - x1 + 0.995 * y1;
      x1 = d[i];
      y1 = y;
      if (pass === 1) out[i] = y;
    }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < len; i++) out[i] /= peak;
  return out;
}
