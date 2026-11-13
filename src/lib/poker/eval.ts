/**
 * Texas Hold'em hand evaluation. Cards reuse the two-character codes from blackjack
 * ("AS", "TD", "7H"). `evaluate` takes 5–7 cards and returns a score where higher is
 * better and equal scores tie; `describe` adds a human name and the best five cards.
 */
import { rankOf, suitOf, type Card, type Rank } from "../blackjack/cards";

export const RANK_VALUE: Record<Rank, number> = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
export const VALUE_RANK: Record<number, Rank> = Object.fromEntries(Object.entries(RANK_VALUE).map(([r, v]) => [v, r])) as Record<number, Rank>;

export const CATEGORIES = [
  "High card",
  "Pair",
  "Two pair",
  "Three of a kind",
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
] as const;
export type Category = (typeof CATEGORIES)[number];

const B = 15;
/** category * 15^5 + up to five tiebreak values, most significant first */
const score = (cat: number, kick: number[]) => {
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * B + (kick[i] ?? 0);
  return s;
};
export const categoryOf = (s: number) => Math.floor(s / B ** 5);

/** Highest straight in a rank bitmask (bit v set for value v; ace also counts as 1). */
function topStraight(mask: number): number {
  if (mask & (1 << 14)) mask |= 1 << 1;
  for (let hi = 14; hi >= 5; hi--) {
    const need = 0b11111 << (hi - 4);
    if ((mask & need) === need) return hi;
  }
  return 0;
}

export function evaluate(cards: readonly Card[]): number {
  const counts = new Array<number>(15).fill(0);
  const suitMasks: Record<string, number> = { S: 0, H: 0, D: 0, C: 0 };
  const suitCounts: Record<string, number> = { S: 0, H: 0, D: 0, C: 0 };
  let mask = 0;
  for (const c of cards) {
    const v = RANK_VALUE[rankOf(c)];
    const s = suitOf(c);
    counts[v]++;
    mask |= 1 << v;
    suitMasks[s] |= 1 << v;
    suitCounts[s]++;
  }

  // flushes / straight flushes
  let flushMask = 0;
  for (const s of ["S", "H", "D", "C"]) if (suitCounts[s] >= 5) flushMask = suitMasks[s];
  if (flushMask) {
    const sf = topStraight(flushMask);
    if (sf) return score(8, [sf]);
  }

  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  const singles: number[] = [];
  for (let v = 14; v >= 2; v--) {
    if (counts[v] === 4) quads.push(v);
    else if (counts[v] === 3) trips.push(v);
    else if (counts[v] === 2) pairs.push(v);
    else if (counts[v] === 1) singles.push(v);
  }

  if (quads.length) {
    const kicker = Math.max(...[...trips, ...pairs, ...singles, ...quads.slice(1)], 0);
    return score(7, [quads[0], kicker]);
  }
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const pairPart = Math.max(trips[1] ?? 0, pairs[0] ?? 0);
    return score(6, [trips[0], pairPart]);
  }
  if (flushMask) {
    const top: number[] = [];
    for (let v = 14; v >= 2 && top.length < 5; v--) if (flushMask & (1 << v)) top.push(v);
    return score(5, top);
  }
  const st = topStraight(mask);
  if (st) return score(4, [st]);
  if (trips.length) return score(3, [trips[0], ...singles.slice(0, 2)]);
  if (pairs.length >= 2) {
    const kicker = Math.max(pairs[2] ?? 0, singles[0] ?? 0);
    return score(2, [pairs[0], pairs[1], kicker]);
  }
  if (pairs.length === 1) return score(1, [pairs[0], ...singles.slice(0, 3)]);
  return score(0, singles.slice(0, 5));
}

const plural: Record<number, string> = { 2: "twos", 3: "threes", 4: "fours", 5: "fives", 6: "sixes", 7: "sevens", 8: "eights", 9: "nines", 10: "tens", 11: "jacks", 12: "queens", 13: "kings", 14: "aces" };
const single: Record<number, string> = { 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "jack", 12: "queen", 13: "king", 14: "ace" };

/** "Two pair, kings and sevens", "Flush, ace high", "Straight, nine high" … */
export function nameScore(s: number): string {
  const cat = categoryOf(s);
  const k: number[] = [];
  let rest = s;
  for (let i = 0; i < 5; i++) {
    k.unshift(rest % B);
    rest = Math.floor(rest / B);
  }
  switch (cat) {
    case 8:
      return k[0] === 14 ? "Royal flush" : `Straight flush, ${single[k[0]]} high`;
    case 7:
      return `Four of a kind, ${plural[k[0]]}`;
    case 6:
      return `Full house, ${plural[k[0]]} full of ${plural[k[1]]}`;
    case 5:
      return `Flush, ${single[k[0]]} high`;
    case 4:
      return `Straight, ${single[k[0]]} high`;
    case 3:
      return `Three of a kind, ${plural[k[0]]}`;
    case 2:
      return `Two pair, ${plural[k[0]]} and ${plural[k[1]]}`;
    case 1:
      return `Pair of ${plural[k[0]]}`;
    default:
      return `High card, ${single[k[0]]}`;
  }
}

export const describe = (cards: readonly Card[]) => {
  const s = evaluate(cards);
  return { score: s, category: CATEGORIES[categoryOf(s)], name: nameScore(s) };
};

/** All 52 cards. */
export const DECK: Card[] = (["S", "H", "D", "C"] as const).flatMap((s) => (Object.keys(RANK_VALUE) as Rank[]).map((r) => `${r}${s}` as Card));
