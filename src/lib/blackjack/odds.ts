/**
 * Quick odds the coach shows on the table. Both are infinite-deck approximations: with six
 * decks the difference from exact composition-dependent odds is a point or two, which is
 * fine for teaching intuition ("hitting 16 busts more often than not").
 */
import { handTotal, rankOf, type Card } from "./cards";

/** Chance the next card busts this hand (0 for soft hands, which can't bust on one card). */
export function bustIfHit(cards: readonly Card[]): number {
  const { total, soft } = handTotal(cards);
  if (soft || total <= 11) return 0;
  if (total >= 21) return 1;
  // per 13 ranks: A counts 1, 2..9 count themselves, ten-valued ranks are 4 of 13
  let bust = 0;
  for (let v = 1; v <= 10; v++) {
    const weight = v === 10 ? 4 : 1;
    if (total + v > 21) bust += weight;
  }
  return bust / 13;
}

/**
 * How often the dealer busts, by upcard (six decks; dealer peeks for blackjack, so these
 * are conditional on the hand not being a dealer blackjack). Source: standard published
 * dealer outcome tables.
 */
const DEALER_BUST_S17: Record<string, number> = {
  "2": 0.353, "3": 0.373, "4": 0.394, "5": 0.417, "6": 0.423,
  "7": 0.262, "8": 0.244, "9": 0.228, T: 0.214, A: 0.117,
};
const DEALER_BUST_H17: Record<string, number> = {
  "2": 0.353, "3": 0.373, "4": 0.394, "5": 0.417, "6": 0.442,
  "7": 0.262, "8": 0.244, "9": 0.228, T: 0.214, A: 0.141,
};

export function dealerBust(up: Card, hitsSoft17: boolean): number {
  const r = rankOf(up);
  const key = r === "J" || r === "Q" || r === "K" ? "T" : r;
  return (hitsSoft17 ? DEALER_BUST_H17 : DEALER_BUST_S17)[key] ?? 0;
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;
