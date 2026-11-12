"use client";

import { canvas, display, prng, texture } from "./canvas-utils";

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
    // clay grain
    const rnd = prng(value * 17 + 3);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
      g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
    }
    // soft darkening toward the rim
    const rim = g.createRadialGradient(128, 128, 96, 128, 128, 128);
    rim.addColorStop(0, "rgba(0,0,0,0)");
    rim.addColorStop(1, "rgba(0,0,0,0.22)");
    g.fillStyle = rim;
    g.fillRect(0, 0, 256, 256);
    return c;
  });
}

export function chipSide(value: number) {
  return texture(
    `chip-side:${value}`,
    () => {
      const s = CHIP_STYLE[value] ?? CHIP_STYLE[100];
      const W = 512;
      const H = 32;
      const [c, g] = canvas(W, H);
      g.fillStyle = s.base;
      g.fillRect(0, 0, W, H);
      // 8 edge inlays, each split into three bars like a moulded clay chip
      g.fillStyle = s.edge;
      for (let i = 0; i < 8; i++) {
        const x0 = i * (W / 8) + 10;
        for (let k = 0; k < 3; k++) g.fillRect(x0 + k * 9, 3, 6, H - 6);
      }
      // fine speckle so the edge doesn't read as flat plastic
      const rnd = prng(value * 31 + 7);
      for (let i = 0; i < 260; i++) {
        g.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
        g.fillRect(rnd() * W, rnd() * H, 2, 2);
      }
      // rolled-over rim: darker toward the faces
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "rgba(0,0,0,0.28)");
      grad.addColorStop(0.18, "rgba(0,0,0,0)");
      grad.addColorStop(0.5, "rgba(255,255,255,0.06)");
      grad.addColorStop(0.82, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.28)");
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      return c;
    },
    4,
  );
}
