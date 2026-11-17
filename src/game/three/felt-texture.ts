"use client";

import { FELT_LOOKS, type FeltLook } from "@/game/designs/felt-looks";
import { DEFAULT_FELT, type FeltId } from "@/lib/cosmetics";
import { canvas, display, prng, sans, TABLE, texture } from "./canvas-utils";

/* ------------------------------------------------------------------ felt */

/** Maps table-space (x, z) to felt canvas pixels (keeps the canvas under 2048px wide). */
export const FELT_PX = 240;
/** sizes below were tuned at 256px per unit */
const K = FELT_PX / 256;
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

/**
 * The cloth: an even nap with a slight falloff toward the edges (the lamp does the real
 * lighting), a little mottling and fine fibres, in the colours of the table design.
 */
export function paintBaize(g: CanvasRenderingContext2D, W: number, H: number, cx: number, cy: number, seed: number, k = 1, look: FeltLook = FELT_LOOKS[DEFAULT_FELT]) {
  const bg = g.createRadialGradient(cx, cy, 40, cx, cy, Math.max(W, H) * 0.62);
  bg.addColorStop(0, look.cloth[0]);
  bg.addColorStop(0.55, look.cloth[1]);
  bg.addColorStop(1, look.cloth[2]);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const rand = prng(seed);
  // soft mottling where the nap lies differently
  for (let i = 0; i < 40; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = (60 + rand() * 160) * k;
    const m = g.createRadialGradient(x, y, 0, x, y, r);
    const tone = rand() > 0.5 ? look.mottle[0] : look.mottle[1];
    m.addColorStop(0, `rgba(${tone},0.035)`);
    m.addColorStop(1, `rgba(${tone},0)`);
    g.fillStyle = m;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // fibres
  const n = Math.round((W * H) / 90);
  for (let i = 0; i < n; i++) {
    g.fillStyle = rand() > 0.5 ? look.fibre[0] : look.fibre[1];
    g.fillRect(rand() * W, rand() * H, 1.5 * k, 1.5 * k);
  }
}

export interface FeltPrint {
  /** "3 TO 2" or "6 TO 5" */
  payout: string;
  dealerHitsSoft17: boolean;
}
const DEFAULT_PRINT: FeltPrint = { payout: "3 TO 2", dealerHitsSoft17: false };

/** The blackjack layout printed on the cloth of the given table design (cached per design and rules). */
export function feltTexture(print: FeltPrint = DEFAULT_PRINT, design: FeltId = DEFAULT_FELT) {
  const look = FELT_LOOKS[design];
  const ink = look.print;
  return texture(`felt:${design}:${print.payout}:${print.dealerHitsSoft17 ? "h17" : "s17"}`, () => {
    const W = TABLE.halfWidth * 2 * FELT_PX;
    const H = TABLE.halfDepth * 2 * FELT_PX;
    const [c, g] = canvas(W, H);
    const cx = W / 2;
    const top = 0; // dealer edge

    paintBaize(g, W, H, cx, H * 0.45, 7, K, look);

    const P = FELT_PX;
    // printed arcs and lettering, centred on the dealer edge
    g.strokeStyle = ink.line;
    g.lineWidth = 3 * K;
    for (const r of [2.35, 3.3]) {
      g.beginPath();
      g.arc(cx, top, r * P, Math.PI * 0.2, Math.PI * 0.8);
      g.stroke();
    }

    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = ink.gold;
    g.font = `800 ${Math.round(64 * K)}px ${display()}`;
    arcText(g, `BLACKJACK PAYS ${print.payout}`, cx, top, 2.85 * P, 14 * K);
    g.fillStyle = ink.cream;
    g.font = `700 ${Math.round(34 * K)}px ${sans()}`;
    arcText(g, `${print.dealerHitsSoft17 ? "DEALER HITS SOFT 17" : "DEALER STANDS ON ALL 17s"}  ·  INSURANCE PAYS 2 TO 1`, cx, top, 2.55 * P, 9 * K);

    // betting circle: a gold ring with a fine inner line, printed into the cloth
    g.save();
    g.strokeStyle = ink.ring;
    g.lineWidth = 7 * K;
    g.beginPath();
    g.arc(feltX(0), feltY(2.02), 0.42 * P, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 2 * K;
    g.strokeStyle = ink.line;
    g.beginPath();
    g.arc(feltX(0), feltY(2.02), 0.5 * P, 0, Math.PI * 2);
    g.stroke();
    g.restore();

    return c;
  });
}
