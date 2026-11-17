/**
 * Quick odds the coach shows on the table. Both are infinite-deck approximations: with six
 * decks the difference from exact composition-dependent odds is a point or two, which is
 * fine for teaching intuition ("hitting 16 busts more often than not").
 */
import { dealerBustChance } from "../learn/math";
import { cardValue, handTotal, type Card } from "./cards";

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
 * How often the dealer busts, by upcard. The dealer peeks for blackjack, so these are
 * conditional on the hand not being a dealer blackjack (A ≈ 17% S17 / 20% H17, 10 ≈ 23%).
 * Computed by `dealerBustChance` (infinite deck), the same numbers the lessons show.
 */
const BUST = new Map<string, number>();

export function dealerBust(up: Card, hitsSoft17: boolean): number {
  const v = cardValue(up);
  const key = `${v}-${hitsSoft17}`;
  let p = BUST.get(key);
  if (p === undefined) BUST.set(key, (p = dealerBustChance(v === 1 ? 11 : v, hitsSoft17)));
  return p;
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;
