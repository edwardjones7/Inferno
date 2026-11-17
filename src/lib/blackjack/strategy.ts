/**
 * Basic strategy for 4–8 decks, parameterised by the table rules that change it:
 *  - dealer hits or stands on soft 17 (H17 / S17)
 *  - double after split allowed (DAS)
 *  - late surrender allowed (LS)
 * Blackjack payout (3:2 vs 6:5) doesn't change any decision, only the house edge.
 * Used for the in-game hint, coach grading, the drill trainer and the simulations.
 */
import { cardValue, handTotal, type Card } from "./cards";
import { DEFAULT_RULES, type ActionType, type Rules } from "./engine";

export type Move = "hit" | "stand" | "double" | "split" | "surrender";

export function basicStrategy(cards: readonly Card[], dealerUp: Card, legal: readonly ActionType[], rules: Rules = DEFAULT_RULES): Move {
  // Never trust `legal` alone: only pairs split, only opening hands double/surrender.
  const opening = cards.length === 2;
  const pair = opening && cardValue(cards[0]) === cardValue(cards[1]);
  const can = (m: Move) =>
    legal.includes(m) && (m === "split" ? pair : m === "double" || m === "surrender" ? opening : true);
  const d = cardValue(dealerUp) === 1 ? 11 : cardValue(dealerUp);
  const { total, soft } = handTotal(cards);
  const between = (lo: number, hi: number) => d >= lo && d <= hi;
  const doubleOr = (fallback: Move): Move => (can("double") ? "double" : fallback);
  const h17 = rules.dealerHitsSoft17;
  const das = rules.doubleAfterSplit;
  const pairValue = pair ? cardValue(cards[0]) : 0;

  // Late surrender
  if (can("surrender") && !soft) {
    if (pairValue === 8) {
      if (h17 && d === 11) return "surrender"; // H17: surrender 8,8 vs A when allowed
    } else if ((total === 16 && d >= 9) || (total === 15 && (d === 10 || (h17 && d === 11))) || (h17 && total === 17 && d === 11)) {
      return "surrender";
    }
  }

  // Pairs
  if (can("split")) {
    const v = pairValue;
    const split =
      v === 1 ||
      v === 8 ||
      (v === 9 && (between(2, 6) || d === 8 || d === 9)) ||
      (v === 7 && between(2, 7)) ||
      (v === 6 && (das ? between(2, 6) : between(3, 6))) ||
      (v === 4 && das && between(5, 6)) ||
      ((v === 2 || v === 3) && (das ? between(2, 7) : between(4, 7)));
    if (split) return "split";
  }

  if (soft) {
    if (total >= 20) return "stand";
    if (total === 19) return h17 && d === 6 ? doubleOr("stand") : "stand";
    if (total === 18) {
      if (between(3, 6) || (h17 && d === 2)) return doubleOr("stand");
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
  if (total === 11) return d === 11 && !h17 ? "hit" : doubleOr("hit");
  if (total === 10) return between(2, 9) ? doubleOr("hit") : "hit";
  if (total === 9) return between(3, 6) ? doubleOr("hit") : "hit";
  return "hit";
}

/* ------------------------------------------------------------------ spots */

export type SpotKind = "hard" | "soft" | "pair";

export interface Spot {
  /** stable id, e.g. "hard-16-10", "soft-18-2", "pair-8-11" (dealer A = 11) */
  key: string;
  kind: SpotKind;
  /** player total (hard/soft) or pair card value (A = 1) */
  value: number;
  /** dealer upcard value, A = 11 */
  dealer: number;
  label: string;
}

const upLabel = (d: number) => (d === 11 ? "A" : String(d));
/** "a 6", "an 8", "an ace" */
const vsUp = (d: number) => (d === 11 ? "an ace" : d === 8 ? "an 8" : `a ${d}`);
const pairLabel = (v: number) => (v === 1 ? "A,A" : v === 10 ? "10,10" : `${v},${v}`);

/** Classify an opening decision into a chart cell. Multi-card hands use their total. */
export function spotOf(cards: readonly Card[], dealerUp: Card): Spot {
  const d = cardValue(dealerUp) === 1 ? 11 : cardValue(dealerUp);
  if (cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1])) {
    const v = cardValue(cards[0]);
    return { key: `pair-${v}-${d}`, kind: "pair", value: v, dealer: d, label: `${pairLabel(v)} vs ${upLabel(d)}` };
  }
  const { total, soft } = handTotal(cards);
  const kind: SpotKind = soft ? "soft" : "hard";
  return { key: `${kind}-${total}-${d}`, kind, value: total, dealer: d, label: `${soft ? "Soft" : "Hard"} ${total} vs ${upLabel(d)}` };
}

/** Human label for a stored spot key ("soft-18-2" → "Soft 18 vs 2"). */
export function spotLabel(key: string): string {
  if (key === "insurance") return "Insurance offered";
  const [kind, v, d] = key.split("-");
  const value = Number(v);
  const dealer = Number(d);
  if (kind === "pair") return `${pairLabel(value)} vs ${upLabel(dealer)}`;
  return `${kind === "soft" ? "Soft" : "Hard"} ${value} vs ${upLabel(dealer)}`;
}

export const MOVE_LABEL: Record<Move, string> = { hit: "Hit", stand: "Stand", double: "Double", split: "Split", surrender: "Surrender" };

const ALL_MOVES: ActionType[] = ["hit", "stand", "double", "split", "surrender"];
const repCard = (v: number, suit: "S" | "H") => `${v === 1 || v === 11 ? "A" : v === 10 ? "T" : v}${suit}` as Card;

/**
 * The chart play for a spot with every option available (double, split, and surrender if
 * the rules offer it). Differs from `basicStrategy` on a real hand when the chart play isn't
 * allowed there: a three-card 11, a split limit, no double after split.
 */
export function chartMove(spot: Spot, rules: Rules = DEFAULT_RULES): Move {
  const legal = rules.surrender ? ALL_MOVES : ALL_MOVES.filter((m) => m !== "surrender");
  const up = repCard(spot.dealer, "H");
  if (spot.kind === "pair") return basicStrategy([repCard(spot.value, "S"), repCard(spot.value, "H")], up, legal, rules);
  if (spot.kind === "soft") {
    if (spot.value <= 12) return "hit";
    if (spot.value >= 21) return "stand";
    return basicStrategy([repCard(1, "S"), repCard(spot.value - 11, "H")], up, legal, rules);
  }
  for (let a = 2; a <= 10; a++) {
    const b = spot.value - a;
    if (b >= 2 && b <= 10 && a !== b) return basicStrategy([repCard(a, "S"), repCard(b, "H")], up, legal, rules);
  }
  return spot.value >= 17 ? "stand" : "hit";
}

/**
 * One-line reason behind the correct play, for coach feedback and the drill trainer.
 * Pass `chart` (from `chartMove`) when grading a real hand: if the chart play wasn't
 * allowed, the reason says so instead of explaining the fallback as if it were the chart.
 */
export function explain(spot: Spot, correct: Move, chart: Move = correct): string {
  const { kind, value, dealer } = spot;
  const weakDealer = dealer >= 2 && dealer <= 6;
  if (chart !== correct)
    return `${MOVE_LABEL[chart]} is the chart play, but it isn't allowed on this hand, so ${MOVE_LABEL[correct].toLowerCase()} instead.`;
  if (correct === "surrender") return "You lose this hand often enough that giving up half the bet costs less than playing it.";
  if (kind === "pair") {
    if (value === 1) return "Always split aces: two hands starting from 11 beat one soft 12.";
    if (value === 8) return "Always split 8s: 16 is the worst total, two hands starting from 8 are far better.";
    if (value === 10) return "Never split tens: 20 already wins most hands.";
    if (value === 5) return `Never split 5s: play them as a hard 10${correct === "double" ? " and double" : correct === "hit" ? ", which only hits against a 10 or ace" : ""}.`;
    if (correct === "split") return weakDealer ? "The dealer is likely to bust, so put more money out with two hands." : "Splitting turns a weak total into two playable hands here.";
    if (value === 9) return dealer === 7 ? "Stand: 18 already beats the dealer's most likely total of 17." : "Stand on 18: two hands starting from 9 do even worse against a 10 or ace.";
    if (weakDealer) return `Two hands starting from ${value} are worse than one hard ${value * 2} against ${vsUp(dealer)}: don't split.`;
    return "Splitting here just makes two weak hands against a strong dealer card.";
  }
  if (correct === "double") {
    return kind === "soft"
      ? "Soft hands can't bust with one card, and this dealer card busts often: press the advantage."
      : `${value} is a strong start for one more card, so double your bet while you're ahead.`;
  }
  if (correct === "stand") {
    if (kind === "soft") return "Your total is already good enough; a hit is more likely to make it worse.";
    if (value >= 17) return "Hitting 17 or more busts too often.";
    return weakDealer ? "The dealer shows a bust card: let them take the risk of drawing." : "Standing is the lesser evil here.";
  }
  // hit
  if (kind === "soft") return "You can't bust a soft hand with one card, and this total won't win often enough as is.";
  if (value <= 11) {
    return value >= 9
      ? `You can't bust, but ${value} isn't strong enough to double against ${vsUp(dealer)}: just take a card.`
      : "You can't bust, so always take a card.";
  }
  return dealer >= 7 ? "Against a 7 or higher the dealer usually makes 17+, so a stiff hand has to improve." : "Hit: the dealer isn't weak enough here to stand on this total.";
}
