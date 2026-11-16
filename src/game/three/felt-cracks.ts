"use client";

/**
 * Hairline lava cracks in the felt, hugging the curved player rail.
 *
 * The crack network is generated once (seeded) in table space and painted twice:
 * as faint charred lines into the felt colour map (felt-texture.ts) and as a glowing
 * emissive mask (crackMaskTexture) that table-body.tsx scales with session heat.
 * The front sector holding the betting circle and the lettering arcs are kept clear.
 */
import * as THREE from "three";
import { canvas, prng, TABLE } from "./canvas-utils";

export interface Crack {
  /** polyline in table space (x, z) */
  pts: [number, number][];
  /** relative stroke width, 1 = main crack */
  w: number;
}

const { halfWidth: W, halfDepth: D } = TABLE;
/** the curved edge is a half ellipse centred on the dealer edge */
const RX = W;
const RZ = D * 2;

/** Approximate distance from (x, z) inward to the curved felt edge (negative = outside). */
export function edgeDistance(x: number, z: number) {
  const ex = x / RX;
  const ez = (z + D) / RZ;
  const r = Math.hypot(ex, ez);
  const th = Math.atan2(ez, ex);
  const R = Math.hypot(RX * Math.cos(th), RZ * Math.sin(th));
  return (1 - r) * R;
}

const BET = { x: 0, z: 2.02, clear: 0.78 };
const BAND = { min: 0.12, max: 0.6 };

function blocked(x: number, z: number) {
  if (z < -D + 0.06) return true;
  if (Math.hypot(x - BET.x, z - BET.z) < BET.clear) return true;
  const d = edgeDistance(x, z);
  return d < BAND.min * 0.8 || d > BAND.max;
}

let cached: Crack[] | null = null;

export function crackNetwork(): Crack[] {
  if (cached) return cached;
  const rand = prng(1337);
  const out: Crack[] = [];

  const walk = (x: number, z: number, dx: number, dz: number, steps: number, w: number, depth: number) => {
    const pts: [number, number][] = [[x, z]];
    for (let s = 0; s < steps; s++) {
      // wander, with a gentle pull back toward the band centre
      const turn = (rand() - 0.5) * 0.9;
      const c = Math.cos(turn);
      const sn = Math.sin(turn);
      [dx, dz] = [dx * c - dz * sn, dx * sn + dz * c];
      const len = 0.03 + rand() * 0.035;
      const nx = x + dx * len;
      const nz = z + dz * len;
      if (blocked(nx, nz)) break;
      x = nx;
      z = nz;
      pts.push([x, z]);
      if (depth < 2 && rand() < 0.16) {
        const side = rand() > 0.5 ? 1 : -1;
        const a = side * (0.5 + rand() * 0.6);
        walk(x, z, dx * Math.cos(a) - dz * Math.sin(a), dx * Math.sin(a) + dz * Math.cos(a), 3 + Math.floor(rand() * 7), w * 0.6, depth + 1);
      }
    }
    if (pts.length > 1) out.push({ pts, w });
  };

  const seeds = 46;
  for (let i = 0; i < seeds; i++) {
    // stratified around the arc so the cracks spread evenly, skipping the front sector
    const a = 0.08 + ((i + rand()) / seeds) * (Math.PI - 0.16);
    if (Math.abs(a - Math.PI / 2) < 0.4) continue;
    const ex = RX * Math.cos(a);
    const ez = -D + RZ * Math.sin(a);
    let nx = -Math.cos(a) / RX;
    let nz = -Math.sin(a) / RZ;
    const nl = Math.hypot(nx, nz);
    nx /= nl;
    nz /= nl;
    const start = BAND.min + 0.01 + rand() * 0.05;
    const tilt = (rand() - 0.5) * 1.6;
    const dx = nx * Math.cos(tilt) - nz * Math.sin(tilt);
    const dz = nx * Math.sin(tilt) + nz * Math.cos(tilt);
    walk(ex + nx * start, ez + nz * start, dx, dz, 6 + Math.floor(rand() * 10), 0.75 + rand() * 0.5, 0);
  }
  cached = out;
  return out;
}

/** Strokes the crack network onto a canvas whose pixels map table (x, z) via px. */
export function strokeCracks(g: CanvasRenderingContext2D, px: number, style: string, width: number) {
  g.strokeStyle = style;
  g.lineCap = "round";
  g.lineJoin = "round";
  // Batch cracks into a few paths by (quantised) line width: one stroke per bucket, so a
  // shadowBlur is computed ~10 times instead of once per crack (hundreds), which made
  // painting the felt block the main thread for a few hundred ms on first open.
  const buckets = new Map<number, Path2D>();
  for (const c of crackNetwork()) {
    const lw = Math.max(0.6, Math.round(width * c.w * 2) / 2);
    let path = buckets.get(lw);
    if (!path) buckets.set(lw, (path = new Path2D()));
    c.pts.forEach(([x, z], i) => {
      const X = (x + W) * px;
      const Y = (z + D) * px;
      if (i === 0) path.moveTo(X, Y);
      else path.lineTo(X, Y);
    });
  }
  for (const [lw, path] of buckets) {
    g.lineWidth = lw;
    g.stroke(path);
  }
}

let mask: THREE.CanvasTexture | null = null;

/**
 * Emissive mask for the cracks: black everywhere, orange halo, yellow-white core.
 * Uses the same UV layout as the felt colour map (whole table, dealer edge on top).
 */
export function crackMaskTexture() {
  if (mask) return mask;
  const P = 160;
  const [c, g] = canvas(Math.round(W * 2 * P), Math.round(D * 2 * P));
  g.fillStyle = "#000";
  g.fillRect(0, 0, c.width, c.height);
  g.shadowColor = "#ff3a00";
  g.shadowBlur = 9;
  strokeCracks(g, P, "rgba(255,70,12,0.55)", 4.5);
  g.shadowBlur = 0;
  strokeCracks(g, P, "rgba(255,150,50,1)", 1.8);
  strokeCracks(g, P, "rgba(255,236,190,1)", 0.75);
  mask = new THREE.CanvasTexture(c);
  mask.colorSpace = THREE.SRGBColorSpace;
  mask.anisotropy = 8;
  return mask;
}
