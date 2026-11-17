/**
 * Expected value of each blackjack play, in units of the original bet (+1 = win the bet,
 * -1 = lose it). Used to tell the player what a mistake costs ("hitting 16 vs 10 costs
 * ~0.1% of your bet vs standing") and to show an EV breakdown per spot.
 *
 * Model and approximations (good to within a few tenths of a percent of exact
 * 6-deck composition-dependent numbers, which is plenty for coaching):
 *  - Infinite deck: every draw is A..9 with p = 1/13 and a ten-value card with p = 4/13,
 *    independent of the cards already dealt. The table's deck count is therefore ignored.
 *  - The dealer peeks with an A or ten up (see engine.ts), so by the time the player acts
 *    the dealer doesn't have blackjack: the hole card is drawn conditioned on that.
 *  - Dealer hits soft 17 only under H17 rules.
 *  - Hit/stand EVs are recursive over (hard sum, holds an ace), memoised per rules + upcard.
 *  - Double = 2 × EV of standing after exactly one more card.
 *  - Surrender = -0.5.
 *  - Split = 2 × EV of one hand that starts from a single card of the pair: re-splitting
 *    is ignored (a second pair card is just played as a total), split aces get exactly one
 *    card each (A + ten is 21, not blackjack), doubling afterwards only with DAS, and
 *    no surrender after a split. Both hands are treated as independent.
 *  - Multi-card hands (after a hit) only get hit/stand.
 */
import { cardValue, type Card } from "./cards";
import { DEFAULT_RULES, type ActionType, type Rules } from "./engine";
import type { Move } from "./strategy";

/** Draw probabilities by card value, index 1..10 (1 = ace). Infinite deck. */
const P: readonly number[] = [0, 1 / 13, 1 / 13, 1 / 13, 1 / 13, 1 / 13, 1 / 13, 1 / 13, 1 / 13, 1 / 13, 4 / 13];

/** Dealer final distribution: index 0..4 = 17..21, index 5 = bust. */
type DealerDist = number[];

const softTotal = (sum: number, ace: boolean) => (ace && sum + 10 <= 21 ? sum + 10 : sum);

function dealerFrom(sum: number, ace: boolean, h17: boolean, memo: Map<number, DealerDist>): DealerDist {
  const total = softTotal(sum, ace);
  const soft = total !== sum;
  if (total > 21) return [0, 0, 0, 0, 0, 1];
  if (total > 17 || (total === 17 && !(soft && h17))) {
    const d = [0, 0, 0, 0, 0, 0];
    d[total - 17] = 1;
    return d;
  }
  const key = sum * 2 + (ace ? 1 : 0);
  const hit = memo.get(key);
  if (hit) return hit;
  const out = [0, 0, 0, 0, 0, 0];
  for (let c = 1; c <= 10; c++) {
    const next = dealerFrom(sum + c, ace || c === 1, h17, memo);
    for (let i = 0; i < 6; i++) out[i] += P[c] * next[i];
  }
  memo.set(key, out);
  return out;
}

/** Dealer outcome distribution for an upcard (value 1..10), given no dealer blackjack. */
function dealerDist(up: number, h17: boolean): DealerDist {
  const memo = new Map<number, DealerDist>();
  const out = [0, 0, 0, 0, 0, 0];
  let mass = 0;
  for (let c = 1; c <= 10; c++) {
    if ((up === 1 && c === 10) || (up === 10 && c === 1)) continue; // peeked: no blackjack
    mass += P[c];
    const next = dealerFrom(up + c, up === 1 || c === 1, h17, memo);
    for (let i = 0; i < 6; i++) out[i] += P[c] * next[i];
  }
  return out.map((x) => x / mass);
}

interface UpTables {
  dist: DealerDist;
  /** stand EV by player total 0..21 */
  stand: number[];
  /** best of hit/stand, by key sum*2+ace (sum = hard sum, ace = holds an ace) */
  best: Map<number, number>;
  /** EV of hitting once and then playing on optimally */
  hit: Map<number, number>;
  split: Map<string, number>;
}

const tables = new Map<string, UpTables>();

function tablesFor(up: number, h17: boolean): UpTables {
  const key = `${up}|${h17 ? 1 : 0}`;
  let t = tables.get(key);
  if (t) return t;
  const dist = dealerDist(up, h17);
  const stand: number[] = [];
  for (let total = 0; total <= 21; total++) {
    let ev = dist[5];
    for (let d = 17; d <= 21; d++) ev += dist[d - 17] * (total > d ? 1 : total < d ? -1 : 0);
    stand.push(ev);
  }
  t = { dist, stand, best: new Map(), hit: new Map(), split: new Map() };
  tables.set(key, t);
  return t;
}

function standEV(t: UpTables, sum: number, ace: boolean): number {
  const total = softTotal(sum, ace);
  return total > 21 ? -1 : t.stand[total];
}

function hitEV(t: UpTables, sum: number, ace: boolean): number {
  const key = sum * 2 + (ace ? 1 : 0);
  const cached = t.hit.get(key);
  if (cached !== undefined) return cached;
  let ev = 0;
  for (let c = 1; c <= 10; c++) ev += P[c] * bestEV(t, sum + c, ace || c === 1);
  t.hit.set(key, ev);
  return ev;
}

/** Best of hit/stand from here (21 stands, a bust loses). */
function bestEV(t: UpTables, sum: number, ace: boolean): number {
  const total = softTotal(sum, ace);
  if (total > 21) return -1;
  if (total === 21) return t.stand[21];
  const key = sum * 2 + (ace ? 1 : 0);
  const cached = t.best.get(key);
  if (cached !== undefined) return cached;
  const ev = Math.max(t.stand[total], hitEV(t, sum, ace));
  t.best.set(key, ev);
  return ev;
}

function doubleEV(t: UpTables, sum: number, ace: boolean): number {
  let ev = 0;
  for (let c = 1; c <= 10; c++) ev += P[c] * standEV(t, sum + c, ace || c === 1);
  return 2 * ev;
}

/** EV of one split hand starting from a card of value v (per unit bet on that hand). */
function splitHandEV(t: UpTables, v: number, das: boolean): number {
  const key = `${v}|${das ? 1 : 0}`;
  const cached = t.split.get(key);
  if (cached !== undefined) return cached;
  let ev = 0;
  for (let c = 1; c <= 10; c++) {
    const sum = v + c;
    const ace = v === 1 || c === 1;
    let hand: number;
    if (v === 1) hand = standEV(t, sum, ace); // split aces: one card only
    else if (softTotal(sum, ace) === 21) hand = t.stand[21];
    else {
      hand = Math.max(t.stand[softTotal(sum, ace)], hitEV(t, sum, ace));
      if (das) hand = Math.max(hand, doubleEV(t, sum, ace));
    }
    ev += P[c] * hand;
  }
  t.split.set(key, ev);
  return ev;
}

export type MoveEVs = Partial<Record<Move, number>>;

/**
 * EV of each play available on this hand vs this dealer upcard, as a fraction of the
 * original bet. Double, split and surrender are only considered on two-card hands (split
 * only on pairs, surrender only when the rules allow it). Pass `legal` (e.g. the engine's
 * `legalActions`) to restrict further, for instance after a split.
 */
export function moveEVs(cards: readonly Card[], dealerUp: Card, rules: Rules = DEFAULT_RULES, legal?: readonly ActionType[]): MoveEVs {
  const t = tablesFor(cardValue(dealerUp), rules.dealerHitsSoft17);
  let sum = 0;
  let ace = false;
  for (const c of cards) {
    const v = cardValue(c);
    sum += v;
    if (v === 1) ace = true;
  }
  const allowed = (m: Move) => !legal || legal.includes(m);
  const out: MoveEVs = {};
  if (softTotal(sum, ace) > 21) return out;
  if (allowed("stand")) out.stand = standEV(t, sum, ace);
  if (allowed("hit")) out.hit = hitEV(t, sum, ace);
  if (cards.length === 2) {
    if (allowed("double")) out.double = doubleEV(t, sum, ace);
    const v = cardValue(cards[0]);
    if (v === cardValue(cards[1]) && allowed("split")) out.split = 2 * splitHandEV(t, v, rules.doubleAfterSplit);
    if (rules.surrender && allowed("surrender")) out.surrender = -0.5;
  }
  return out;
}

/** The highest-EV play and its EV. */
export function bestMove(evs: MoveEVs): { move: Move; ev: number } | null {
  let best: { move: Move; ev: number } | null = null;
  for (const [m, ev] of Object.entries(evs) as [Move, number][]) if (!best || ev > best.ev) best = { move: m, ev };
  return best;
}

/**
 * What playing `chosen` instead of `correct` gives up, as a fraction of the bet (>= 0).
 * Undefined when either play isn't available on this hand.
 */
export function mistakeCost(evs: MoveEVs, correct: Move, chosen: Move): number | undefined {
  const a = evs[correct];
  const b = evs[chosen];
  if (a === undefined || b === undefined) return undefined;
  return Math.max(0, a - b);
}

/**
 * Taking insurance on a 6-deck shoe: the insurance bet (half the main bet) wins 2:1 when
 * the hole card is a ten, 96 of the 311 unseen cards with only the dealer's ace removed,
 * so it returns 3 × 96/311 − 1 ≈ −7.4% of the insurance bet, i.e. ≈ 3.7% of the main bet.
 * A fixed constant: the player's own cards and the deck count barely move it.
 */
export const INSURANCE_COST = 0.5 * (1 - (3 * 96) / 311);

/** "4.2%" / "0.3%" / "<0.1%" */
export function formatCost(cost: number): string {
  const pct = cost * 100;
  if (pct < 0.05) return "<0.1%";
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

/** "+12.3%" / "−54.0%" EV as a signed percentage of the bet. */
export function formatEV(ev: number): string {
  const pct = ev * 100;
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
}
