"use client";

/**
 * Procedural tiling normal maps for the table (no image assets): woven felt and
 * quilted, stitched leather for the rail. Built once from a height field on a canvas
 * and cached for the life of the page.
 */
import * as THREE from "three";
import { canvas, prng } from "./canvas-utils";

const cache = new Map<string, THREE.CanvasTexture>();

/** Tileable value noise lattice (period `cells`) sampled at (u, v) in 0..1. */
function tileNoise(seed: number, cells: number) {
  const rand = prng(seed);
  const grid = Float32Array.from({ length: cells * cells }, () => rand());
  const at = (i: number, j: number) => grid[((j + cells) % cells) * cells + ((i + cells) % cells)];
  return (u: number, v: number) => {
    const x = u * cells;
    const y = v * cells;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/** Converts a wrapping height field into an RGB normal map texture. */
function normalTexture(key: string, w: number, h: number, height: (x: number, y: number) => number, strength: number, repeat: [number, number]) {
  let t = cache.get(key);
  if (t) return t;
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = height(x, y);
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  const at = (x: number, y: number) => H[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      // canvas rows run top-down while texture v runs bottom-up, so flip the y slope
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * w + x) * 4;
      img.data[o] = ((-dx / l) * 0.5 + 0.5) * 255;
      img.data[o + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      img.data[o + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

/**
 * Felt weave: a fine basket weave softened by fibre fuzz. Tiles every 0.5 table units
 * on the felt cap (whose UVs are raw table coordinates).
 */
export function feltNormalTexture() {
  const S = 512;
  const fuzz = tileNoise(11, 128);
  const clump = tileNoise(12, 16);
  const rand = prng(13);
  const grain = Float32Array.from({ length: S * S }, () => rand());
  const period = 8;
  return normalTexture(
    "felt-normal",
    S,
    S,
    (x, y) => {
      const i = Math.floor(x / period);
      const j = Math.floor(y / period);
      const fx = (x % period) / period;
      const fy = (y % period) / period;
      const thread = (i + j) % 2 === 0 ? Math.sin(Math.PI * fx) : Math.sin(Math.PI * fy);
      const u = x / S;
      const v = y / S;
      return thread * 0.35 + fuzz(u, v) * 0.9 + clump(u, v) * 1.4 + grain[y * S + x] * 0.25;
    },
    1.6,
    [2, 2],
  );
}

/**
 * Rail leather: padded segments divided by a pinched seam with a row of stitches on
 * each side, over a pebbled grain. One tile = one pad (u along the tube, v around it),
 * so it reads the same whichever way the tube's frames face.
 */
export function leatherNormalTexture() {
  const w = 256;
  const h = 512;
  const grain = tileNoise(21, 64);
  const pebble = tileNoise(22, 24);
  return normalTexture(
    "leather-normal",
    w,
    h,
    (x, y) => {
      const u = x / w;
      const v = y / h;
      // pad bulge, pinched to a crease at u = 0 / 1
      const pad = Math.pow(Math.sin(Math.PI * u), 0.45) * 6;
      // stitches: short raised dashes in two rows beside the seam
      let stitch = 0;
      for (const su of [0.075, 0.925]) {
        const du = Math.abs(u - su) * w;
        const phase = (v * 64) % 1;
        if (du < 1.6 && phase > 0.2 && phase < 0.8) stitch = 1.6 * (1 - du / 1.6);
      }
      return pad + stitch + grain(u, v) * 0.9 + pebble(u, v) * 0.6;
    },
    2.2,
    [30, 1],
  );
}
