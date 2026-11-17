/**
 * Poker training drills: generators (browser) and graders (browser + server). Graders are
 * pure functions of the spot, so the server re-grades exactly what the player saw.
 */
import type { Card } from "../blackjack/cards";
import { equity, outs, seeded, seedFor } from "./equity";
import { equityVsRandom } from "./bots";
import { CATEGORIES, DECK, describe, evaluate, RANK_VALUE } from "./eval";
import {
  BB_DEFEND,
  betEV,
  cbetAnswer,
  costBetween,
  favorsWhy,
  flopInfo,
  foldBonusFor,
  HAND_CLASS_NAME,
  handClass,
  LINE_IDS,
  LINES,
  lineRange,
  readRange,
  SIZE_FRAC,
  sizingAnswer,
  TEXTURE_NAME,
  TEXTURES,
  textureWhy,
  type HandClass,
  type LineId,
  type SizeId,
  type Texture,
} from "./postflop";
import { BEHIND, codeName, handCode, OPEN_RANGES, POSITION_NAME, POSITIONS, rangePercent, type Position } from "./ranges";

export type PokerDrill = "preflop" | "potodds" | "showdown" | "equity" | "texture" | "handread" | "sizing" | "cbet";

export const POKER_DRILLS: { id: PokerDrill; label: string; blurb: string; group: "pre" | "post" }[] = [
  { id: "preflop", label: "Opening ranges", blurb: "Raise or fold first in, from every 6-max seat.", group: "pre" },
  { id: "potodds", label: "Pot odds", blurb: "Facing an all-in with a draw: is the price right?", group: "pre" },
  { id: "showdown", label: "Showdowns", blurb: "Read the board and kickers: who takes the pot?", group: "pre" },
  { id: "equity", label: "Equity sense", blurb: "Guess how often a hand wins all-in pre-flop.", group: "pre" },
  { id: "texture", label: "Board texture", blurb: "Dry, wet, paired or monotone, and whose board is it?", group: "post" },
  { id: "handread", label: "Hand reading", blurb: "Put villain on a range: how much of it beats you?", group: "post" },
  { id: "sizing", label: "Bet sizing", blurb: "Check, a third, two thirds or pot: pick the size.", group: "post" },
  { id: "cbet", label: "C-bet or check", blurb: "You raised and the flop is out: fire or give up?", group: "post" },
];

export type PreflopSpot = { kind: "preflop"; pos: Position; cards: [Card, Card] };
export type PotOddsSpot = { kind: "potodds"; hero: [Card, Card]; villain: [Card, Card]; board: Card[]; pot: number; bet: number };
export type ShowdownSpot = { kind: "showdown"; board: Card[]; hands: [Card, Card][] };
export type EquitySpot = { kind: "equity"; hero: [Card, Card]; villain: [Card, Card] };
/** `q`: "class" asks for the texture, "favor" asks whose range the flop hits harder. */
export type TextureSpot = { kind: "texture"; board: [Card, Card, Card]; q: "class" | "favor" };
export type HandReadSpot = { kind: "handread"; line: LineId; hero: [Card, Card]; board: Card[] };
/** You were the pre-flop raiser, heads-up, checked to. `pot` in big blinds. */
export type SizingSpot = { kind: "sizing"; hero: [Card, Card]; board: Card[]; pot: number };
/** You opened from `pos`, the big blind called, the flop is out and checked to you. `pot` in big blinds. */
export type CbetSpot = { kind: "cbet"; pos: Position; hero: [Card, Card]; board: [Card, Card, Card]; pot: number };
export type PokerSpot = PreflopSpot | PotOddsSpot | ShowdownSpot | EquitySpot | TextureSpot | HandReadSpot | SizingSpot | CbetSpot;

export interface PokerGrade {
  ok: boolean;
  correct: string;
  /** chart cell / concept the spot belongs to, for leak tracking */
  key: string;
  label: string;
  why: string;
  /** extra numbers the UI can show (equity, needed %, outs…) */
  detail?: Record<string, number | string>;
  /**
   * Rough EV the chosen answer gave up versus the correct one, in big blinds. Only set on
   * a wrong answer when it can be estimated. Drill chip amounts (pot odds) are at 5/10
   * blinds, so 10 chips = 1 bb. Pot-odds costs are exact for the shown matchup; c-bet and
   * sizing costs come from the one-street toy model in postflop.ts (`betEV`).
   */
  cost?: number;
}

/** Chips per big blind for drills that show chip amounts. */
export const DRILL_BB = 10;

type Rand = () => number;

function shuffled(rand: Rand, n: number, exclude: Card[] = []): Card[] {
  const ex = new Set(exclude);
  const d = DECK.filter((c) => !ex.has(c));
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (d.length - i));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d.slice(0, n);
}
const pick = <T,>(rand: Rand, xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const pct = (x: number) => `${Math.round(x * 100)}%`;

/* ------------------------------------------------------------------ pre-flop */

export const PREFLOP_ANSWERS = ["raise", "fold"] as const;

export function genPreflop(rand: Rand, pos?: Position): PreflopSpot {
  const p = pos ?? pick(rand, POSITIONS);
  // Half the time deal a hand near the edge of the range, where decisions are hardest.
  for (let tries = 0; tries < 60; tries++) {
    const [a, b] = shuffled(rand, 2);
    const code = handCode(a, b);
    if (rand() < 0.5 || borderline(p, code)) return { kind: "preflop", pos: p, cards: [a, b] };
  }
  const [a, b] = shuffled(rand, 2);
  return { kind: "preflop", pos: p, cards: [a, b] };
}

/** A hand whose neighbour in the grid (one rank lower/higher kicker) flips the answer. */
function borderline(pos: Position, code: string) {
  const r = "AKQJT98765432";
  const inRange = OPEN_RANGES[pos].has(code);
  if (code.length === 2) {
    const i = r.indexOf(code[0]);
    return [i - 1, i + 1].some((j) => j >= 0 && j < 13 && OPEN_RANGES[pos].has(r[j] + r[j]) !== inRange);
  }
  const j = r.indexOf(code[1]);
  return [j - 1, j + 1].some((k) => k > r.indexOf(code[0]) && k < 13 && OPEN_RANGES[pos].has(code[0] + r[k] + code[2]) !== inRange);
}

export function gradePreflop(s: PreflopSpot, answer: string): PokerGrade {
  const code = handCode(s.cards[0], s.cards[1]);
  const range = OPEN_RANGES[s.pos];
  const inRange = range.has(code);
  const correct = inRange ? "raise" : "fold";
  const width = Math.round(rangePercent(range));
  const behind = BEHIND[s.pos];
  const why = inRange
    ? `${codeName(code)} is inside the ~${width}% opening range from the ${POSITION_NAME[s.pos].toLowerCase()}. ${behind <= 2 ? "Few players left to act, so open wide and steal the blinds." : "Strong enough to open even with players left to act."}`
    : `${codeName(code)} is outside the ~${width}% ${s.pos} range. With ${behind} player${behind > 1 ? "s" : ""} still to act, it gets dominated or out of position too often.`;
  return { ok: answer === correct, correct, key: `pre-${s.pos}-${code}`, label: `${s.pos}: ${code}`, why, detail: { width, code } };
}

/* ------------------------------------------------------------------ pot odds */

export const POTODDS_ANSWERS = ["call", "fold"] as const;
const BET_SIZES = [0.33, 0.5, 0.66, 0.75, 1, 1.5];

export function genPotOdds(rand: Rand, want?: { street?: 3 | 4; correct?: "call" | "fold" }): PotOddsSpot {
  for (let tries = 0; tries < 400; tries++) {
    const street = want?.street ?? (rand() < 0.6 ? 3 : 4);
    const deal = shuffled(rand, 4 + street);
    const hero: [Card, Card] = [deal[0], deal[1]];
    const villain: [Card, Card] = [deal[2], deal[3]];
    const board = deal.slice(4);
    if (evaluate([...hero, ...board]) >= evaluate([...villain, ...board])) continue; // hero must be behind
    const o = outs(hero, villain, board).length;
    if (o < 6 || o > 16) continue; // a real draw, not just "pair a card"
    const e = equity(hero, villain, board).equity;
    if (e < 0.1 || e > 0.5) continue;
    const pot = 20 + Math.round(rand() * 36) * 5;
    const bet = Math.max(5, Math.round((pot * pick(rand, BET_SIZES)) / 5) * 5);
    const need = bet / (pot + 2 * bet);
    if (Math.abs(e - need) < 0.04) continue; // keep answers clear-cut
    if (want?.correct && (e >= need ? "call" : "fold") !== want.correct) continue;
    return { kind: "potodds", hero, villain, board, pot, bet };
  }
  // fallback: a textbook flush draw
  return { kind: "potodds", hero: ["AH", "5H"], villain: ["KS", "QD"], board: ["KH", "9H", "2C"], pot: 100, bet: 50 };
}

export function gradePotOdds(s: PotOddsSpot, answer: string): PokerGrade {
  const e = equity(s.hero, s.villain, s.board).equity;
  const need = s.bet / (s.pot + 2 * s.bet);
  const o = outs(s.hero, s.villain, s.board).length;
  const flop = s.board.length === 3;
  const rule = Math.min(100, o * (flop ? 4 : 2));
  const correct = e >= need ? "call" : "fold";
  const street = flop ? "flop" : "turn";
  // EV of calling vs folding (0): win pot + bet with equity e, lose the call otherwise
  const evCall = e * (s.pot + s.bet) - (1 - e) * s.bet;
  const ok = answer === correct;
  const cost = ok ? undefined : Math.round((Math.abs(evCall) / DRILL_BB) * 10) / 10;
  const why =
    `You have ${o} outs: rule of ${flop ? 4 : 2} says ≈${rule}%, exact equity ${pct(e)}. ` +
    `Calling ${s.bet} to win ${s.pot + s.bet} needs ${pct(need)}. ` +
    (correct === "call" ? "Your equity beats the price: call." : "Not enough equity for the price: fold.");
  return {
    ok,
    correct,
    cost,
    key: `po-${street}-${correct}`,
    label: `${flop ? "Flop" : "Turn"} all-in, ${correct === "call" ? "profitable call" : "clear fold"}`,
    why,
    detail: { equity: Math.round(e * 1000) / 10, need: Math.round(need * 1000) / 10, outs: o },
  };
}

/* ------------------------------------------------------------------ showdown */

export function genShowdown(rand: Rand, wantCategory?: string): ShowdownSpot {
  for (let tries = 0; tries < (wantCategory ? 3000 : 200); tries++) {
    const deal = shuffled(rand, 11);
    const board = deal.slice(0, 5);
    const hands: [Card, Card][] = [
      [deal[5], deal[6]],
      [deal[7], deal[8]],
      [deal[9], deal[10]],
    ];
    const scores = hands.map((h) => evaluate([...h, ...board])).sort((a, b) => b - a);
    if (wantCategory && CATEGORIES[Math.floor(scores[0] / 15 ** 5)] !== wantCategory) continue;
    const close = Math.floor(scores[0] / 15 ** 5) === Math.floor(scores[1] / 15 ** 5);
    if (close || rand() < 0.25) return { kind: "showdown", board, hands };
  }
  const deal = shuffled(rand, 11);
  return { kind: "showdown", board: deal.slice(0, 5), hands: [[deal[5], deal[6]], [deal[7], deal[8]], [deal[9], deal[10]]] };
}

export function gradeShowdown(s: ShowdownSpot, answer: string): PokerGrade {
  const d = s.hands.map((h) => describe([...h, ...s.board]));
  const best = Math.max(...d.map((x) => x.score));
  const winners = d.map((x, i) => (x.score === best ? i : -1)).filter((i) => i >= 0);
  const correct = winners.length > 1 ? "split" : String(winners[0]);
  const names = ["A", "B", "C"];
  const why = d.map((x, i) => `${names[i]}: ${x.name}${x.score === best ? " ✓" : ""}`).join(" · ");
  const cat = d[winners[0]].category;
  return { ok: answer === correct, correct, key: `sd-${cat}`, label: `Winning hand: ${cat.toLowerCase()}`, why };
}

/* ------------------------------------------------------------------ equity sense */

export const EQUITY_BUCKETS = [
  { id: "lt35", label: "Under 35%", lo: 0, hi: 0.35 },
  { id: "35-50", label: "35–50%", lo: 0.35, hi: 0.5 },
  { id: "50-65", label: "50–65%", lo: 0.5, hi: 0.65 },
  { id: "gt65", label: "Over 65%", lo: 0.65, hi: 1.01 },
] as const;

function matchup(h: [Card, Card], v: [Card, Card]): { key: string; label: string; tip: string } {
  const val = (c: Card) => RANK_VALUE[c[0] as keyof typeof RANK_VALUE];
  const hp = val(h[0]) === val(h[1]);
  const vp = val(v[0]) === val(v[1]);
  const hv = [val(h[0]), val(h[1])];
  const vv = [val(v[0]), val(v[1])];
  if (hp && vp) return { key: "pair-v-pair", label: "Pair vs pair", tip: "A bigger pair is about an 80/20 favourite over a smaller one." };
  if (hp || vp) {
    const [pair, other] = hp ? [hv[0], vv] : [vv[0], hv];
    const over = other.filter((x) => x > pair).length;
    if (over === 2) return { key: "pair-v-overs", label: "Pair vs two overcards", tip: "Pair vs two overcards is close to a coin flip, roughly 55/45 for the pair." };
    if (over === 1) return { key: "pair-v-one-over", label: "Pair vs one overcard", tip: "Pair vs one overcard is roughly 70/30 for the pair." };
    return { key: "pair-v-unders", label: "Pair vs undercards", tip: "Pair vs two undercards is roughly 80/20 for the pair." };
  }
  if (hv.some((x) => vv.includes(x))) return { key: "dominated", label: "Shared card (domination)", tip: "When you share a card, the better kicker wins about 70% of the time." };
  const [hHi, hLo] = [Math.max(...hv), Math.min(...hv)];
  const [vHi, vLo] = [Math.max(...vv), Math.min(...vv)];
  if (hLo > vHi || vLo > hHi) return { key: "two-over-two", label: "Two overs vs two unders", tip: "Two higher cards vs two lower cards is roughly 60/40." };
  return { key: "interleaved", label: "Mixed unpaired hands", tip: "Overlapping unpaired hands are usually within 55/45." };
}

export function genEquity(rand: Rand, wantMatchup?: string): EquitySpot {
  for (let tries = 0; tries < (wantMatchup ? 2000 : 200); tries++) {
    const d = shuffled(rand, 4);
    const hero: [Card, Card] = [d[0], d[1]];
    const villain: [Card, Card] = [d[2], d[3]];
    if (wantMatchup && matchup(hero, villain).key !== wantMatchup) continue;
    // realistic all-in hands: both from a button opening range
    if (!OPEN_RANGES.BTN.has(handCode(hero[0], hero[1])) || !OPEN_RANGES.BTN.has(handCode(villain[0], villain[1]))) continue;
    const e = equity(hero, villain, [], 6000).equity;
    if (EQUITY_BUCKETS.some((b) => Math.abs(e - b.lo) < 0.02 && b.lo > 0)) continue; // not on a boundary
    return { kind: "equity", hero, villain };
  }
  return { kind: "equity", hero: ["AS", "KS"], villain: ["QH", "QD"] };
}

export function gradeEquity(s: EquitySpot, answer: string): PokerGrade {
  const e = equity(s.hero, s.villain, [], 6000).equity;
  const correct = EQUITY_BUCKETS.find((b) => e >= b.lo && e < b.hi)!.id;
  const m = matchup(s.hero, s.villain);
  const hc = handCode(s.hero[0], s.hero[1]);
  const vc = handCode(s.villain[0], s.villain[1]);
  return {
    ok: answer === correct,
    correct,
    key: `eq-${m.key}`,
    label: m.label,
    why: `${hc} vs ${vc}: ${pct(e)}. ${m.tip}`,
    detail: { equity: Math.round(e * 1000) / 10 },
  };
}

/* ------------------------------------------------------------------ board texture */

export const TEXTURE_ANSWERS = TEXTURES;
export const FAVOR_ANSWERS = ["raiser", "caller"] as const;

/** Deal a flop until it matches `want` (a texture, or who it favours). */
function flopWhere(rand: Rand, ok: (b: [Card, Card, Card]) => boolean): [Card, Card, Card] {
  for (let tries = 0; tries < 3000; tries++) {
    const b = shuffled(rand, 3) as [Card, Card, Card];
    if (ok(b)) return b;
  }
  return shuffled(rand, 3) as [Card, Card, Card];
}

/**
 * Half texture questions (each texture equally likely, so monotone and paired boards come
 * up as often as dry ones), the rest "whose board is it?" on boards that clearly favour one
 * side (neutral boards are never asked about).
 */
export function genTexture(rand: Rand, want?: { q: "class"; texture?: Texture } | { q: "favor"; favors?: "raiser" | "caller" }): TextureSpot {
  const q = want?.q ?? (rand() < 0.6 ? "class" : "favor");
  if (q === "class") {
    const t = (want?.q === "class" && want.texture) || pick(rand, TEXTURES);
    return { kind: "texture", q, board: flopWhere(rand, (b) => flopInfo(b).texture === t) };
  }
  const f = (want?.q === "favor" && want.favors) || pick(rand, FAVOR_ANSWERS);
  return { kind: "texture", q, board: flopWhere(rand, (b) => flopInfo(b).favors === f) };
}

export function gradeTexture(s: TextureSpot, answer: string): PokerGrade {
  const i = flopInfo(s.board);
  if (s.q === "favor") {
    const correct = i.favors === "neutral" ? "neutral" : i.favors;
    return {
      ok: answer === correct,
      correct,
      key: `tx-fav-${correct}`,
      label: correct === "raiser" ? "Board favours the pre-flop raiser" : correct === "caller" ? "Board favours the caller" : "Neutral board",
      why: `${TEXTURE_NAME[i.texture]} ${i.high >= 13 ? "high-card" : i.high <= 9 ? "low" : "middling"} board. ${favorsWhy(i)}`,
      detail: { texture: i.texture },
    };
  }
  return {
    ok: answer === i.texture,
    correct: i.texture,
    key: `tx-${i.texture}`,
    label: `${TEXTURE_NAME[i.texture]} flop`,
    why: `${textureWhy(i)} ${favorsWhy(i)}`,
    detail: { favors: i.favors },
  };
}

/* ------------------------------------------------------------------ hand reading */

export const HANDREAD_BUCKETS = [
  { id: "lt25", label: "Under 25%", lo: 0, hi: 0.25 },
  { id: "25-50", label: "25–50%", lo: 0.25, hi: 0.5 },
  { id: "50-75", label: "50–75%", lo: 0.5, hi: 0.75 },
  { id: "gt75", label: "Over 75%", lo: 0.75, hi: 1.01 },
] as const;

function handReadNumbers(s: HandReadSpot) {
  const { range, filter } = lineRange(s.line);
  return readRange(s.hero, s.board, range, filter ? (v) => filter(v, s.board) : undefined);
}

/** Hero always holds at least a pair (so there is something to read against), and the answer is never within 3% of a bucket edge. */
export function genHandRead(rand: Rand, line?: LineId): HandReadSpot {
  const id = line ?? pick(rand, LINE_IDS);
  for (let tries = 0; tries < 400; tries++) {
    const d = shuffled(rand, 2 + LINES[id].street);
    const hero: [Card, Card] = [d[0], d[1]];
    const board = d.slice(2);
    if (handClass(hero, board) === "air" || handClass(hero, board) === "draw") continue;
    const spot: HandReadSpot = { kind: "handread", line: id, hero, board };
    const r = handReadNumbers(spot);
    if (r.live < 10) continue;
    if (HANDREAD_BUCKETS.some((b) => b.lo > 0 && Math.abs(r.share - b.lo) < 0.03)) continue;
    return spot;
  }
  return { kind: "handread", line: "threebet", hero: ["KH", "QH"], board: ["KD", "7C", "2S"] };
}

export function gradeHandRead(s: HandReadSpot, answer: string): PokerGrade {
  const r = handReadNumbers(s);
  const correct = HANDREAD_BUCKETS.find((b) => r.share >= b.lo && r.share < b.hi)!.id;
  const mine = describe([...s.hero, ...s.board]).name.toLowerCase();
  const ahead = Object.entries(r.byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `${cat.toLowerCase()} ${n}`)
    .join(", ");
  const l = LINES[s.line];
  return {
    ok: answer === correct,
    correct,
    key: `hr-${s.line}`,
    label: `Reading a ${s.line === "utg" ? "UTG open" : s.line === "threebet" ? "3-bet" : s.line === "fourbet" ? "4-bet" : s.line === "checkraise" ? "check-raise" : "river call"}`,
    why:
      `${l.filterText ? l.filterText + " " : ""}After your blockers villain has ${r.live} combos; ${r.beat} beat your ${mine}` +
      `${r.tie ? ` and ${r.tie} chop` : ""}: ${pct(r.share)}.${ahead ? ` Ahead of you: ${ahead}.` : ""}`,
    detail: { share: Math.round(r.share * 1000) / 10, live: r.live, beat: r.beat },
  };
}

/* ------------------------------------------------------------------ bet sizing */

export const SIZING_ANSWERS: readonly SizeId[] = ["check", "33", "66", "100"];
const SIZE_LABEL: Record<SizeId, string> = { check: "check", "33": "a third of the pot", "66": "two thirds of the pot", "100": "pot or more" };

/** Sizing concepts the drill deals, as `${board}-${class}` (board: dry flop, wet flop, river). */
export const SIZING_CONCEPTS = ["dry-value", "dry-air", "wet-value", "wet-draw", "wet-medium", "wet-air", "river-value", "river-medium"] as const;

const valueOf = (c: HandClass) => (c === "strong" || c === "overpair" ? "value" : c === "toppair" ? "toppair" : c);
function sizingConcept(s: { hero: readonly Card[]; board: readonly Card[] }): string {
  const cls = valueOf(handClass(s.hero, s.board));
  if (s.board.length >= 5) return `river-${cls}`;
  const t = flopInfo(s.board).texture;
  return `${t === "dry" || t === "paired" ? "dry" : t === "wet" ? "wet" : t}-${cls}`;
}

/** Only textbook-clear spots (see `sizingAnswer`): pick a concept, then deal until it shows up. */
export function genSizing(rand: Rand, concept?: string): SizingSpot {
  const want = concept && (SIZING_CONCEPTS as readonly string[]).includes(concept) ? concept : pick(rand, SIZING_CONCEPTS);
  const river = want.startsWith("river");
  for (let tries = 0; tries < 6000; tries++) {
    const d = shuffled(rand, river ? 7 : 5);
    const hero: [Card, Card] = [d[0], d[1]];
    const board = d.slice(2);
    if (sizingConcept({ hero, board }) !== want || !sizingAnswer(hero, board).clear) continue;
    const pot = river ? pick(rand, [16, 21, 27]) : 5.5;
    return { kind: "sizing", hero, board, pot };
  }
  return { kind: "sizing", hero: ["AS", "AD"], board: ["KC", "7H", "2D"], pot: 5.5 };
}

const sizingWhy: Record<string, string> = {
  "dry-value": "Dry boards: bet a third of the pot with your whole range. Few draws to charge, and worse hands keep calling a small bet.",
  "dry-air": "Dry boards: a small bet with your whole range. A third of the pot only has to work about a quarter of the time, and this board misses the caller.",
  "wet-value": "Wet board, strong hand: bet big. Draws must pay to see the next card and the pot grows for when you get paid.",
  "wet-draw": "Wet board, good draw: semi-bluff big. You win now when they fold and have outs when called; big sizes match your value bets.",
  "wet-medium": "Medium pair on a wet board: check. It wins at showdown fairly often but hates a check-raise, and worse hands won't call a bet.",
  "wet-air": "No pair, no draw on a wet board: check and give up. Every pair and draw calls, so a bluff needs equity you don't have.",
  "river-value": "River with a very strong hand: polarise and bet pot or more. Their bluff-catchers have to call, and nothing is left to protect.",
  "river-medium": "River with a medium pair: check. Worse hands won't call and better ones won't fold, so betting only loses to raises.",
};

export function gradeSizing(s: SizingSpot, answer: string): PokerGrade {
  const { size, cls } = sizingAnswer(s.hero, s.board);
  const concept = sizingConcept(s);
  const ok = answer === size;
  const info = flopInfo(s.board);
  const e = spotEquity(s.hero, s.board);
  const bonus = s.board.length >= 5 ? 0 : foldBonusFor(info);
  const chosen = SIZE_FRAC[answer as SizeId] ?? 0;
  const c = ok ? 0 : costBetween(e, SIZE_FRAC[size], chosen, s.pot, bonus);
  const where = s.board.length >= 5 ? "river" : `${TEXTURE_NAME[info.texture].toLowerCase()} flop`;
  return {
    ok,
    correct: size,
    cost: c || undefined,
    key: `sz-${concept}`,
    label: `Sizing: ${HAND_CLASS_NAME[cls]} on a ${where}`,
    why: `${sizingWhy[concept] ?? `With ${HAND_CLASS_NAME[cls]} on a ${where}, ${SIZE_LABEL[size]} is the standard play.`} Equity vs the big blind's range ≈${pct(e)}.`,
    detail: { equity: Math.round(e * 1000) / 10, cls },
  };
}

/* ------------------------------------------------------------------ c-bet */

export const CBET_ANSWERS = ["bet", "check"] as const;
/** C-bet concepts, as `${board}-${class}`. dry: A/K-high, dry or paired (favours the raiser); wet: nine-high or lower and connected (favours the caller). */
export const CBET_CONCEPTS = [
  "dry-value",
  "dry-toppair",
  "dry-medium",
  "dry-air",
  "wet-value",
  "wet-toppair",
  "wet-medium",
  "wet-draw",
  "wet-air",
] as const;

function cbetConcept(s: { hero: readonly Card[]; board: readonly Card[] }): string | null {
  const f = flopInfo(s.board).favors;
  if (f === "neutral") return null;
  return `${f === "raiser" ? "dry" : "wet"}-${valueOf(handClass(s.hero, s.board))}`;
}

/** Equity vs the big blind's defending range, seeded by the cards so it never changes. */
function spotEquity(hero: readonly Card[], board: readonly Card[]): number {
  return equityVsRandom(hero, board, 1, 1500, seeded(seedFor([...hero, ...board])), BB_DEFEND);
}

/** Opener's hand comes from its opening range; boards are only ones that clearly favour one side. */
export function genCbet(rand: Rand, concept?: string): CbetSpot {
  const want = concept && (CBET_CONCEPTS as readonly string[]).includes(concept) ? concept : pick(rand, CBET_CONCEPTS);
  for (let tries = 0; tries < 8000; tries++) {
    const pos = pick(rand, ["UTG", "HJ", "CO", "BTN"] as const);
    const d = shuffled(rand, 5);
    const hero: [Card, Card] = [d[0], d[1]];
    if (!OPEN_RANGES[pos].has(handCode(hero[0], hero[1]))) continue;
    const board = d.slice(2) as [Card, Card, Card];
    if (cbetConcept({ hero, board }) !== want) continue;
    return { kind: "cbet", pos, hero, board, pot: 5.5 };
  }
  return { kind: "cbet", pos: "BTN", hero: ["AS", "QD"], board: ["KC", "7H", "2D"], pot: 5.5 };
}

const cbetWhy: Record<string, string> = {
  dry: "A/K-high dry board: you have the range advantage, so bet small with your whole range. The big blind misses this flop most of the time.",
  "wet-value": "Low connected board favours the caller, but a strong hand still bets: get value and charge the draws.",
  "wet-toppair": "Top pair on a low connected board: bet for value and protection; plenty of turns are bad for you.",
  "wet-draw": "Draw on a low connected board: semi-bluff. You win now if they fold and have outs when they call.",
  "wet-medium": "Low connected board hits the big blind: check your medium pair. It has showdown value but hates a check-raise.",
  "wet-air": "Low connected board hits the big blind's range, not yours: check and give up with no pair and no draw.",
};

export function gradeCbet(s: CbetSpot, answer: string): PokerGrade {
  const info = flopInfo(s.board);
  const cls = handClass(s.hero, s.board);
  const correct = cbetAnswer(info, cls);
  const ok = answer === correct;
  const concept = cbetConcept(s) ?? `mid-${valueOf(cls)}`;
  const e = spotEquity(s.hero, s.board);
  const size = info.favors === "raiser" ? 0.33 : 0.66;
  const bonus = foldBonusFor(info);
  const c = ok ? 0 : costBetween(e, correct === "bet" ? size : 0, correct === "bet" ? 0 : size, s.pot, bonus);
  const why = (info.favors === "raiser" ? cbetWhy.dry : (cbetWhy[concept] ?? `Middling board: bet hands with value or a draw, check the rest.`)) + ` Equity vs their range ≈${pct(e)}.`;
  return {
    ok,
    correct,
    cost: c || undefined,
    key: `cb-${concept}`,
    label: `C-bet: ${HAND_CLASS_NAME[cls]}, ${info.favors === "raiser" ? "high dry board" : info.favors === "caller" ? "low connected board" : "middling board"}`,
    why,
    detail: { equity: Math.round(e * 1000) / 10, cls, evBet: Math.round(betEV(e, size, s.pot, bonus) * 10) / 10, evCheck: Math.round(betEV(e, 0, s.pot) * 10) / 10 },
  };
}

/* ------------------------------------------------------------------ dispatch */

export function gradePoker(spot: PokerSpot, answer: string): PokerGrade {
  switch (spot.kind) {
    case "preflop":
      return gradePreflop(spot, answer);
    case "potodds":
      return gradePotOdds(spot, answer);
    case "showdown":
      return gradeShowdown(spot, answer);
    case "equity":
      return gradeEquity(spot, answer);
    case "texture":
      return gradeTexture(spot, answer);
    case "handread":
      return gradeHandRead(spot, answer);
    case "sizing":
      return gradeSizing(spot, answer);
    case "cbet":
      return gradeCbet(spot, answer);
  }
}

export function genPoker(kind: PokerDrill, rand: Rand): PokerSpot {
  switch (kind) {
    case "preflop":
      return genPreflop(rand);
    case "potodds":
      return genPotOdds(rand);
    case "showdown":
      return genShowdown(rand);
    case "equity":
      return genEquity(rand);
    case "texture":
      return genTexture(rand);
    case "handread":
      return genHandRead(rand);
    case "sizing":
      return genSizing(rand);
    case "cbet":
      return genCbet(rand);
  }
}

/** Every answer id a drill can take (texture: both the texture and the "whose board" ids). */
export const answersFor = (kind: PokerDrill): readonly string[] => {
  switch (kind) {
    case "preflop":
      return PREFLOP_ANSWERS;
    case "potodds":
      return POTODDS_ANSWERS;
    case "showdown":
      return ["0", "1", "2", "split"];
    case "equity":
      return EQUITY_BUCKETS.map((b) => b.id);
    case "texture":
      return [...TEXTURE_ANSWERS, ...FAVOR_ANSWERS];
    case "handread":
      return HANDREAD_BUCKETS.map((b) => b.id);
    case "sizing":
      return SIZING_ANSWERS;
    case "cbet":
      return CBET_ANSWERS;
  }
};

/** The answers that make sense for one spot (only texture differs from `answersFor`). */
export const answersForSpot = (s: PokerSpot): readonly string[] =>
  s.kind === "texture" ? (s.q === "favor" ? FAVOR_ANSWERS : TEXTURE_ANSWERS) : answersFor(s.kind);

/**
 * Rebuild a spot of the same concept from a stored grade key (for spaced repetition).
 * `pre-POS-CODE` is rebuilt exactly (fresh suits); everything else deals a new spot of the
 * same concept. Returns null for keys this module doesn't recognise.
 */
export function genPokerForKey(key: string, rand: Rand): PokerSpot | null {
  const [head, ...rest] = key.split("-");
  const tail = rest.join("-");
  switch (head) {
    case "pre": {
      const [pos, code] = rest;
      if (!POSITIONS.includes(pos as Position) || !code) return null;
      const cards = cardsFor(code, rand);
      return cards ? { kind: "preflop", pos: pos as Position, cards } : null;
    }
    case "po":
      if (rest[0] !== "flop" && rest[0] !== "turn") return null;
      return genPotOdds(rand, { street: rest[0] === "flop" ? 3 : 4, correct: rest[1] === "call" || rest[1] === "fold" ? rest[1] : undefined });
    case "sd":
      return genShowdown(rand, (CATEGORIES as readonly string[]).includes(tail) ? tail : undefined);
    case "eq":
      return genEquity(rand, tail || undefined);
    case "tx":
      if (rest[0] === "fav") return genTexture(rand, { q: "favor", favors: rest[1] === "caller" ? "caller" : "raiser" });
      return (TEXTURES as string[]).includes(tail) ? genTexture(rand, { q: "class", texture: tail as Texture }) : genTexture(rand, { q: "class" });
    case "hr":
      return genHandRead(rand, (LINE_IDS as string[]).includes(tail) ? (tail as LineId) : undefined);
    case "sz":
      return genSizing(rand, tail);
    case "cb":
      return genCbet(rand, tail);
    default:
      return null;
  }
}

/** Two cards matching a hand code ("AKs", "T9o", "77") with random suits. */
function cardsFor(code: string, rand: Rand): [Card, Card] | null {
  const r = "AKQJT98765432";
  if (!/^[AKQJT2-9]{2}[so]?$/.test(code) || !r.includes(code[0]) || (code[0] === code[1]) !== (code.length === 2)) return null;
  const suits = ["S", "H", "D", "C"];
  const s1 = pick(rand, suits);
  const others = suits.filter((x) => x !== s1);
  const s2 = code[2] === "s" ? s1 : pick(rand, others);
  return [`${code[0]}${s1}` as Card, `${code[1]}${s2}` as Card];
}

/** Validate an untrusted spot from the client before grading it on the server. */
export function validSpot(s: unknown): s is PokerSpot {
  const isCard = (c: unknown) => typeof c === "string" && /^[AKQJT2-9][SHDC]$/.test(c);
  const cards = (xs: unknown, n: number) => Array.isArray(xs) && xs.length === n && xs.every(isCard);
  const potOk = (p: unknown) => typeof p === "number" && p > 0 && p <= 1e6;
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  let all: unknown[] = [];
  switch (o.kind) {
    case "preflop":
      if (!POSITIONS.includes(o.pos as Position) || !cards(o.cards, 2)) return false;
      all = o.cards as unknown[];
      break;
    case "potodds":
      if (!cards(o.hero, 2) || !cards(o.villain, 2) || !(cards(o.board, 3) || cards(o.board, 4))) return false;
      if (typeof o.pot !== "number" || typeof o.bet !== "number" || o.pot <= 0 || o.bet <= 0 || o.pot > 1e6 || o.bet > 1e6) return false;
      all = [...(o.hero as unknown[]), ...(o.villain as unknown[]), ...(o.board as unknown[])];
      break;
    case "showdown":
      if (!cards(o.board, 5) || !Array.isArray(o.hands) || o.hands.length !== 3 || !o.hands.every((h) => cards(h, 2))) return false;
      all = [...(o.board as unknown[]), ...(o.hands as unknown[][]).flat()];
      break;
    case "equity":
      if (!cards(o.hero, 2) || !cards(o.villain, 2)) return false;
      all = [...(o.hero as unknown[]), ...(o.villain as unknown[])];
      break;
    case "texture":
      if (!cards(o.board, 3) || (o.q !== "class" && o.q !== "favor")) return false;
      all = o.board as unknown[];
      break;
    case "handread":
      if (!(LINE_IDS as unknown[]).includes(o.line) || !cards(o.hero, 2) || !cards(o.board, LINES[o.line as LineId].street)) return false;
      all = [...(o.hero as unknown[]), ...(o.board as unknown[])];
      break;
    case "sizing":
      if (!cards(o.hero, 2) || !(cards(o.board, 3) || cards(o.board, 5)) || !potOk(o.pot)) return false;
      all = [...(o.hero as unknown[]), ...(o.board as unknown[])];
      break;
    case "cbet":
      if (!POSITIONS.includes(o.pos as Position) || !cards(o.hero, 2) || !cards(o.board, 3) || !potOk(o.pot)) return false;
      all = [...(o.hero as unknown[]), ...(o.board as unknown[])];
      break;
    default:
      return false;
  }
  return new Set(all).size === all.length; // no duplicate cards
}
