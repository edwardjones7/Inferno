/**
 * Card counting with the Hi-Lo system: card values, running and true count, the standard
 * index plays (Illustrious 18 + Fab 4 surrenders) for a six-deck shoe, a bet ramp, and the
 * drill spots the counting trainer serves. Pure functions; the caller supplies randomness
 * (same contract as drill.ts) so everything here is testable.
 *
 * True count convention: running count ÷ decks remaining, FLOORED (rounded down, so -0.5
 * becomes -1). Flooring means "TC ≥ n" for an integer index n is true exactly when the
 * unrounded count is ≥ n, so index comparisons are never off by one near zero. Some books
 * truncate toward zero instead; the difference only shows for negative counts.
 */
import { buildShoe, cardValue, handTotal, rankOf, type Card, type Rank } from "./cards";
import { cardOfValue, spotFromKey, spotLegal } from "./drill";
import { DEFAULT_RULES, type ActionType, type Rules } from "./engine";
import { basicStrategy, MOVE_LABEL, spotOf, type Move } from "./strategy";

type Rand = () => number;
const pick = <T,>(rand: Rand, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const randInt = (rand: Rand, lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

/* ------------------------------------------------------------------ counting */

/** Hi-Lo tag of a rank: 2–6 are +1, 7–9 are 0, tens and aces are −1. */
export function hiLoRank(r: Rank): -1 | 0 | 1 {
  if (r === "A" || r === "T" || r === "J" || r === "Q" || r === "K") return -1;
  const n = Number(r);
  return n <= 6 ? 1 : 0;
}

export const hiLo = (c: Card) => hiLoRank(rankOf(c));

/** Running count of a sequence of cards (starting from 0). */
export const runningCount = (cards: readonly Card[]) => cards.reduce((s, c) => s + hiLo(c), 0);

/** True count: running count per deck remaining, floored (see the file header). */
export function trueCount(running: number, decksRemaining: number): number {
  if (decksRemaining <= 0) return running;
  // epsilon guards against float noise like 5.9999999 when dividing by 0.5-deck steps
  return Math.floor(running / decksRemaining + 1e-9);
}

/** Formats a count with an explicit sign: "+3", "0", "−2". */
export const fmtCount = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/** A shuffled single 52-card deck. */
export function shuffledDeck(rand: Rand, decks = 1): Card[] {
  const d = buildShoe(decks);
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/**
 * Running count kept across a shoe, for a live table. Immutable: `see` returns a new value.
 *   let rc = newCount(6);  rc = see(rc, cardsJustExposed);  trueCountOf(rc)
 * Reset with `newCount` whenever the shoe is reshuffled.
 */
export interface RunningCount {
  decks: number;
  running: number;
  /** cards seen since the shuffle */
  seen: number;
}

export const newCount = (decks = 6): RunningCount => ({ decks, running: 0, seen: 0 });

export function see(rc: RunningCount, cards: readonly Card[]): RunningCount {
  return { ...rc, running: rc.running + runningCount(cards), seen: rc.seen + cards.length };
}

/** Decks left to deal, rounded to the nearest half deck (how players eyeball the tray). */
export function decksRemainingOf(rc: RunningCount): number {
  const left = Math.max(0, rc.decks * 52 - rc.seen) / 52;
  return Math.max(0.5, Math.round(left * 2) / 2);
}

export const trueCountOf = (rc: RunningCount) => trueCount(rc.running, decksRemainingOf(rc));

/* ------------------------------------------------------------------ bets */

/**
 * A simple 1–12 unit ramp for a six-deck shoe: 1 unit at TC +1 or less, then two more
 * units per true count (TC +2 → 2, +3 → 4, +4 → 6 … capped at `maxUnits`).
 * Rough rule of thumb behind it: each +1 of true count is worth about +0.5% to the player,
 * and the house's ~0.5% edge is cancelled around TC +1.
 */
export function betUnits(tc: number, maxUnits = 12): number {
  const t = Math.floor(tc);
  if (t < 2) return 1;
  return Math.min(maxUnits, (t - 1) * 2);
}

/** Approximate player edge, percent, at a true count (6D, good rules, basic strategy). */
export const edgeAt = (tc: number) => Math.round((-0.5 + 0.5 * tc) * 10) / 10;

/* ------------------------------------------------------------------ index plays */

export type IndexMove = Move | "insurance" | "no-insurance";

export interface IndexPlay {
  /** stable id: the chart spot key, plus "-ls" for the Fab 4 (late surrender) entries */
  id: string;
  /** chart cell in spotOf() format, e.g. "hard-16-10", "pair-10-5", or "insurance" */
  spot: string;
  group: "i18" | "fab4";
  /** the S17 basic-strategy play at this spot (with surrender for Fab 4, without for I18) */
  basic: IndexMove;
  /** what to do instead once the count crosses the index */
  deviation: IndexMove;
  /** true-count threshold */
  index: number;
  /** "atLeast": deviate when TC ≥ index. "below": deviate when TC < index. */
  dir: "atLeast" | "below";
  /** why the count changes the play */
  why: string;
}

/**
 * The Illustrious 18 (Don Schlesinger, "Blackjack Attack") and the Fab 4 late-surrender
 * indices, Hi-Lo, multi-deck (4–8 decks), dealer stands on soft 17.
 *
 * These are the published S17 numbers used as rule-agnostic approximations: under H17 a few
 * shift by about one (11 vs A doubles at −1, 10 vs A at +3, 15 vs A surrenders at −1). Where
 * H17 basic strategy already makes the deviation play (11 vs A double, 15 vs A surrender),
 * countAdjustedPlay simply keeps the basic play below the index, which matches H17 well.
 */
export const INDEX_PLAYS: readonly IndexPlay[] = [
  { id: "insurance", spot: "insurance", group: "i18", basic: "no-insurance", deviation: "insurance", index: 3, dir: "atLeast",
    why: "Insurance pays 2:1 on a dealer ten. At TC +3 more than a third of the remaining cards are tens, so the side bet turns profitable." },
  { id: "hard-16-10", spot: "hard-16-10", group: "i18", basic: "hit", deviation: "stand", index: 0, dir: "atLeast",
    why: "16 vs 10 is nearly a coin flip between hitting and standing. Any surplus of tens makes the hit bust more, so stand at zero or higher." },
  { id: "hard-15-10", spot: "hard-15-10", group: "i18", basic: "hit", deviation: "stand", index: 4, dir: "atLeast",
    why: "A ten-rich shoe busts your 15 more often when you hit and makes the dealer's 10 more likely to bust too." },
  { id: "pair-10-5", spot: "pair-10-5", group: "i18", basic: "stand", deviation: "split", index: 5, dir: "atLeast",
    why: "At a high count the dealer's 5 busts so often that two hands starting from 10 earn more than one 20." },
  { id: "pair-10-6", spot: "pair-10-6", group: "i18", basic: "stand", deviation: "split", index: 4, dir: "atLeast",
    why: "The dealer's 6 is the weakest card; with extra tens left it busts often enough to justify doubling your money on two tens." },
  { id: "hard-10-10", spot: "hard-10-10", group: "i18", basic: "hit", deviation: "double", index: 4, dir: "atLeast",
    why: "With lots of tens left your 10 often becomes 20, so the double beats the dealer's ten." },
  { id: "hard-12-3", spot: "hard-12-3", group: "i18", basic: "hit", deviation: "stand", index: 2, dir: "atLeast",
    why: "A ten breaks your 12, and a ten-rich shoe also makes the dealer's 3 bust more: let the dealer draw." },
  { id: "hard-12-2", spot: "hard-12-2", group: "i18", basic: "hit", deviation: "stand", index: 3, dir: "atLeast",
    why: "Same idea as 12 vs 3, but the 2 is a stronger dealer card, so it takes a higher count." },
  { id: "hard-11-11", spot: "hard-11-11", group: "i18", basic: "hit", deviation: "double", index: 1, dir: "atLeast",
    why: "A slightly positive count tips 11 vs ace towards doubling: you catch a ten more often than the dealer has one underneath." },
  { id: "hard-9-2", spot: "hard-9-2", group: "i18", basic: "hit", deviation: "double", index: 1, dir: "atLeast",
    why: "Extra tens turn your 9 into 19 more often and bust the dealer's 2 more often." },
  { id: "hard-10-11", spot: "hard-10-11", group: "i18", basic: "hit", deviation: "double", index: 4, dir: "atLeast",
    why: "Against an ace you need a lot of tens left before doubling 10 pays." },
  { id: "hard-9-7", spot: "hard-9-7", group: "i18", basic: "hit", deviation: "double", index: 3, dir: "atLeast",
    why: "A ten-rich shoe makes 19 likely for you and 17 likely for the dealer: double." },
  { id: "hard-16-9", spot: "hard-16-9", group: "i18", basic: "hit", deviation: "stand", index: 5, dir: "atLeast",
    why: "Only at a high count do you bust 16 often enough that standing against a 9 loses less." },
  { id: "hard-13-2", spot: "hard-13-2", group: "i18", basic: "stand", deviation: "hit", index: -1, dir: "below",
    why: "A negative count means small cards are left: hitting 13 is safer and the dealer's 2 busts less." },
  { id: "hard-12-4", spot: "hard-12-4", group: "i18", basic: "stand", deviation: "hit", index: 0, dir: "below",
    why: "12 vs 4 is close. Below zero, small cards dominate, so your hit rarely busts and the dealer rarely does." },
  { id: "hard-12-5", spot: "hard-12-5", group: "i18", basic: "stand", deviation: "hit", index: -2, dir: "below",
    why: "Only a clearly negative count makes hitting 12 against a 5 worth it." },
  { id: "hard-12-6", spot: "hard-12-6", group: "i18", basic: "stand", deviation: "hit", index: -1, dir: "below",
    why: "With small cards left the dealer's 6 stops busting so often, and your hit is safe." },
  { id: "hard-13-3", spot: "hard-13-3", group: "i18", basic: "stand", deviation: "hit", index: -2, dir: "below",
    why: "At a clearly negative count, 13 vs 3 turns into a hit: few tens left to bust you." },
  // Fab 4 (late surrender available)
  { id: "hard-14-10-ls", spot: "hard-14-10", group: "fab4", basic: "hit", deviation: "surrender", index: 3, dir: "atLeast",
    why: "A ten-rich shoe makes the dealer's 10 even stronger and your hit busts more: give up half." },
  { id: "hard-15-10-ls", spot: "hard-15-10", group: "fab4", basic: "surrender", deviation: "hit", index: 0, dir: "below",
    why: "Basic strategy surrenders 15 vs 10, but below zero the small cards left make hitting the better option." },
  { id: "hard-15-9-ls", spot: "hard-15-9", group: "fab4", basic: "hit", deviation: "surrender", index: 2, dir: "atLeast",
    why: "At +2 the dealer's 9 makes 19 often enough that surrendering 15 loses less than playing it." },
  { id: "hard-15-11-ls", spot: "hard-15-11", group: "fab4", basic: "hit", deviation: "surrender", index: 1, dir: "atLeast",
    why: "A slightly positive count tips 15 vs ace into a surrender." },
];

export const indexPlayById = (id: string) => INDEX_PLAYS.find((p) => p.id === id);

export const deviates = (p: IndexPlay, tc: number) => (p.dir === "atLeast" ? tc >= p.index : tc < p.index);

const upLabel = (d: number) => (d === 11 ? "A" : String(d));

export const INDEX_MOVE_LABEL: Record<IndexMove, string> = {
  ...MOVE_LABEL,
  insurance: "Take insurance",
  "no-insurance": "Decline insurance",
};

/** "16 vs 10", "10,10 vs 5", "Insurance". */
export function indexSpotLabel(p: IndexPlay): string {
  if (p.spot === "insurance") return "Insurance";
  const [kind, v, d] = p.spot.split("-");
  if (kind === "pair") return `${v === "10" ? "10,10" : `${v},${v}`} vs ${upLabel(Number(d))}`;
  return `${v} vs ${upLabel(Number(d))}`;
}

/** "Stand at +0 or higher", "Hit below −1". */
export function indexRule(p: IndexPlay): string {
  const move = INDEX_MOVE_LABEL[p.deviation];
  return p.dir === "atLeast" ? `${move} at ${fmtCount(p.index)} or higher` : `${move} below ${fmtCount(p.index)}`;
}

/** Chart key used for index lookup: 5,5 plays as a hard 10. */
function lookupKey(cards: readonly Card[], up: Card): string {
  const key = spotOf(cards, up).key;
  const m = /^pair-5-(\d+)$/.exec(key);
  return m ? `hard-10-${m[1]}` : key;
}

/**
 * The index entry that governs this decision, or null when the count can't change it.
 * With late surrender available the Fab 4 entry wins, and spots basic strategy already
 * surrenders (16 vs 9/10/A) aren't overridden by the I18 stand indices.
 */
export function indexFor(cards: readonly Card[], up: Card, legal: readonly ActionType[], rules: Rules = DEFAULT_RULES): IndexPlay | null {
  const key = lookupKey(cards, up);
  const entries = INDEX_PLAYS.filter((p) => p.spot === key);
  if (!entries.length) return null;
  const canSurrender = cards.length === 2 && legal.includes("surrender") && rules.surrender !== false;
  if (canSurrender) {
    const fab = entries.find((p) => p.group === "fab4");
    if (fab) return fab;
    if (basicStrategy(cards, up, legal, rules) === "surrender") return null;
  }
  return entries.find((p) => p.group === "i18") ?? null;
}

/**
 * Basic strategy adjusted for the count: the deviation play when an index applies and the
 * true count is past it (and the deviation is legal here), basic strategy otherwise.
 */
export function countAdjustedPlay(cards: readonly Card[], up: Card, legal: readonly ActionType[], rules: Rules, tc: number): Move {
  const basic = basicStrategy(cards, up, legal, rules);
  const entry = indexFor(cards, up, legal, rules);
  if (!entry || !deviates(entry, tc)) return basic;
  const dev = entry.deviation;
  if (dev === "insurance" || dev === "no-insurance") return basic;
  const opening = cards.length === 2;
  const pair = opening && cardValue(cards[0]) === cardValue(cards[1]);
  const ok =
    legal.includes(dev) && (dev === "split" ? pair : dev === "double" || dev === "surrender" ? opening : true);
  return ok ? dev : basic;
}

/** Insurance with a Hi-Lo count: take it at TC +3 or higher. */
export const shouldInsure = (tc: number) => tc >= 3;

/* ------------------------------------------------------------------ drill spots */

export type CountDrillKind = "count" | "truecount" | "index";

export interface RunningSpot {
  kind: "count";
  key: "count-running";
  cards: Card[];
  answer: number;
}

export interface TrueCountSpot {
  kind: "truecount";
  key: "count-true";
  running: number;
  /** in half-deck steps */
  decksRemaining: number;
  /** decks in the shoe (for the discard-tray picture) */
  decks: number;
  answer: number;
  /** four multiple-choice options, ascending, including the answer */
  choices: number[];
}

export interface IndexSpot {
  kind: "index";
  /** "index-" + IndexPlay.id, e.g. "index-hard-16-10", "index-hard-15-10-ls", "index-insurance" */
  key: string;
  play: IndexPlay;
  cards: [Card, Card];
  up: Card;
  trueCount: number;
  rules: Rules;
  /** the choices to offer */
  legal: IndexMove[];
  answer: IndexMove;
  /** true when the answer differs from basic strategy */
  deviation: boolean;
}

export type CountSpot = RunningSpot | TrueCountSpot | IndexSpot;

/** A run of `n` cards from a fresh six-deck shoe to keep a running count on. */
export function runningSpot(rand: Rand, n = 12): RunningSpot {
  const cards = shuffledDeck(rand, 6).slice(0, n);
  return { kind: "count", key: "count-running", cards, answer: runningCount(cards) };
}

/** A running count and a discard tray to convert into a true count. */
export function trueCountSpot(rand: Rand, decks = 6): TrueCountSpot {
  const halfSteps = randInt(rand, 1, decks * 2 - 1); // 0.5 … 5.5 decks left
  const decksRemaining = halfSteps / 2;
  const target = randInt(rand, -3, 7);
  // any running count whose floored true count is `target`
  const lo = Math.ceil(target * decksRemaining - 1e-9);
  const hi = Math.ceil((target + 1) * decksRemaining - 1e-9) - 1;
  const running = randInt(rand, lo, Math.max(lo, hi));
  const answer = trueCount(running, decksRemaining);
  const wrong = new Set<number>();
  const trunc = Math.trunc(running / decksRemaining);
  const decksPlayed = decks - decksRemaining;
  const candidates = [
    trunc,
    Math.round(running / decksRemaining),
    decksPlayed > 0 ? Math.floor(running / decksPlayed) : answer + 2, // divided by the tray, not the shoe
    answer + 1,
    answer - 1,
    answer + 2,
    answer - 2,
  ];
  for (const c of candidates) if (c !== answer && wrong.size < 3) wrong.add(c);
  const choices = [answer, ...wrong].sort((a, b) => a - b);
  return { kind: "truecount", key: "count-true", running, decksRemaining, decks, answer, choices };
}

/** Index drill: rules for the spot (surrender only on Fab 4 spots, so the I18 stand indices are live). */
export const indexRules = (p: IndexPlay): Rules => ({ ...DEFAULT_RULES, dealerHitsSoft17: false, surrender: p.group === "fab4" });

/** An index-play spot, with a true count on the deviation side about half the time. */
export function indexSpot(rand: Rand, play: IndexPlay = pick(rand, INDEX_PLAYS)): IndexSpot {
  const dev = rand() < 0.5;
  const above = play.dir === "atLeast" ? dev : !dev;
  const tc = above ? play.index + randInt(rand, 0, 3) : play.index - randInt(rand, 1, 3);
  const rules = indexRules(play);
  if (play.spot === "insurance") {
    const up = cardOfValue(1, rand);
    let cards: [Card, Card];
    do {
      cards = [cardOfValue(randInt(rand, 2, 10), rand), cardOfValue(randInt(rand, 2, 10), rand)];
    } while (handTotal(cards).total === 21);
    const answer: IndexMove = shouldInsure(tc) ? "insurance" : "no-insurance";
    return { kind: "index", key: `index-${play.id}`, play, cards, up, trueCount: tc, rules, legal: ["insurance", "no-insurance"], answer, deviation: answer !== play.basic };
  }
  const s = spotFromKey(play.spot, rand)!;
  const legal = spotLegal(s.cards, s.up, rules);
  const answer = countAdjustedPlay(s.cards, s.up, legal, rules, tc);
  const basic = basicStrategy(s.cards, s.up, legal, rules);
  return { kind: "index", key: `index-${play.id}`, play, cards: s.cards, up: s.up, trueCount: tc, rules, legal: legal.filter(isMove), answer, deviation: answer !== basic };
}

const isMove = (a: ActionType): a is Move => a === "hit" || a === "stand" || a === "double" || a === "split" || a === "surrender";

/**
 * Regenerate a fresh spot testing the same concept as a stored drill key, for the
 * spaced-repetition queue. Keys: "count-running", "count-true", "index-<IndexPlay.id>".
 * Returns null for keys this module doesn't own.
 */
export function countSpotForKey(key: string, rand: Rand): CountSpot | null {
  if (key === "count-running") return runningSpot(rand);
  if (key === "count-true") return trueCountSpot(rand);
  if (key.startsWith("index-")) {
    const play = indexPlayById(key.slice(6));
    return play ? indexSpot(rand, play) : null;
  }
  return null;
}

/** Human label for a counting drill key (stored on drill records and SRS cards). */
export function countKeyLabel(key: string): string {
  if (key === "count-running") return "Running count";
  if (key === "count-true") return "True count conversion";
  const play = key.startsWith("index-") ? indexPlayById(key.slice(6)) : undefined;
  return play ? `Index: ${indexSpotLabel(play)}${play.group === "fab4" ? " (surrender)" : ""}` : key;
}

/* ------------------------------------------------------------------ grading */

export interface CountGrade {
  ok: boolean;
  /** the right answer, as stored on the drill record */
  correct: string;
  /** one-line explanation for feedback */
  why: string;
}

/** Shape compatible with store.recordDrills() entries. */
export interface CountDrillRecord {
  game: "blackjack";
  key: string;
  label: string;
  kind: CountDrillKind;
  correct: string;
  ok: boolean;
}

export function gradeRunning(spot: RunningSpot, answer: number): CountGrade {
  const ok = answer === spot.answer;
  return { ok, correct: fmtCount(spot.answer), why: ok ? "Count is right." : `The running count was ${fmtCount(spot.answer)}, not ${fmtCount(answer)}.` };
}

export function gradeTrueCount(spot: TrueCountSpot, answer: number): CountGrade {
  const ok = answer === spot.answer;
  const exact = spot.running / spot.decksRemaining;
  return {
    ok,
    correct: fmtCount(spot.answer),
    why: `${fmtCount(spot.running)} ÷ ${spot.decksRemaining} deck${spot.decksRemaining === 1 ? "" : "s"} = ${exact.toFixed(2).replace(/\.?0+$/, "")}, rounded down to ${fmtCount(spot.answer)}.`,
  };
}

export function gradeIndex(spot: IndexSpot, chosen: IndexMove): CountGrade {
  const ok = chosen === spot.answer;
  const p = spot.play;
  const tc = fmtCount(spot.trueCount);
  const why = spot.deviation
    ? `Deviation: basic strategy says ${INDEX_MOVE_LABEL[p.basic].toLowerCase()}, but the index is “${indexRule(p).toLowerCase()}” and the count is ${tc}. ${p.why}`
    : `No deviation at ${tc}: the index is “${indexRule(p).toLowerCase()}”, so play basic strategy.`;
  return { ok, correct: spot.answer, why };
}

export function countRecord(spot: CountSpot, grade: CountGrade): CountDrillRecord {
  return { game: "blackjack", key: spot.key, label: countKeyLabel(spot.key), kind: spot.kind, correct: grade.correct, ok: grade.ok };
}
