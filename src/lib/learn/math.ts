/**
 * Small, exact calculations the lessons quote, so the numbers on screen come from code
 * rather than being typed in by hand.
 */
import { cardValue, rankOf, suitOf, type Card } from "../blackjack/cards";
import { RANK_VALUE } from "../poker/eval";

/* ------------------------------------------------------------------ blackjack */

/** card values 1 (ace) .. 10 with infinite-deck probabilities */
const DRAW: [number, number][] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => [v, v === 10 ? 4 / 13 : 1 / 13]);

function addCard(total: number, soft: boolean, v: number): [number, boolean] {
  let t = total;
  let s = soft;
  if (v === 1 && t + 11 <= 21) {
    t += 11;
    s = true;
  } else t += v;
  if (t > 21 && s) {
    t -= 10;
    s = false;
  }
  return [t, s];
}

function bustFrom(total: number, soft: boolean, h17: boolean): number {
  if (total > 21) return 1;
  if (total >= 18 || (total === 17 && !(soft && h17))) return 0;
  let p = 0;
  for (const [v, pv] of DRAW) {
    const [t, s] = addCard(total, soft, v);
    p += pv * bustFrom(t, s, h17);
  }
  return p;
}

/**
 * Chance the dealer busts from an upcard (value 2..11, ace = 11), infinite deck, after
 * peeking for blackjack (so a ten can't hide an ace and vice versa).
 */
export function dealerBustChance(up: number, h17 = false): number {
  const upV = up === 11 ? 1 : up;
  const [t0, s0] = addCard(0, false, upV);
  let p = 0;
  let mass = 0;
  for (const [v, pv] of DRAW) {
    if ((upV === 1 && v === 10) || (upV === 10 && v === 1)) continue; // that would be blackjack
    const [t, s] = addCard(t0, s0, v);
    p += pv * bustFrom(t, s, h17);
    mass += pv;
  }
  return p / mass;
}

/** Hi-Lo tag of a card: 2–6 are +1, 7–9 are 0, tens and aces are −1. */
export function hiLo(c: Card): number {
  const v = cardValue(c);
  if (v >= 2 && v <= 6) return 1;
  if (v >= 7 && v <= 9) return 0;
  return -1;
}

export const runningCount = (cards: readonly Card[]) => cards.reduce((n, c) => n + hiLo(c), 0);

/** True count: running count per deck still to be dealt, rounded down (floored), the same convention as the count trainer in blackjack/counting.ts. */
export { trueCount } from "../blackjack/counting";

/**
 * Expected value of a 1-unit insurance bet (pays 2:1) in a fresh shoe of `decks` decks,
 * after seeing the dealer's ace and the player's own two cards.
 */
export function insuranceEv(decks: number, seen: readonly Card[] = []): number {
  const unseen = decks * 52 - 1 - seen.length;
  const tens = decks * 16 - seen.filter((c) => cardValue(c) === 10).length;
  const p = tens / unseen;
  return 2 * p - (1 - p);
}

/* ------------------------------------------------------------------ poker */

/** Price of a call: the share of the final pot you put in. `pot` excludes the bet. */
export const potOddsNeeded = (pot: number, bet: number) => bet / (pot + 2 * bet);

/** How often a bet of `bet` into `pot` must make the opponent fold to break even as a pure bluff. */
export const bluffBreakEven = (pot: number, bet: number) => bet / (pot + bet);

export type Texture = "dry" | "wet" | "paired";

/**
 * Coarse flop texture for teaching: "paired" if two board cards share a rank, "wet" if the
 * board is monotone or connected (two hole cards can make a straight), otherwise "dry".
 */
export function textureOf(board: readonly Card[]): Texture {
  const ranks = board.map((c) => RANK_VALUE[rankOf(c)]);
  if (new Set(ranks).size < ranks.length) return "paired";
  const suits = new Map<string, number>();
  for (const c of board) suits.set(suitOf(c), (suits.get(suitOf(c)) ?? 0) + 1);
  const maxSuit = Math.max(...suits.values());
  // a five-rank window that holds all three board ranks means two hole cards can make a straight
  let connected = false;
  for (let lo = 1; lo <= 10 && !connected; lo++) {
    const inWindow = ranks.filter((r) => (r >= lo && r <= lo + 4) || (r === 14 && lo === 1)).length;
    if (inWindow >= 3) connected = true;
  }
  if (maxSuit >= 3 || connected) return "wet";
  return "dry";
}

/** Exact chance to hit one of `outs` cards with `cards` (1 or 2) still to come, from `unseen` unknown cards. */
export function hitChance(outs: number, cards: 1 | 2, unseen = cards === 2 ? 47 : 46): number {
  if (cards === 1) return outs / unseen;
  return 1 - ((unseen - outs) * (unseen - outs - 1)) / (unseen * (unseen - 1));
}

/** Combos of a two-rank hand ("AK", "QQ") still possible once `dead` cards are known. */
export function combosLeft(ranks: string, dead: readonly Card[]): number {
  const left = (r: string) => 4 - dead.filter((c) => rankOf(c) === r).length;
  const [a, b] = [ranks[0], ranks[1]];
  if (a === b) {
    const n = left(a);
    return (n * (n - 1)) / 2;
  }
  return left(a) * left(b);
}
