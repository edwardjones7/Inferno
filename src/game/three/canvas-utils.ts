"use client";

/**
 * Shared helpers for painting textures on a 2D canvas at runtime (no image assets).
 * Textures are cached by key for the life of the page.
 */
import * as THREE from "three";

export const TABLE = { halfWidth: 4.2, halfDepth: 2.6 } as const;
export const CARD = { w: 0.64, h: 0.9 } as const;

const cache = new Map<string, THREE.Texture>();

function fontFamily(varName: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}
export const display = () => fontFamily("--font-display", "serif");
export const sans = () => fontFamily("--font-manrope", "sans-serif");

export function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

export function texture(key: string, draw: () => HTMLCanvasElement, anisotropy = 8) {
  let t = cache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(draw());
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropy;
    cache.set(key, t);
  }
  return t;
}

/** Small deterministic PRNG so painted noise is stable between renders. */
export function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

