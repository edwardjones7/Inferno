import type { CardBackId } from "@/lib/cosmetics";

/**
 * Card back painters. Plain canvas 2D (no three.js), so the same art drives the 3D card
 * texture, the 2D cards and the picker swatches. Each design is drawn in a 384×540 frame
 * and scaled to the target; every design is symmetric under a half turn, like a real deck.
 */
export const BACK_W = 384;
export const BACK_H = 540;

/** The Inferno flame, in a 32×32 box. */
export const FLAME =
  "M16.6 1.5c.9 4.6-1.4 7-3.6 9.6-2 2.3-4.2 4.7-4.2 8.6 0 2.5 1 4.6 2.6 6-1-2.9.4-5.2 2.3-6.8-.2 2.6.9 4 2.6 4.8-.6-3.1 1.2-5.5 3.3-7.3.3 3.4 3.4 4.6 3.4 8.5 0 .3 0 .6-.1.8 1.6-1.4 2.6-3.5 2.6-5.9 0-5.4-4-8.2-5.6-12.2-.9-2.2-1.4-4-3.3-6.1Z";

const CX = BACK_W / 2;
const CY = BACK_H / 2;

type G = CanvasRenderingContext2D;

function rr(g: G, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** Brass/gold as a vertical lamp-lit gradient across the given span. */
function metal(g: G, y0: number, y1: number, tones: readonly [string, string, string]) {
  const m = g.createLinearGradient(0, y0, 0, y1);
  m.addColorStop(0, tones[0]);
  m.addColorStop(0.5, tones[1]);
  m.addColorStop(1, tones[2]);
  return m;
}

const BRASS = ["#f0d79a", "#c49a52", "#8a6528"] as const;
const GOLD = ["#fbe6a6", "#d8aa4c", "#94661c"] as const;

/** The flame, centred on (x, y), `size` px tall. */
function flame(g: G, x: number, y: number, size: number, fill: string | CanvasGradient) {
  g.save();
  g.translate(x - size / 2, y - size / 2);
  g.scale(size / 32, size / 32);
  g.fillStyle = fill;
  g.fill(new Path2D(FLAME));
  g.restore();
}

/** Rays from (x, y) between radii, `n` of them, each `width` radians wide, starting at `a0`. */
function rays(g: G, x: number, y: number, r0: number, r1: number, n: number, width: number, a0 = 0, span = Math.PI * 2) {
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = a0 + (span * (i + 0.5)) / n;
    g.moveTo(x + Math.cos(a - width / 2) * r0, y + Math.sin(a - width / 2) * r0);
    g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    g.lineTo(x + Math.cos(a + width / 2) * r0, y + Math.sin(a + width / 2) * r0);
    g.closePath();
  }
}

/** Fine paper speckle so the print doesn't read as flat plastic. */
function speckle(g: G, seed: number, n: number, light: string, dark: string) {
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n; i++) {
    g.fillStyle = rnd() > 0.5 ? light : dark;
    g.fillRect(rnd() * BACK_W, rnd() * BACK_H, 1 + rnd() * 1.5, 1);
  }
}

/** Do `draw` once, then again turned half way round the centre (card backs read both ways up). */
function twice(g: G, draw: () => void) {
  draw();
  g.save();
  g.translate(BACK_W, BACK_H);
  g.rotate(Math.PI);
  draw();
  g.restore();
}

/* ------------------------------------------------------------------ House (free) */

/** Oxblood with a fine brass lattice, a faint sunburst, deco fans in the corners and the flame. */
function paintHouse(g: G) {
  // a cream margin, like a printed deck, so the oxblood card still reads on the red felt
  g.fillStyle = "#efe4cf";
  g.fillRect(0, 0, BACK_W, BACK_H);
  const bg = g.createRadialGradient(CX, CY, 20, CX, CY, 330);
  bg.addColorStop(0, "#74201a");
  bg.addColorStop(0.55, "#4d110d");
  bg.addColorStop(1, "#250605");
  g.fillStyle = bg;
  rr(g, 13, 13, BACK_W - 26, BACK_H - 26, 16);
  g.fill();

  const x0 = 26;
  const y0 = 26;
  const w = BACK_W - 52;
  const h = BACK_H - 52;

  g.save();
  rr(g, x0, y0, w, h, 14);
  g.clip();
  // diamond lattice
  g.strokeStyle = "rgba(214,176,104,0.17)";
  g.lineWidth = 1.4;
  g.beginPath();
  for (let i = -BACK_H; i < BACK_W + BACK_H; i += 20) {
    g.moveTo(i, 0);
    g.lineTo(i + BACK_H, BACK_H);
    g.moveTo(i + BACK_H, 0);
    g.lineTo(i, BACK_H);
  }
  g.stroke();
  // tiny studs where the lattice crosses
  g.fillStyle = "rgba(226,190,120,0.22)";
  for (let y = 0; y <= BACK_H; y += 10) for (let x = (y / 10) % 2 ? 10 : 0; x <= BACK_W; x += 20) g.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
  // sunburst behind the medallion
  const sun = g.createRadialGradient(CX, CY, 60, CX, CY, 230);
  sun.addColorStop(0, "rgba(232,190,110,0.32)");
  sun.addColorStop(1, "rgba(232,190,110,0)");
  g.fillStyle = sun;
  rays(g, CX, CY, 62, 260, 36, 0.06);
  g.fill();
  g.restore();

  speckle(g, 31, 700, "rgba(255,220,180,0.035)", "rgba(0,0,0,0.08)");

  // double brass frame with stepped corners
  g.strokeStyle = metal(g, y0, y0 + h, BRASS);
  g.lineWidth = 3;
  rr(g, x0, y0, w, h, 14);
  g.stroke();
  g.lineWidth = 1.2;
  g.strokeStyle = "rgba(214,176,104,0.6)";
  rr(g, x0 + 8, y0 + 8, w - 16, h - 16, 9);
  g.stroke();

  // corner fans
  twice(g, () => {
    for (const side of [-1, 1]) {
      const fx = side < 0 ? x0 + 8 : x0 + w - 8;
      const fy = y0 + 8;
      const a0 = side < 0 ? 0 : Math.PI / 2;
      g.fillStyle = "rgba(226,186,110,0.55)";
      rays(g, fx, fy, 6, 46, 5, 0.17, a0, Math.PI / 2);
      g.fill();
      g.strokeStyle = "rgba(226,186,110,0.7)";
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(fx, fy, 52, a0, a0 + Math.PI / 2);
      g.stroke();
    }
  });

  // medallion
  g.fillStyle = "#2a0807";
  g.beginPath();
  g.arc(CX, CY, 60, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = metal(g, CY - 60, CY + 60, BRASS);
  g.lineWidth = 3.5;
  g.stroke();
  g.lineWidth = 1.2;
  g.strokeStyle = "rgba(226,186,110,0.7)";
  g.beginPath();
  g.arc(CX, CY, 51, 0, Math.PI * 2);
  g.stroke();
  // diamond points above and below
  twice(g, () => {
    g.fillStyle = metal(g, CY - 96, CY - 60, BRASS);
    g.beginPath();
    g.moveTo(CX, CY - 98);
    g.lineTo(CX + 9, CY - 74);
    g.lineTo(CX, CY - 64);
    g.lineTo(CX - 9, CY - 74);
    g.closePath();
    g.fill();
  });
  g.save();
  g.shadowColor = "rgba(255,170,80,0.55)";
  g.shadowBlur = 10;
  flame(g, CX, CY + 2, 72, metal(g, CY - 36, CY + 38, ["#ffe7b0", "#e0a64e", "#a0601e"]));
  g.restore();
}

/* ------------------------------------------------------------------ Gilded (Pro) */

/** Black lacquer and gold: a stepped ziggurat frame, pinstripes and a tall lozenge with an "I". */
function paintGilded(g: G) {
  const bg = g.createLinearGradient(0, 0, BACK_W, BACK_H);
  bg.addColorStop(0, "#14110d");
  bg.addColorStop(0.5, "#0b0907");
  bg.addColorStop(1, "#15110c");
  g.fillStyle = bg;
  g.fillRect(0, 0, BACK_W, BACK_H);

  // faint vertical pinstripes
  g.fillStyle = "rgba(216,170,76,0.07)";
  for (let x = 30; x < BACK_W - 26; x += 9) g.fillRect(x, 30, 1, BACK_H - 60);

  speckle(g, 77, 500, "rgba(255,230,170,0.03)", "rgba(0,0,0,0.12)");

  const gold = metal(g, 0, BACK_H, GOLD);
  // stepped frame: an outer line whose corners step in twice
  const stepped = (inset: number, step: number) => {
    const l = inset;
    const t = inset;
    const r = BACK_W - inset;
    const b = BACK_H - inset;
    g.beginPath();
    g.moveTo(l + step * 2, t);
    g.lineTo(r - step * 2, t);
    g.lineTo(r - step * 2, t + step);
    g.lineTo(r - step, t + step);
    g.lineTo(r - step, t + step * 2);
    g.lineTo(r, t + step * 2);
    g.lineTo(r, b - step * 2);
    g.lineTo(r - step, b - step * 2);
    g.lineTo(r - step, b - step);
    g.lineTo(r - step * 2, b - step);
    g.lineTo(r - step * 2, b);
    g.lineTo(l + step * 2, b);
    g.lineTo(l + step * 2, b - step);
    g.lineTo(l + step, b - step);
    g.lineTo(l + step, b - step * 2);
    g.lineTo(l, b - step * 2);
    g.lineTo(l, t + step * 2);
    g.lineTo(l + step, t + step * 2);
    g.lineTo(l + step, t + step);
    g.lineTo(l + step * 2, t + step);
    g.closePath();
  };
  g.strokeStyle = gold;
  g.lineWidth = 3.5;
  stepped(22, 12);
  g.stroke();
  g.lineWidth = 1.2;
  stepped(32, 10);
  g.stroke();

  // skyline steps rising toward the centre from top and bottom
  twice(g, () => {
    g.fillStyle = gold;
    const base = 52;
    const widths = [150, 110, 72, 38];
    widths.forEach((w, i) => g.fillRect(CX - w / 2, base + i * 9, w, 3));
    // a fan of thin lines spraying up from the steps
    g.strokeStyle = "rgba(216,170,76,0.55)";
    g.lineWidth = 1;
    g.beginPath();
    for (let i = -6; i <= 6; i++) {
      g.moveTo(CX, base + 40);
      g.lineTo(CX + i * 22, base + 92);
    }
    g.stroke();
  });

  // lozenge
  const lz = (ry: number, rx: number) => {
    g.beginPath();
    g.moveTo(CX, CY - ry);
    g.lineTo(CX + rx, CY);
    g.lineTo(CX, CY + ry);
    g.lineTo(CX - rx, CY);
    g.closePath();
  };
  g.fillStyle = "#070605";
  lz(140, 92);
  g.fill();
  g.strokeStyle = gold;
  g.lineWidth = 3;
  g.stroke();
  g.lineWidth = 1;
  lz(126, 82);
  g.stroke();
  // inner pinstripe fill
  g.save();
  lz(120, 78);
  g.clip();
  g.fillStyle = "rgba(216,170,76,0.16)";
  for (let x = CX - 80; x < CX + 80; x += 6) g.fillRect(x, CY - 130, 1, 260);
  g.restore();

  // the "I": a deco capital with wedge serifs
  g.fillStyle = metal(g, CY - 50, CY + 50, GOLD);
  g.fillRect(CX - 5, CY - 40, 10, 80);
  twice(g, () => {
    g.beginPath();
    g.moveTo(CX - 22, CY - 50);
    g.lineTo(CX + 22, CY - 50);
    g.lineTo(CX + 8, CY - 38);
    g.lineTo(CX - 8, CY - 38);
    g.closePath();
    g.fill();
  });
  // ring of dots around the lozenge's waist
  g.fillStyle = "rgba(240,210,140,0.85)";
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(CX + s * (106 + i * 14), CY, 2.4 - i * 0.5, 0, Math.PI * 2);
    g.fill();
  }
}

/* ------------------------------------------------------------------ Marquee (Pro) */

/** Midnight blue with a cream-and-gold sunburst fan, ringed by warm marquee bulbs. */
function paintMarquee(g: G) {
  const bg = g.createRadialGradient(CX, CY, 30, CX, CY, 340);
  bg.addColorStop(0, "#1b3150");
  bg.addColorStop(0.6, "#11213a");
  bg.addColorStop(1, "#08111f");
  g.fillStyle = bg;
  g.fillRect(0, 0, BACK_W, BACK_H);

  const x0 = 24;
  const y0 = 24;
  const w = BACK_W - 48;
  const h = BACK_H - 48;

  // the fan: alternating cream and gold rays from the centre
  g.save();
  rr(g, x0, y0, w, h, 16);
  g.clip();
  const fan = g.createRadialGradient(CX, CY, 40, CX, CY, 320);
  fan.addColorStop(0, "rgba(246,226,180,0.75)");
  fan.addColorStop(0.55, "rgba(226,186,110,0.4)");
  fan.addColorStop(1, "rgba(226,186,110,0.12)");
  g.fillStyle = fan;
  // wedges that widen outward (every other slice of 24)
  g.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.moveTo(CX, CY);
    g.lineTo(CX + Math.cos(a - 0.065) * 400, CY + Math.sin(a - 0.065) * 400);
    g.lineTo(CX + Math.cos(a + 0.065) * 400, CY + Math.sin(a + 0.065) * 400);
    g.closePath();
  }
  g.fill();
  g.restore();

  speckle(g, 53, 600, "rgba(220,230,255,0.03)", "rgba(0,0,0,0.1)");

  // frame
  g.strokeStyle = metal(g, y0, y0 + h, GOLD);
  g.lineWidth = 3;
  rr(g, x0, y0, w, h, 16);
  g.stroke();

  // bulbs around the frame
  const bulb = (x: number, y: number, r: number) => {
    const b = g.createRadialGradient(x, y, 0, x, y, r * 2.6);
    b.addColorStop(0, "rgba(255,244,214,1)");
    b.addColorStop(0.35, "rgba(255,196,110,0.9)");
    b.addColorStop(1, "rgba(255,140,60,0)");
    g.fillStyle = b;
    g.beginPath();
    g.arc(x, y, r * 2.6, 0, Math.PI * 2);
    g.fill();
  };
  const inset = 38;
  for (let x = inset; x <= BACK_W - inset + 0.1; x += (BACK_W - inset * 2) / 9) {
    bulb(x, inset, 3);
    bulb(x, BACK_H - inset, 3);
  }
  for (let y = inset + (BACK_H - inset * 2) / 13; y < BACK_H - inset - 1; y += (BACK_H - inset * 2) / 13) {
    bulb(inset, y, 3);
    bulb(BACK_W - inset, y, 3);
  }

  // centre: a ring of bulbs around a navy disc with a gold flame
  g.fillStyle = "#0c1729";
  g.beginPath();
  g.arc(CX, CY, 70, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = metal(g, CY - 70, CY + 70, GOLD);
  g.lineWidth = 4;
  g.stroke();
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(CX, CY, 46, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    bulb(CX + Math.cos(a) * 58, CY + Math.sin(a) * 58, 2.4);
  }
  g.save();
  g.shadowColor = "rgba(255,190,100,0.6)";
  g.shadowBlur = 8;
  flame(g, CX, CY + 1, 56, metal(g, CY - 28, CY + 28, ["#fff0c4", "#e6b45a", "#a8701f"]));
  g.restore();
}

const PAINTERS: Record<CardBackId, (g: G) => void> = { house: paintHouse, gilded: paintGilded, marquee: paintMarquee };

/** Paint a card back over the whole of `g`'s canvas (any size; art is scaled from 384×540). */
export function paintCardBack(g: G, id: CardBackId) {
  const { width, height } = g.canvas;
  g.save();
  g.setTransform(width / BACK_W, 0, 0, height / BACK_H, 0, 0);
  g.clearRect(0, 0, BACK_W, BACK_H);
  PAINTERS[id](g);
  g.restore();
}

const urls = new Map<string, string>();

/** A small PNG of the back for 2D cards and swatches (cached per design and size). */
export function cardBackUrl(id: CardBackId, w = 128): string {
  const key = `${id}:${w}`;
  let u = urls.get(key);
  if (u) return u;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = Math.round((w * BACK_H) / BACK_W);
  paintCardBack(c.getContext("2d")!, id);
  u = c.toDataURL("image/png");
  urls.set(key, u);
  return u;
}
