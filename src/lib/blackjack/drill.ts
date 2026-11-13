/**
 * Drill spot generation: opening two-card decisions vs a dealer upcard, filtered by
 * category, by the player's leaks, or focused on one chart cell. Pure functions; the
 * caller supplies randomness so this stays testable.
 */
import { cardValue, isTwentyOne, SUITS, type Card, type Rank } from "./cards";
import { deal, legalActions, type ActionType, type Rules } from "./engine";

export type DrillCategory = "all" | "hard" | "soft" | "pair" | "surrender" | "leaks";

export const DRILL_CATEGORIES: { id: DrillCategory; label: string; blurb: string }[] = [
  { id: "all", label: "Everything", blurb: "A realistic mix of every opening decision." },
  { id: "hard", label: "Hard totals", blurb: "No aces, no pairs: when to hit, stand or double." },
  { id: "soft", label: "Soft totals", blurb: "Ace hands, where most players leak the most." },
  { id: "pair", label: "Pairs", blurb: "When to split and when to keep the pair." },
  { id: "surrender", label: "Surrender spots", blurb: "Stiff hands against strong dealer cards." },
  { id: "leaks", label: "My leaks", blurb: "Only the spots you've been getting wrong." },
];

export interface DrillSpot {
  cards: [Card, Card];
  up: Card;
}

type Rand = () => number;
const pick = <T,>(rand: Rand, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const suit = (rand: Rand) => pick(rand, SUITS);
const TENS: Rank[] = ["T", "J", "Q", "K"];

/** A card of a given blackjack value (1 = ace, 10 = any ten-value rank). */
export function cardOfValue(v: number, rand: Rand): Card {
  const rank: Rank = v === 1 || v === 11 ? "A" : v === 10 ? pick(rand, TENS) : (String(v) as Rank);
  return `${rank}${suit(rand)}`;
}

const DEALER_VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 11];

/** Two different non-ace ranks summing to `total` (hard 5..19). */
function hardPair(total: number, rand: Rand): [Card, Card] {
  const options: [number, number][] = [];
  for (let a = 2; a <= 10; a++) {
    const b = total - a;
    if (b >= 2 && b <= 10 && a !== b) options.push([a, b]);
  }
  const [a, b] = pick(rand, options);
  return [cardOfValue(a, rand), cardOfValue(b, rand)];
}

/** Build a concrete spot from a chart key like "hard-16-10", "soft-18-2", "pair-8-11". */
export function spotFromKey(key: string, rand: Rand): DrillSpot | null {
  const [kind, v, d] = key.split("-");
  const value = Number(v);
  const dealer = Number(d);
  if (!Number.isFinite(value) || !Number.isFinite(dealer) || dealer < 2 || dealer > 11) return null;
  const up = cardOfValue(dealer, rand);
  if (kind === "pair" && value >= 1 && value <= 10) return { cards: [cardOfValue(value, rand), cardOfValue(value, rand)], up };
  if (kind === "soft" && value >= 13 && value <= 20) return { cards: [cardOfValue(1, rand), cardOfValue(value - 11, rand)], up };
  if (kind === "hard" && value >= 5 && value <= 19) return { cards: hardPair(value, rand), up };
  return null;
}

// Weighted towards the totals where decisions actually vary.
const HARD_TOTALS = [5, 6, 7, 8, 9, 9, 10, 10, 11, 11, 12, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16, 16, 17, 18];
const SURRENDER_KEYS = ["hard-15-10", "hard-15-11", "hard-16-9", "hard-16-10", "hard-16-11", "hard-17-11", "pair-8-11", "hard-14-10", "hard-16-7"];

export function generateSpot(category: DrillCategory, rand: Rand, leakKeys: readonly string[] = []): DrillSpot {
  const kind: Exclude<DrillCategory, "all" | "leaks"> | "leaks" =
    category === "all" ? pick(rand, ["hard", "hard", "soft", "pair"] as const) : category;
  const dealer = pick(rand, DEALER_VALUES);
  switch (kind) {
    case "leaks":
      if (leakKeys.length) {
        const s = spotFromKey(pick(rand, leakKeys), rand);
        if (s) return s;
      }
      return generateSpot("all", rand);
    case "surrender":
      return spotFromKey(pick(rand, SURRENDER_KEYS), rand)!;
    case "soft":
      return { cards: [cardOfValue(1, rand), cardOfValue(2 + Math.floor(rand() * 8), rand)], up: cardOfValue(dealer, rand) };
    case "pair": {
      const v = pick(rand, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      return { cards: [cardOfValue(v, rand), cardOfValue(v, rand)], up: cardOfValue(dealer, rand) };
    }
    default:
      return { cards: hardPair(pick(rand, HARD_TOTALS), rand), up: cardOfValue(dealer, rand) };
  }
}

/**
 * The actions allowed on an opening two-card hand at a table with these rules (the same
 * set the live game offers after the dealer has checked for blackjack).
 */
export function spotLegal(cards: readonly Card[], up: Card, rules: Rules): ActionType[] {
  if (cards.length !== 2 || isTwentyOne(cards)) return [];
  const filler = Array<Card>(24).fill("2C");
  // hole card "2C" so the dealer can't have blackjack and the hand reaches the player phase
  let s = deal(1, [cards[0], up, cards[1], "2C", ...filler], rules);
  if (s.phase === "insurance") s = { ...s, phase: "player" };
  return legalActions(s).filter((a) => a !== "insurance" && a !== "decline");
}

export const isPairSpot = (s: DrillSpot) => cardValue(s.cards[0]) === cardValue(s.cards[1]);
