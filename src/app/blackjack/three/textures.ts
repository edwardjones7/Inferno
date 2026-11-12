"use client";

/**
 * Every surface in the 3D table is painted at runtime on a 2D canvas, so there are no
 * image assets to ship. Textures are cached for the life of the page.
 */
import * as THREE from "three";
import { isRed, RANK_LABEL, rankOf, SUIT_SYMBOL, suitOf, type Card } from "@/lib/blackjack/cards";

export const TABLE = { halfWidth: 4.2, halfDepth: 2.6 } as const;
export const CARD = { w: 0.64, h: 0.9 } as const;

const FLAME =
  "M16.6 1.5c.9 4.6-1.4 7-3.6 9.6-2 2.3-4.2 4.7-4.2 8.6 0 2.5 1 4.6 2.6 6-1-2.9.4-5.2 2.3-6.8-.2 2.6.9 4 2.6 4.8-.6-3.1 1.2-5.5 3.3-7.3.3 3.4 3.4 4.6 3.4 8.5 0 .3 0 .6-.1.8 1.6-1.4 2.6-3.5 2.6-5.9 0-5.4-4-8.2-5.6-12.2-.9-2.2-1.4-4-3.3-6.1Z";

const cache = new Map<string, THREE.Texture>();

function fontFamily(varName: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}
const display = () => fontFamily("--font-unbounded", "sans-serif");
const sans = () => fontFamily("--font-manrope", "sans-serif");

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function texture(key: string, draw: () => HTMLCanvasElement, anisotropy = 8) {
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
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/* ------------------------------------------------------------------ cards */

export function cardFace(card: Card) {
  return texture(`card:${card}`, () => {
    const [c, g] = canvas(384, 540);
    const ink = isRed(card) ? "#d9310c" : "#17110d";
    const rank = RANK_LABEL(rankOf(card));
    const suit = SUIT_SYMBOL[suitOf(card)];

    const bg = g.createLinearGradient(0, 0, 384, 540);
    bg.addColorStop(0, "#fffaf2");
    bg.addColorStop(0.55, "#f6ecdf");
    bg.addColorStop(1, "#e8d5c0");
    g.fillStyle = bg;
    g.fillRect(0, 0, 384, 540);

    const corner = (flip: boolean) => {
      g.save();
      if (flip) {
        g.translate(384, 540);
        g.rotate(Math.PI);
      }
      g.fillStyle = ink;
      g.textAlign = "center";
      g.font = `800 104px ${display()}`;
      g.fillText(rank, 66, 112);
      g.font = `84px ${sans()}`;
      g.fillText(suit, 66, 196);
      g.restore();
    };
    corner(false);
    corner(true);

    if (["J", "Q", "K"].includes(rankOf(card))) {
      // court cards: an ember frame with the letter, instead of a lone pip
      g.strokeStyle = isRed(card) ? "rgba(217,49,12,.55)" : "rgba(23,17,13,.5)";
      g.lineWidth = 5;
      roundRect(g, 124, 130, 150, 290, 18);
      g.stroke();
      g.fillStyle = isRed(card) ? "rgba(255,90,31,.10)" : "rgba(23,17,13,.06)";
      g.fill();
      g.fillStyle = ink;
      g.textAlign = "center";
      g.font = `900 140px ${display()}`;
      g.fillText(rank, 199, 320);
      g.font = `64px ${sans()}`;
      g.fillText(suit, 199, 398);
    } else {
      g.fillStyle = ink;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `230px ${sans()}`;
      g.fillText(suit, 200, 300);
    }
    return c;
  });
}

export function cardBack() {
  return texture("card:back", () => {
    const [c, g] = canvas(384, 540);
    const bg = g.createRadialGradient(192, 310, 10, 192, 290, 360);
    bg.addColorStop(0, "#ff5a1f");
    bg.addColorStop(0.35, "#b3200c");
    bg.addColorStop(0.85, "#3d0805");
    g.fillStyle = bg;
    g.fillRect(0, 0, 384, 540);

    g.save();
    roundRect(g, 22, 22, 340, 496, 22);
    g.clip();
    g.strokeStyle = "rgba(255,194,75,.16)";
    g.lineWidth = 3;
    for (let i = -540; i < 900; i += 22) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 540, 540);
      g.moveTo(i + 540, 0);
      g.lineTo(i, 540);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = "rgba(255,194,75,.6)";
    g.lineWidth = 4;
    roundRect(g, 22, 22, 340, 496, 22);
    g.stroke();

    g.save();
    g.translate(192 - 64, 270 - 64);
    g.scale(4, 4);
    g.shadowColor = "#ffc24b";
    g.shadowBlur = 6;
    g.fillStyle = "#ffe1a1";
    g.fill(new Path2D(FLAME));
    g.restore();
    return c;
  });
}

/* ------------------------------------------------------------------ chips */

export const CHIP_STYLE: Record<number, { base: string; edge: string; text: string }> = {
  1: { base: "#ddd0c3", edge: "#8f7b6c", text: "#1e1611" },
  5: { base: "#e5360f", edge: "#ffc24b", text: "#fff3df" },
  25: { base: "#1f6f4a", edge: "#ffe1a1", text: "#fff3df" },
  100: { base: "#17110d", edge: "#ff9a2e", text: "#ffc24b" },
  500: { base: "#5b2a86", edge: "#ffc24b", text: "#fff3df" },
  1000: { base: "#ffc24b", edge: "#b3200c", text: "#3d0805" },
};

export function chipTop(value: number) {
  return texture(`chip-top:${value}`, () => {
    const s = CHIP_STYLE[value] ?? CHIP_STYLE[100];
    const [c, g] = canvas(256, 256);
    g.fillStyle = s.base;
    g.fillRect(0, 0, 256, 256);
    // edge inserts
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate(128, 128);
      g.rotate((i / 8) * Math.PI * 2);
      g.fillStyle = s.edge;
      g.fillRect(-14, -128, 28, 34);
      g.restore();
    }
    g.beginPath();
    g.arc(128, 128, 84, 0, Math.PI * 2);
    g.fillStyle = s.base;
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = s.edge;
    g.stroke();
    g.setLineDash([6, 8]);
    g.lineWidth = 3;
    g.beginPath();
    g.arc(128, 128, 70, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = s.text;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const label = value >= 1000 ? `${value / 1000}K` : String(value);
    g.font = `800 ${label.length > 2 ? 54 : 66}px ${display()}`;
    g.fillText(label, 128, 132);
    return c;
  });
}

export function chipSide(value: number) {
  return texture(
    `chip-side:${value}`,
    () => {
      const s = CHIP_STYLE[value] ?? CHIP_STYLE[100];
      const [c, g] = canvas(256, 16);
      g.fillStyle = s.base;
      g.fillRect(0, 0, 256, 16);
      g.fillStyle = s.edge;
      for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 4, 0, 12, 16);
      return c;
    },
    2,
  );
}

/* ------------------------------------------------------------------ felt */

/** Maps table-space (x, z) to felt canvas pixels. */
export const FELT_PX = 256;
export const feltX = (x: number) => (x + TABLE.halfWidth) * FELT_PX;
export const feltY = (z: number) => (z + TABLE.halfDepth) * FELT_PX;

function arcText(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, r: number, spacing: number) {
  const widths = [...text].map((ch) => g.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  let theta = -total / r / 2;
  for (let i = 0; i < text.length; i++) {
    const w = widths[i] - spacing;
    const mid = theta + w / 2 / r;
    g.save();
    g.translate(cx + r * Math.sin(mid), cy + r * Math.cos(mid));
    g.rotate(-mid);
    g.fillText(text[i], 0, 0);
    g.restore();
    theta += widths[i] / r;
  }
}

export function feltTexture() {
  return texture("felt", () => {
    const W = TABLE.halfWidth * 2 * FELT_PX;
    const H = TABLE.halfDepth * 2 * FELT_PX;
    const [c, g] = canvas(W, H);
    const cx = W / 2;
    const top = 0; // dealer edge

    const bg = g.createRadialGradient(cx, H * 0.45, 40, cx, H * 0.45, W * 0.62);
    bg.addColorStop(0, "#4a1a0e");
    bg.addColorStop(0.45, "#2a100a");
    bg.addColorStop(1, "#120806");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // felt fibres
    const rand = prng(7);
    for (let i = 0; i < 26000; i++) {
      g.fillStyle = rand() > 0.5 ? "rgba(255,140,80,0.035)" : "rgba(0,0,0,0.08)";
      g.fillRect(rand() * W, rand() * H, 1.5, 1.5);
    }

    // heat bleeding in from the player rail
    const heat = g.createRadialGradient(cx, H * 1.15, 40, cx, H * 1.15, H * 0.9);
    heat.addColorStop(0, "rgba(255,90,31,0.28)");
    heat.addColorStop(1, "rgba(255,90,31,0)");
    g.fillStyle = heat;
    g.fillRect(0, 0, W, H);

    const P = FELT_PX;
    // printed arcs and lettering, centred on the dealer edge
    g.strokeStyle = "rgba(255,154,46,0.45)";
    g.lineWidth = 3;
    for (const r of [2.35, 3.3]) {
      g.beginPath();
      g.arc(cx, top, r * P, Math.PI * 0.2, Math.PI * 0.8);
      g.stroke();
    }

    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "rgba(255,170,70,0.85)";
    g.shadowColor = "rgba(255,90,31,0.8)";
    g.shadowBlur = 14;
    g.font = `800 64px ${display()}`;
    arcText(g, "BLACKJACK PAYS 3 TO 2", cx, top, 2.85 * P, 14);
    g.shadowBlur = 0;
    g.fillStyle = "rgba(221,208,195,0.42)";
    g.font = `700 34px ${sans()}`;
    arcText(g, "DEALER STANDS ON ALL 17s  ·  INSURANCE PAYS 2 TO 1", cx, top, 2.55 * P, 9);

    // betting circle
    g.save();
    g.strokeStyle = "rgba(255,122,31,0.9)";
    g.shadowColor = "#ff5a1f";
    g.shadowBlur = 24;
    g.lineWidth = 7;
    g.beginPath();
    g.arc(feltX(0), feltY(2.02), 0.42 * P, 0, Math.PI * 2);
    g.stroke();
    g.shadowBlur = 0;
    g.lineWidth = 2;
    g.strokeStyle = "rgba(255,194,75,0.4)";
    g.beginPath();
    g.arc(feltX(0), feltY(2.02), 0.5 * P, 0, Math.PI * 2);
    g.stroke();
    g.restore();

    return c;
  });
}
