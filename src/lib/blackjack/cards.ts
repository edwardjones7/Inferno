/**
 * Cards are encoded as two-character strings: rank + suit.
 * Ranks: A 2-9 T J Q K   Suits: S H D C   e.g. "AS", "TD", "7H".
 * Compact codes keep stored round state small and make shoes easy to diff.
 */
export type Suit = "S" | "H" | "D" | "C";
export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "T"
  | "J"
  | "Q"
  | "K";
export type Card = `${Rank}${Suit}`;

export const RANKS: readonly Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];
export const SUITS: readonly Suit[] = ["S", "H", "D", "C"];

export const rankOf = (c: Card) => c[0] as Rank;
export const suitOf = (c: Card) => c[1] as Suit;

/** Blackjack value of a rank, counting aces as 1 (softness handled by handTotal). */
export function rankValue(r: Rank): number {
  if (r === "A") return 1;
  if (r === "T" || r === "J" || r === "Q" || r === "K") return 10;
  return Number(r);
}

export const cardValue = (c: Card) => rankValue(rankOf(c));

export interface Total {
  total: number;
  /** true when an ace is currently being counted as 11 */
  soft: boolean;
}

export function handTotal(cards: readonly Card[]): Total {
  let sum = 0;
  let aces = 0;
  for (const c of cards) {
    const v = cardValue(c);
    sum += v;
    if (v === 1) aces++;
  }
  if (aces > 0 && sum + 10 <= 21) return { total: sum + 10, soft: true };
  return { total: sum, soft: false };
}

export const isTwentyOne = (cards: readonly Card[]) => handTotal(cards).total === 21;
export const isNaturalPair = (cards: readonly Card[]) => cards.length === 2 && isTwentyOne(cards);
export const isBust = (cards: readonly Card[]) => handTotal(cards).total > 21;

/** An ordered (unshuffled) shoe of `decks` standard 52-card decks. */
export function buildShoe(decks: number): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const s of SUITS) for (const r of RANKS) shoe.push(`${r}${s}`);
  }
  return shoe;
}

export const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const RANK_LABEL = (r: Rank) => (r === "T" ? "10" : r);
export const isRed = (c: Card) => suitOf(c) === "H" || suitOf(c) === "D";
export const cardLabel = (c: Card) => `${RANK_LABEL(rankOf(c))}${SUIT_SYMBOL[suitOf(c)]}`;
