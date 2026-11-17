/**
 * Post-flop building blocks shared by the drills (drills.ts) and the live coach
 * (table-coach.ts): board texture, who a flop favours, a coarse hand class, range-vs-hand
 * counting, and the textbook c-bet / sizing heuristics.
 *
 * Everything here is a deterministic rule of thumb, written down so the grading can be
 * explained in one sentence. None of it is solver output.
 */
import { rankOf, suitOf, type Card, type Suit } from "../blackjack/cards";
import { hasDraw } from "./bots";
import { CATEGORIES, categoryOf, evaluate, RANK_VALUE } from "./eval";
import { parseRange, RANKS } from "./ranges";

const val = (c: Card) => RANK_VALUE[rankOf(c)];

/* ------------------------------------------------------------------ texture */

export type Texture = "dry" | "semiwet" | "wet" | "paired" | "monotone";
export const TEXTURES: Texture[] = ["dry", "semiwet", "wet", "paired", "monotone"];
export const TEXTURE_NAME: Record<Texture, string> = { dry: "Dry", semiwet: "Semi-wet", wet: "Wet", paired: "Paired", monotone: "Monotone" };

export type Favors = "raiser" | "caller" | "neutral";

export interface FlopInfo {
  texture: Texture;
  /** value of the top card, 2..14 */
  high: number;
  paired: boolean;
  monotone: boolean;
  twoTone: boolean;
  /** a straight is possible: three distinct ranks inside a five-rank window (ace high or low) */
  connected: boolean;
  favors: Favors;
}

/** Width of the smallest window holding every rank, counting the ace high or low. */
function span(vals: number[]): number {
  const hi = Math.max(...vals) - Math.min(...vals);
  const low = vals.map((v) => (v === 14 ? 1 : v));
  return Math.min(hi, Math.max(...low) - Math.min(...low));
}

/**
 * Classify a flop (first three board cards). Rules, in priority order:
 * 1. paired: two cards share a rank (paired boards are never monotone);
 * 2. monotone: all three cards one suit;
 * 3. wet: two-tone (flush draws) AND connected (straight possible);
 * 4. semi-wet: exactly one of two-tone / connected;
 * 5. dry: rainbow and no straight possible.
 *
 * Who it favours, heads-up, opener vs big-blind caller:
 * - raiser: ace- or king-high and dry or paired. The opener has far more big aces and kings
 *   (and the big pairs the blind would have 3-bet), the caller rarely hits a K-7-2.
 * - caller: nine-high or lower, connected and unpaired. The blind defends many more small
 *   suited and connected hands, so it makes more two pairs, sets and straights there.
 * - neutral: everything in between.
 */
export function flopInfo(board: readonly Card[]): FlopInfo {
  const f = board.slice(0, 3);
  const vals = f.map(val);
  const distinct = [...new Set(vals)];
  const suits = new Set(f.map(suitOf));
  const paired = distinct.length < 3;
  const monotone = suits.size === 1;
  const twoTone = suits.size === 2;
  const connected = distinct.length === 3 && span(distinct) <= 4;
  const high = Math.max(...vals);
  const texture: Texture = paired ? "paired" : monotone ? "monotone" : twoTone && connected ? "wet" : twoTone || connected ? "semiwet" : "dry";
  const favors: Favors =
    high >= 13 && (texture === "dry" || texture === "paired") ? "raiser" : high <= 9 && connected && !paired ? "caller" : "neutral";
  return { texture, high, paired, monotone, twoTone, connected, favors };
}

/** One-line plain-English reason for a texture call. */
export function textureWhy(i: FlopInfo): string {
  switch (i.texture) {
    case "paired":
      return "Two cards share a rank: few hands connect, so it plays dry.";
    case "monotone":
      return "All three cards are one suit: flushes are already possible.";
    case "wet":
      return "Two of a suit and three cards inside a five-rank window: flush and straight draws everywhere.";
    case "semiwet":
      return i.twoTone ? "Two of a suit gives flush draws, but the ranks are too spread for many straights." : "Rainbow, but the ranks are close enough for straight draws.";
    default:
      return "Rainbow and spread out: no flush draws and no straight possible.";
  }
}

export function favorsWhy(i: FlopInfo): string {
  if (i.favors === "raiser") return "Ace- or king-high dry boards hit the opener's big cards; the big blind's small connected hands miss.";
  if (i.favors === "caller") return "Low connected boards hit the big blind's suited connectors and small pairs; the opener's big cards miss.";
  return "Middling boards hit both ranges about evenly.";
}

/* ------------------------------------------------------------------ hand class */

/**
 * Coarse strength of hero's hand on a board, counting only what the hole cards add:
 * - strong: two pair or better made with a hole card (on a paired board: trips or better);
 * - overpair: pocket pair above every board card;
 * - toppair: a hole card pairs the top board card;
 * - medium: any other pair made with a hole card (middle/bottom pair, underpair);
 * - draw: no pair, but a flush draw or open-ended straight draw (flop/turn only);
 * - air: nothing.
 */
export type HandClass = "strong" | "overpair" | "toppair" | "medium" | "draw" | "air";
export const HAND_CLASS_NAME: Record<HandClass, string> = {
  strong: "two pair or better",
  overpair: "an overpair",
  toppair: "top pair",
  medium: "a medium pair",
  draw: "a draw",
  air: "no pair, no draw",
};

export function handClass(hole: readonly Card[], board: readonly Card[]): HandClass {
  const cat = categoryOf(evaluate([...hole, ...board]));
  const boardCat = categoryOf(evaluate(board));
  const bv = board.map(val);
  const top = Math.max(...bv);
  const boardPaired = new Set(bv).size < bv.length;
  if (cat > boardCat && (cat >= 3 || (cat === 2 && !boardPaired))) return "strong";
  const [a, b] = hole.map(val);
  if (a === b) return a > top ? "overpair" : "medium";
  const hits = [a, b].filter((v) => bv.includes(v));
  if (hits.length) return Math.max(...hits) === top ? "toppair" : "medium";
  return hasDraw(hole, board) ? "draw" : "air";
}

/* ------------------------------------------------------------------ ranges */

/** The big blind's flat-call range against a late-position open (3-bets QQ+/AK removed). */
export const BB_DEFEND_NOTATION =
  "22-JJ, A2s-AQs, K2s+, Q4s+, J6s+, T6s+, 96s+, 85s+, 74s+, 63s+, 53s+, 43s, A2o-AQo, K8o+, Q9o+, J9o+, T8o+, 98o, 87o";

/** `parseRange` plus "22-JJ" / "A2s-AQs" style closed intervals. */
export function parseRangeWithDashes(notation: string): Set<string> {
  const out = new Set<string>();
  for (const part of notation.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\w\w\w?)-(\w\w\w?)$/.exec(part);
    if (!m) {
      for (const c of parseRange(part)) out.add(c);
      continue;
    }
    const [lo, hi] = [m[1], m[2]];
    if (lo[0] === lo[1]) {
      const [i, j] = [RANKS.indexOf(hi[0]), RANKS.indexOf(lo[0])];
      for (let k = i; k <= j; k++) out.add(RANKS[k] + RANKS[k]);
    } else {
      const [i, j] = [RANKS.indexOf(hi[1]), RANKS.indexOf(lo[1])];
      for (let k = i; k <= j; k++) out.add(lo[0] + RANKS[k] + (lo[2] ?? ""));
    }
  }
  return out;
}

export const BB_DEFEND = parseRangeWithDashes(BB_DEFEND_NOTATION);

const SUITS: Suit[] = ["S", "H", "D", "C"];

/** Every two-card combo of a hand code ("AKs" = 4, "AKo" = 12, "77" = 6). */
export function combosOfCode(code: string): [Card, Card][] {
  const [r1, r2] = [code[0], code[1]];
  const out: [Card, Card][] = [];
  if (r1 === r2) {
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) out.push([`${r1}${SUITS[i]}` as Card, `${r2}${SUITS[j]}` as Card]);
    return out;
  }
  for (const s1 of SUITS)
    for (const s2 of SUITS) {
      if ((code[2] === "s") !== (s1 === s2)) continue;
      out.push([`${r1}${s1}` as Card, `${r2}${s2}` as Card]);
    }
  return out;
}

/** Villain's hand "connects": improves on the board (pair or better with a hole card) or holds a draw. */
export const connects = (v: readonly Card[], board: readonly Card[]) =>
  categoryOf(evaluate([...v, ...board])) > categoryOf(evaluate(board)) || hasDraw(v, board);

export interface RangeRead {
  /** combos left after removing hero's cards and the board (and the line's filter) */
  live: number;
  beat: number;
  tie: number;
  /** share of live combos ahead of hero right now, chops counted as half */
  share: number;
  /** combos ahead of hero, by hand category (e.g. "Three of a kind": 12) */
  byCategory: Record<string, number>;
}

/** Count villain's combos that beat hero's made hand right now (no future cards). */
export function readRange(hero: readonly Card[], board: readonly Card[], range: Set<string>, filter?: (v: [Card, Card]) => boolean): RangeRead {
  const dead = new Set<Card>([...hero, ...board]);
  const mine = evaluate([...hero, ...board]);
  let live = 0;
  let beat = 0;
  let tie = 0;
  const byCategory: Record<string, number> = {};
  for (const code of range)
    for (const v of combosOfCode(code)) {
      if (dead.has(v[0]) || dead.has(v[1])) continue;
      if (filter && !filter(v)) continue;
      live++;
      const s = evaluate([...v, ...board]);
      if (s > mine) {
        beat++;
        const name = CATEGORIES[categoryOf(s)];
        byCategory[name] = (byCategory[name] ?? 0) + 1;
      } else if (s === mine) tie++;
    }
  return { live, beat, tie, share: live ? (beat + tie / 2) / live : 0, byCategory };
}

/** Villain lines for the hand-reading drill: a pre-flop range plus an optional post-flop filter. */
export const LINES = {
  utg: {
    text: "UTG opened, you called on the button. UTG bets the flop.",
    notation: "55+, A2s+, KTs+, Q9s+, J9s+, T9s, 98s, 87s, 76s, ATo+, KJo+, QJo",
    street: 3,
    filter: null,
    filterText: "",
  },
  threebet: {
    text: "You opened the cutoff, the button 3-bet and you called. He bets the flop.",
    notation: "TT+, AQs+, AKo, KQs, A5s, A4s",
    street: 3,
    filter: null,
    filterText: "",
  },
  fourbet: {
    text: "You 3-bet, villain 4-bet and you called. Villain bets the flop.",
    notation: "QQ+, AKs, AKo",
    street: 3,
    filter: null,
    filterText: "",
  },
  checkraise: {
    text: "You opened the button, the big blind called, then check-raised your flop bet.",
    notation: BB_DEFEND_NOTATION,
    street: 3,
    filter: "connects",
    filterText: "Check-raises are pairs or better, plus draws.",
  },
  calldown: {
    text: "The big blind defended and check-called flop and turn. You bet the river; he calls.",
    notation: BB_DEFEND_NOTATION,
    street: 5,
    filter: "pair",
    filterText: "A river call means a pair or better made with a hole card.",
  },
} as const;
export type LineId = keyof typeof LINES;
export const LINE_IDS = Object.keys(LINES) as LineId[];

export function lineRange(id: LineId): { range: Set<string>; filter?: (v: [Card, Card], board: readonly Card[]) => boolean } {
  const l = LINES[id];
  const range = parseRangeWithDashes(l.notation);
  if (l.filter === "connects") return { range, filter: (v, b) => connects(v, b) };
  if (l.filter === "pair") return { range, filter: (v, b) => categoryOf(evaluate([...v, ...b])) > categoryOf(evaluate(b)) };
  return { range };
}

/* ------------------------------------------------------------------ c-bet and sizing heuristics */

/**
 * Heads-up flop c-bet as the pre-flop raiser, checked to:
 * - raiser-favoured boards (A/K-high, dry or paired): bet the whole range small. You have
 *   the range advantage, the blind can't continue often, and air still has overcards.
 * - otherwise: bet hands that want value or protection (two pair+, overpairs, top pair)
 *   and draws (semi-bluff); check medium pairs (they hate a raise and win at showdown
 *   often enough) and air (no equity, and the blind's range hits these boards).
 */
export function cbetAnswer(info: FlopInfo, cls: HandClass): "bet" | "check" {
  if (info.favors === "raiser") return "bet";
  return cls === "medium" || cls === "air" ? "check" : "bet";
}

export type SizeId = "check" | "33" | "66" | "100";
export const SIZE_FRAC: Record<SizeId, number> = { check: 0, "33": 0.33, "66": 0.66, "100": 1.25 };

/**
 * Bet sizing as the aggressor, checked to. Returns the size and whether the spot is
 * textbook-clear (the drill only deals clear spots; the grader still answers the rest).
 * - Dry or paired flop: one small size (1/3 pot) with strong hands and bluffs alike: few
 *   draws to deny, and a small bet gets called by worse.
 * - Wet flop: big (2/3 pot) with strong hands and draws: charge the draws, build the pot
 *   for when you hit. Check medium pairs and air: they can't stand a raise.
 * - Monotone flop: small, the board is already scary and nobody wants a big pot.
 * - River: polarise. Bet big (pot or more) with sets and better, check medium pairs that
 *   win at showdown but can't get called by worse.
 */
export function sizingAnswer(hole: readonly Card[], board: readonly Card[]): { size: SizeId; clear: boolean; cls: HandClass } {
  const cls = handClass(hole, board);
  return { ...sizeFor(hole, board, cls), cls };
}

function sizeFor(hole: readonly Card[], board: readonly Card[], cls: HandClass): { size: SizeId; clear: boolean } {
  const valueish = cls === "strong" || cls === "overpair";
  if (board.length >= 5) {
    if (cls === "strong") return { size: "100", clear: categoryOf(evaluate([...hole, ...board])) >= 3 };
    if (cls === "medium") return { size: "check", clear: true };
    return { size: "check", clear: false };
  }
  const t = flopInfo(board).texture;
  if (t === "dry" || t === "paired") {
    if (valueish || cls === "air") return { size: "33", clear: true };
    return { size: cls === "medium" ? "check" : "33", clear: false };
  }
  if (t === "monotone") return { size: cls === "medium" || cls === "air" ? "check" : "33", clear: false };
  if (t === "wet") {
    if (valueish || cls === "draw") return { size: "66", clear: true };
    if (cls === "medium" || cls === "air") return { size: "check", clear: true };
    return { size: "66", clear: false };
  }
  // semi-wet: the textbook answer depends on details, so never dealt
  return { size: valueish || cls === "draw" || cls === "toppair" ? "66" : "check", clear: false };
}

/* ------------------------------------------------------------------ toy EV model */

/**
 * Rough one-street EV (in whatever unit `pot` is in) of betting `f` × pot versus checking.
 * Model: villain defends exactly the minimum-defence frequency 1/(1+f), shifted by
 * `foldBonus` (+ means villain over-folds, e.g. on boards that favour the bettor). Treating
 * equity `e` as a percentile, hero's equity when called is (e − folded share) / call share,
 * floored at 60% of e because even beaten hands keep some outs. Checking realises 90% of e.
 * It ignores later streets, so use it for "about how much" only.
 */
export function betEV(e: number, f: number, pot: number, foldBonus = 0): number {
  if (f <= 0) return 0.9 * e * pot;
  const call = Math.min(1, Math.max(0.05, 1 / (1 + f) - foldBonus));
  const fold = 1 - call;
  const eCall = Math.max(0.6 * e, Math.max(0, e - fold) / call);
  return fold * pot + call * (eCall * (pot + 2 * f * pot) - f * pot);
}

export const foldBonusFor = (i: FlopInfo) => (i.favors === "raiser" ? 0.15 : i.favors === "caller" ? -0.1 : 0);

/** EV given up by playing `chosen` instead of `best` (0 when the model disagrees). Rounded to 0.1. */
export function costBetween(e: number, best: number, chosen: number, pot: number, foldBonus = 0): number {
  const c = betEV(e, best, pot, foldBonus) - betEV(e, chosen, pot, foldBonus);
  return c > 0.05 ? Math.round(c * 10) / 10 : 0;
}

