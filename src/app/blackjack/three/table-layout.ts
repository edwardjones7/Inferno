/**
 * Table geometry shared by every part of the 3D scene. World units: x = left/right,
 * z = toward the player (+) / dealer (-), y = up. The felt surface is at y = 0.
 */
import * as THREE from "three";
import type { Card } from "@/lib/blackjack/cards";
import type { RoundView } from "@/lib/blackjack/engine";
import { playerKey } from "../timing";

export const DEALER_Z = -1.4;
export const HAND_Z = 1.15;
export const BET_Z = 2.02;
export const SHOE_MOUTH = new THREE.Vector3(2.9, 0.38, -1.45);
export const SHOE_POS = new THREE.Vector3(3.25, 0, -1.8);
export const TRAY = new THREE.Vector3(0, 0.15, -2.25);
export const PLAYER_SIDE = new THREE.Vector3(0, 0.9, 3.4);
/** Where the dealer's hole card lands (second dealer card of two). */
export const HOLE_CARD_POS = new THREE.Vector3(0.25, 0, DEALER_Z);
/** seconds a card spends flying from the shoe */
export const FLIGHT = 0.5;

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

const handSpread = (n: number) => (n > 2 ? 1.85 : 2.2);
export const handX = (h: number, n: number) => (h - (n - 1) / 2) * handSpread(n);

export interface CardSlot {
  /** stable React key; includes the round id so a new round re-deals */
  key: string;
  /** key into Timing.delays */
  delayKey: string;
  card: Card | null;
  pos: [number, number, number];
  hole: boolean;
  /** index of the player hand this card belongs to, or -1 for the dealer */
  hand: number;
}

export function layoutCards(view: RoundView, roundId: string): CardSlot[] {
  const slots: CardSlot[] = [];
  const n = view.dealer.length;
  view.dealer.forEach((c, i) => {
    slots.push({
      key: `${roundId}:d${i}`,
      delayKey: `d${i}`,
      card: c,
      pos: [(i - (n - 1) / 2) * 0.5, 0.004 + i * 0.004, DEALER_Z],
      hole: i === 1,
      hand: -1,
    });
  });
  // Player cards keep their identity through a split (keyed by card + occurrence),
  // so the split card glides to its new hand instead of being dealt again.
  const seen = new Map<string, number>();
  view.hands.forEach((h, hi) => {
    const ax = handX(hi, view.hands.length);
    h.cards.forEach((c, i) => {
      const k = seen.get(c) ?? 0;
      seen.set(c, k + 1);
      slots.push({
        key: `${roundId}:${c}#${k}`,
        delayKey: playerKey(hi, i, c),
        card: c,
        pos: [ax + (i - (h.cards.length - 1) / 2) * 0.26, 0.004 + i * 0.004, HAND_Z - i * 0.1],
        hole: false,
        hand: hi,
      });
    });
  });
  return slots;
}

export type Anchors = Record<string, [number, number, number]>;

/** Where each HTML label sits on the table, in world space. */
export function labelAnchors(view: RoundView | null): Anchors {
  const out: Anchors = {};
  if (!view) {
    out.pending = [0, 0.02, BET_Z + 0.62];
    return out;
  }
  out.dealer = [0, 0.02, DEALER_Z + 0.78];
  view.hands.forEach((h, hi) => {
    const x = handX(hi, view.hands.length);
    out[`hand${hi}`] = [x - ((h.cards.length - 1) / 2) * 0.26 - 0.62, 0.02, HAND_Z];
  });
  return out;
}
