/**
 * Basic strategy for 6 decks, dealer stands on soft 17, double after split, late surrender.
 * Used for the in-game hint and the house-edge simulation.
 */
import { cardValue, handTotal, type Card } from "./cards";
import type { ActionType } from "./engine";

export type Move = "hit" | "stand" | "double" | "split" | "surrender";

export function basicStrategy(cards: readonly Card[], dealerUp: Card, legal: readonly ActionType[]): Move {
  // Never trust `legal` alone: only pairs split, only opening hands double/surrender.
  const opening = cards.length === 2;
  const pair = opening && cardValue(cards[0]) === cardValue(cards[1]);
  const can = (m: Move) =>
    legal.includes(m) && (m === "split" ? pair : m === "double" || m === "surrender" ? opening : true);
  const d = cardValue(dealerUp) === 1 ? 11 : cardValue(dealerUp);
  const { total, soft } = handTotal(cards);
  const between = (lo: number, hi: number) => d >= lo && d <= hi;
  const doubleOr = (fallback: Move): Move => (can("double") ? "double" : fallback);

  // Late surrender
  if (can("surrender") && !soft) {
    const pairOf8 = cards.length === 2 && cardValue(cards[0]) === 8 && cardValue(cards[1]) === 8;
    if (!pairOf8 && ((total === 16 && d >= 9) || (total === 15 && d === 10))) return "surrender";
  }

  // Pairs
  if (can("split")) {
    const v = cardValue(cards[0]);
    const split =
      v === 1 ||
      v === 8 ||
      (v === 9 && (between(2, 6) || d === 8 || d === 9)) ||
      (v === 7 && between(2, 7)) ||
      (v === 6 && between(2, 6)) ||
      (v === 4 && between(5, 6)) ||
      ((v === 2 || v === 3) && between(2, 7));
    if (split) return "split";
  }

  if (soft) {
    if (total >= 20) return "stand";
    // S17 chart: A,8 always stands (doubling vs 6 is the H17 play)
    if (total === 19) return "stand";
    if (total === 18) {
      // S17 chart: stand vs 2 (doubling vs 2 is the H17 play)
      if (between(3, 6)) return doubleOr("stand");
      if (d === 2 || between(7, 8)) return "stand";
      return "hit";
    }
    if (total === 17) return between(3, 6) ? doubleOr("hit") : "hit";
    if (total >= 15) return between(4, 6) ? doubleOr("hit") : "hit";
    return between(5, 6) ? doubleOr("hit") : "hit";
  }

  if (total >= 17) return "stand";
  if (total >= 13) return between(2, 6) ? "stand" : "hit";
  if (total === 12) return between(4, 6) ? "stand" : "hit";
  if (total === 11) return d === 11 ? "hit" : doubleOr("hit");
  if (total === 10) return between(2, 9) ? doubleOr("hit") : "hit";
  if (total === 9) return between(3, 6) ? doubleOr("hit") : "hit";
  return "hit";
}
