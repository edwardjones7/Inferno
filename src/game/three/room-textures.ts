"use client";

/**
 * Small procedural textures for the back room around the tables (no image assets):
 * plank floor, a wall of dark wood panelling under old brick, and a window with the
 * blinds drawn. Painted once on a canvas and cached for the life of the page.
 */
import * as THREE from "three";
import { canvas, prng, texture } from "./canvas-utils";

function tiled(t: THREE.Texture, x: number, y: number) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(x, y);
  return t;
}

/** Dark, worn plank floor. One tile is 4 planks wide. */
export function floorTexture() {
  return texture("room-floor", () => {
    const S = 512;
    const [c, g] = canvas(S, S);
    const rand = prng(0xf100);
    const plank = S / 4;
    for (let i = 0; i < 4; i++) {
      // each plank: its own tone, a staggered butt joint, and grain streaks
      const tone = 20 + rand() * 10;
      g.fillStyle = `rgb(${tone + 12}, ${tone + 3}, ${tone - 6})`;
      g.fillRect(i * plank, 0, plank, S);
      for (let k = 0; k < 70; k++) {
        const x = i * plank + rand() * plank;
        g.strokeStyle = rand() > 0.5 ? "rgba(0,0,0,0.22)" : "rgba(120,80,50,0.08)";
        g.lineWidth = 0.6 + rand() * 1.6;
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + (rand() - 0.5) * 6, S * 0.33, x + (rand() - 0.5) * 6, S * 0.66, x + (rand() - 0.5) * 4, S);
        g.stroke();
      }
      const joint = rand() * S;
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.fillRect(i * plank, joint, plank, 2);
      g.fillStyle = "rgba(0,0,0,0.7)";
      g.fillRect(i * plank, 0, 2, S);
    }
    return c;
  }, 4);
}

export const floorMap = () => tiled(floorTexture(), 28, 28);

/**
 * The wall: brick above a dado rail, raised wood panels below. The canvas spans the full
 * wall height (WALL_H world units) and 4 world units of width.
 */
export const WALL_H = 7;
export function wallTexture() {
  return texture("room-wall", () => {
    const W = 512;
    const H = Math.round((W / 4) * WALL_H);
    const [c, g] = canvas(W, H);
    const rand = prng(0xb81c);
    const px = W / 4; // per world unit
    const dado = H - 1.55 * px; // dado rail height from the floor (canvas y grows down)

    // mortar
    g.fillStyle = "#1a120e";
    g.fillRect(0, 0, W, dado);
    // brick courses
    const bh = 0.17 * px;
    const bw = 0.5 * px;
    for (let row = 0, y = 0; y < dado; row++, y += bh) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -off; x < W; x += bw) {
        const r = 58 + rand() * 30;
        const gg = 30 + rand() * 14;
        const b = 22 + rand() * 10;
        const soot = rand() < 0.25 ? 0.55 : 1;
        g.fillStyle = `rgb(${Math.round(r * soot)}, ${Math.round(gg * soot)}, ${Math.round(b * soot)})`;
        g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
        // pitting
        for (let k = 0; k < 6; k++) {
          g.fillStyle = `rgba(0,0,0,${0.1 + rand() * 0.2})`;
          g.fillRect(x + rand() * bw, y + rand() * bh, 2 + rand() * 3, 1 + rand() * 2);
        }
      }
    }
    // grime: darker toward the top (smoke-stained) and in patches
    const stain = g.createLinearGradient(0, 0, 0, dado);
    stain.addColorStop(0, "rgba(8,5,3,0.75)");
    stain.addColorStop(1, "rgba(8,5,3,0.05)");
    g.fillStyle = stain;
    g.fillRect(0, 0, W, dado);

    // dado rail
    g.fillStyle = "#2a170c";
    g.fillRect(0, dado - 0.07 * px, W, 0.1 * px);
    g.fillStyle = "rgba(255,200,140,0.12)";
    g.fillRect(0, dado - 0.07 * px, W, 2);

    // panelling
    g.fillStyle = "#1f120a";
    g.fillRect(0, dado + 0.03 * px, W, H - dado);
    for (let k = 0; k < 220; k++) {
      g.strokeStyle = rand() > 0.5 ? "rgba(0,0,0,0.25)" : "rgba(140,80,40,0.07)";
      g.lineWidth = 0.8 + rand();
      const y = dado + rand() * (H - dado);
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(W * 0.3, y + (rand() - 0.5) * 8, W * 0.6, y + (rand() - 0.5) * 8, W, y + (rand() - 0.5) * 6);
      g.stroke();
    }
    // two raised panels per tile: dark recess, lit top bevel, shadowed bottom bevel
    const pw = W / 2;
    for (let i = 0; i < 2; i++) {
      const x = i * pw + 0.12 * px;
      const y = dado + 0.2 * px;
      const w = pw - 0.24 * px;
      const h = H - dado - 0.5 * px;
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(x, y, w, h);
      g.fillStyle = "#26160c";
      g.fillRect(x + 6, y + 6, w - 12, h - 12);
      g.fillStyle = "rgba(255,190,130,0.09)";
      g.fillRect(x, y, w, 3);
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillRect(x, y + h - 3, w, 3);
    }
    // skirting
    g.fillStyle = "#120a06";
    g.fillRect(0, H - 0.2 * px, W, 0.2 * px);
    return c;
  }, 4);
}

/** Night outside, seen through half-open blinds: cool streetlight between dark slats. */
export function blindsTexture() {
  return texture("room-blinds", () => {
    const W = 256;
    const H = 384;
    const [c, g] = canvas(W, H);
    const sky = g.createLinearGradient(0, 0, W, H);
    sky.addColorStop(0, "#9fb4d0");
    sky.addColorStop(0.55, "#5d7090");
    sky.addColorStop(1, "#2a3448");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // a warm sign glowing somewhere across the street
    const sign = g.createRadialGradient(W * 0.72, H * 0.3, 4, W * 0.72, H * 0.3, W * 0.5);
    sign.addColorStop(0, "rgba(255,150,70,0.65)");
    sign.addColorStop(1, "rgba(255,150,70,0)");
    g.fillStyle = sign;
    g.fillRect(0, 0, W, H);
    // slats
    const n = 22;
    const step = H / n;
    for (let i = 0; i < n; i++) {
      const y = i * step;
      g.fillStyle = "#0d0907";
      g.fillRect(0, y, W, step * 0.62);
      g.fillStyle = "rgba(255,230,200,0.10)";
      g.fillRect(0, y + step * 0.62 - 2, W, 2);
    }
    // cords
    g.fillStyle = "#0d0907";
    g.fillRect(W * 0.25, 0, 3, H);
    g.fillRect(W * 0.75, 0, 3, H);
    return c;
  }, 4);
}

/** Soft slatted light falling from the window (additive decal). */
export function blindsShaftTexture() {
  return texture("room-blinds-shaft", () => {
    const W = 128;
    const H = 256;
    const [c, g] = canvas(W, H);
    const n = 22;
    const step = H / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = "rgba(150,175,215,1)";
      g.fillRect(0, i * step + step * 0.62, W, step * 0.38);
    }
    // fade toward the edges so the decal has no hard border
    g.globalCompositeOperation = "destination-in";
    const fx = g.createLinearGradient(0, 0, W, 0);
    fx.addColorStop(0, "rgba(0,0,0,0)");
    fx.addColorStop(0.25, "rgba(0,0,0,1)");
    fx.addColorStop(0.75, "rgba(0,0,0,1)");
    fx.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = fx;
    g.fillRect(0, 0, W, H);
    const fy = g.createLinearGradient(0, 0, 0, H);
    fy.addColorStop(0, "rgba(0,0,0,0.9)");
    fy.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = fy;
    g.fillRect(0, 0, W, H);
    return c;
  }, 1);
}

/** Radial falloff sprite for glows (sconce halos, light pools). */
export function glowTexture() {
  return texture("room-glow", () => {
    const [c, g] = canvas(128, 128);
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.25, "rgba(255,255,255,0.35)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    return c;
  }, 1);
}
