"use client";

import * as THREE from "three";
import { isRed, RANK_LABEL, rankOf, SUIT_SYMBOL, suitOf, type Card } from "@/lib/blackjack/cards";
import { canvas, display, FLAME, prng, roundRect, sans, texture } from "./canvas-utils";

/* ------------------------------------------------------------------ cards */

const W = 384;
const H = 540;

/** Aces and court cards carry the foil treatment. */
export const isFoil = (card: Card) => ["A", "J", "Q", "K"].includes(rankOf(card));

const isCourt = (card: Card) => ["J", "Q", "K"].includes(rankOf(card));

function seedOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Paints a card face. In `mask` mode the paper is black and only the foil-stamped
 * parts are painted (white = full foil); the result drives the foil shimmer.
 */
function paintFace(g: CanvasRenderingContext2D, card: Card, mask: boolean) {
  const red = isRed(card);
  const ink = mask ? "#000" : red ? "#d9310c" : "#17110d";
  const rank = RANK_LABEL(rankOf(card));
  const suit = SUIT_SYMBOL[suitOf(card)];
  const foil = isFoil(card);
  const court = isCourt(card);
  const gold = mask ? "#fff" : red ? "#c9761f" : "#b0802c";

  if (mask) {
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
  } else {
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#fffaf2");
    bg.addColorStop(0.55, "#f6ecdf");
    bg.addColorStop(1, "#e8d5c0");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // paper fibre: faint speckle so the stock doesn't read as flat plastic
    const rnd = prng(seedOf(card));
    for (let i = 0; i < 900; i++) {
      const a = rnd() * 0.05;
      g.fillStyle = rnd() > 0.5 ? `rgba(120,80,40,${a})` : `rgba(255,255,255,${a * 1.6})`;
      g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1);
    }
  }

  // thin inner border; foil-stamped on aces and court cards
  if (foil || !mask) {
    g.strokeStyle = foil ? gold : red ? "rgba(217,49,12,.16)" : "rgba(23,17,13,.14)";
    g.lineWidth = foil ? 3 : 2;
    roundRect(g, 14, 14, W - 28, H - 28, 18);
    g.stroke();
  }

  const corner = (flip: boolean) => {
    g.save();
    if (flip) {
      g.translate(W, H);
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
  if (!mask) {
    corner(false);
    corner(true);
  }

  g.textAlign = "center";
  if (court) {
    // court cards: a foil frame with the letter, instead of a lone pip
    g.save();
    roundRect(g, 118, 124, 162, 302, 20);
    if (mask) {
      g.fillStyle = "rgba(255,255,255,.38)";
    } else {
      const fill = g.createLinearGradient(118, 124, 280, 426);
      fill.addColorStop(0, red ? "rgba(255,154,46,.22)" : "rgba(255,194,75,.20)");
      fill.addColorStop(0.5, red ? "rgba(255,90,31,.08)" : "rgba(23,17,13,.05)");
      fill.addColorStop(1, red ? "rgba(255,154,46,.24)" : "rgba(255,194,75,.22)");
      g.fillStyle = fill;
    }
    g.fill();
    g.strokeStyle = gold;
    g.lineWidth = 5;
    g.stroke();
    roundRect(g, 128, 134, 142, 282, 14);
    g.lineWidth = 1.5;
    g.stroke();
    g.restore();

    g.fillStyle = mask ? "#fff" : ink;
    g.font = `900 140px ${display()}`;
    g.fillText(rank, 199, 320);
    g.font = `64px ${sans()}`;
    g.fillText(suit, 199, 398);
  } else if (rankOf(card) === "A") {
    // ace: a big pip inside a stamped flame-ring
    g.save();
    g.strokeStyle = gold;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(W / 2, 290, 128, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(W / 2, 290, 116, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r0 = 128;
      const r1 = i % 2 ? 140 : 150;
      g.beginPath();
      g.moveTo(W / 2 + Math.cos(a) * r0, 290 + Math.sin(a) * r0);
      g.lineTo(W / 2 + Math.cos(a) * r1, 290 + Math.sin(a) * r1);
      g.stroke();
    }
    g.restore();
    g.fillStyle = mask ? "rgba(255,255,255,.9)" : ink;
    g.textBaseline = "middle";
    g.font = `210px ${sans()}`;
    g.fillText(suit, W / 2, 300);
    g.textBaseline = "alphabetic";
  } else if (!mask) {
    g.fillStyle = ink;
    g.textBaseline = "middle";
    g.font = `230px ${sans()}`;
    g.fillText(suit, 200, 300);
    g.textBaseline = "alphabetic";
  }
}

export function cardFace(card: Card) {
  return texture(`card:${card}`, () => {
    const [c, g] = canvas(W, H);
    paintFace(g, card, false);
    return c;
  });
}

/** Greyscale foil mask for aces and court cards (R channel = foil amount). */
export function cardFoilMask(card: Card) {
  return texture(`card-foil:${card}`, () => {
    const [c, g] = canvas(W / 2, H / 2);
    g.scale(0.5, 0.5);
    paintFace(g, card, true);
    return c;
  }, 4);
}

export function cardBack() {
  return texture("card:back", () => {
    const [c, g] = canvas(W, H);
    const bg = g.createRadialGradient(192, 310, 10, 192, 290, 360);
    bg.addColorStop(0, "#ff5a1f");
    bg.addColorStop(0.35, "#b3200c");
    bg.addColorStop(0.85, "#3d0805");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

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

let grain: THREE.Texture | null = null;

/**
 * Tileable paper grain (linear data, not colour): used as a roughness and bump map
 * so the stock catches light unevenly. Shared by every card.
 */
export function paperGrain() {
  if (grain) return grain;
  const S = 128;
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  const rnd = prng(911);
  // value noise on a coarse lattice + fine speckle, wrapped so it tiles
  const L = 16;
  const lattice = Array.from({ length: L * L }, () => rnd());
  const at = (x: number, y: number) => lattice[((y + L) % L) * L + ((x + L) % L)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fx = (x / S) * L;
      const fy = (y / S) * L;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
      const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      const v = 0.78 + (a + (b - a) * sy) * 0.14 + rnd() * 0.08;
      const i = (y * S + x) * 4;
      const byte = Math.round(Math.min(1, v) * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = byte;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  grain = new THREE.CanvasTexture(c);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(2.5, 3.5);
  grain.anisotropy = 4;
  return grain;
}
