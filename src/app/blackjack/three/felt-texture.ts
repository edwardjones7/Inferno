"use client";

import { canvas, display, prng, sans, TABLE, texture } from "./canvas-utils";
import { strokeCracks } from "./felt-cracks";

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
      g.fillRect(rand() * W, rand() * H, 1.5 * K, 1.5 * K);
    }

    // heat bleeding in from the player rail
    const heat = g.createRadialGradient(cx, H * 1.15, 40, cx, H * 1.15, H * 0.9);
    heat.addColorStop(0, "rgba(255,90,31,0.28)");
    heat.addColorStop(1, "rgba(255,90,31,0)");
    g.fillStyle = heat;
    g.fillRect(0, 0, W, H);

    // scorched lines under the lava cracks (their glow is an emissive map in table-body)
    g.shadowColor = "rgba(0,0,0,0.6)";
    g.shadowBlur = 6 * K;
    strokeCracks(g, FELT_PX, "rgba(14,4,2,0.5)", 3.2 * K);
    g.shadowBlur = 0;
    strokeCracks(g, FELT_PX, "rgba(120,30,8,0.55)", 1.1 * K);

    const P = FELT_PX;
    // printed arcs and lettering, centred on the dealer edge
    g.strokeStyle = "rgba(255,154,46,0.45)";
    g.lineWidth = 3 * K;
    for (const r of [2.35, 3.3]) {
      g.beginPath();
      g.arc(cx, top, r * P, Math.PI * 0.2, Math.PI * 0.8);
      g.stroke();
    }

    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "rgba(255,170,70,0.85)";
    g.shadowColor = "rgba(255,90,31,0.8)";
    g.shadowBlur = 14 * K;
    g.font = `800 ${Math.round(64 * K)}px ${display()}`;
    arcText(g, "BLACKJACK PAYS 3 TO 2", cx, top, 2.85 * P, 14 * K);
    g.shadowBlur = 0;
    g.fillStyle = "rgba(221,208,195,0.42)";
    g.font = `700 ${Math.round(34 * K)}px ${sans()}`;
    arcText(g, "DEALER STANDS ON ALL 17s  ·  INSURANCE PAYS 2 TO 1", cx, top, 2.55 * P, 9 * K);

    // betting circle
    g.save();
    g.strokeStyle = "rgba(255,122,31,0.9)";
    g.shadowColor = "#ff5a1f";
    g.shadowBlur = 24 * K;
    g.lineWidth = 7 * K;
    g.beginPath();
    g.arc(feltX(0), feltY(2.02), 0.42 * P, 0, Math.PI * 2);
    g.stroke();
    g.shadowBlur = 0;
    g.lineWidth = 2 * K;
    g.strokeStyle = "rgba(255,194,75,0.4)";
    g.beginPath();
    g.arc(feltX(0), feltY(2.02), 0.5 * P, 0, Math.PI * 2);
    g.stroke();
    g.restore();

    return c;
  });
}
