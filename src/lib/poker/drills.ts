/**
 * Poker training drills: generators (browser) and graders (browser + server). Graders are
 * pure functions of the spot, so the server re-grades exactly what the player saw.
 */
import type { Card } from "../blackjack/cards";
import { equity, outs } from "./equity";
import { DECK, describe, evaluate, RANK_VALUE } from "./eval";
import { BEHIND, codeName, handCode, OPEN_RANGES, POSITION_NAME, POSITIONS, rangePercent, type Position } from "./ranges";

export type PokerDrill = "preflop" | "potodds" | "showdown" | "equity";

export const POKER_DRILLS: { id: PokerDrill; label: string; blurb: string }[] = [
  { id: "preflop", label: "Opening ranges", blurb: "Raise or fold first in, from every 6-max seat." },
  { id: "potodds", label: "Pot odds", blurb: "Facing an all-in with a draw: is the price right?" },
  { id: "showdown", label: "Showdowns", blurb: "Read the board and kickers: who takes the pot?" },
  { id: "equity", label: "Equity sense", blurb: "Guess how often a hand wins all-in pre-flop." },
];

export type PreflopSpot = { kind: "preflop"; pos: Position; cards: [Card, Card] };
export type PotOddsSpot = { kind: "potodds"; hero: [Card, Card]; villain: [Card, Card]; board: Card[]; pot: number; bet: number };
export type ShowdownSpot = { kind: "showdown"; board: Card[]; hands: [Card, Card][] };
export type EquitySpot = { kind: "equity"; hero: [Card, Card]; villain: [Card, Card] };
export type PokerSpot = PreflopSpot | PotOddsSpot | ShowdownSpot | EquitySpot;

export interface PokerGrade {
  ok: boolean;
  correct: string;
  /** chart cell / concept the spot belongs to, for leak tracking */
  key: string;
  label: string;
  why: string;
  /** extra numbers the UI can show (equity, needed %, outs…) */
  detail?: Record<string, number | string>;
}

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

export function genPotOdds(rand: Rand): PotOddsSpot {
  for (let tries = 0; tries < 400; tries++) {
    const street = rand() < 0.6 ? 3 : 4;
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
  const why =
    `You have ${o} outs: rule of ${flop ? 4 : 2} says ≈${rule}%, exact equity ${pct(e)}. ` +
    `Calling ${s.bet} to win ${s.pot + s.bet} needs ${pct(need)}. ` +
    (correct === "call" ? "Your equity beats the price: call." : "Not enough equity for the price: fold.");
  return {
    ok: answer === correct,
    correct,
    key: `po-${street}-${correct}`,
    label: `${flop ? "Flop" : "Turn"} all-in, ${correct === "call" ? "profitable call" : "clear fold"}`,
    why,
    detail: { equity: Math.round(e * 1000) / 10, need: Math.round(need * 1000) / 10, outs: o },
  };
}

/* ------------------------------------------------------------------ showdown */

export function genShowdown(rand: Rand): ShowdownSpot {
  for (let tries = 0; tries < 200; tries++) {
    const deal = shuffled(rand, 11);
    const board = deal.slice(0, 5);
    const hands: [Card, Card][] = [
      [deal[5], deal[6]],
      [deal[7], deal[8]],
      [deal[9], deal[10]],
    ];
    const scores = hands.map((h) => evaluate([...h, ...board])).sort((a, b) => b - a);
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

export function genEquity(rand: Rand): EquitySpot {
  for (let tries = 0; tries < 200; tries++) {
    const d = shuffled(rand, 4);
    const hero: [Card, Card] = [d[0], d[1]];
    const villain: [Card, Card] = [d[2], d[3]];
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
  }
}

export const answersFor = (kind: PokerDrill): readonly string[] =>
  kind === "preflop" ? PREFLOP_ANSWERS : kind === "potodds" ? POTODDS_ANSWERS : kind === "showdown" ? ["0", "1", "2", "split"] : EQUITY_BUCKETS.map((b) => b.id);

/** Validate an untrusted spot from the client before grading it on the server. */
export function validSpot(s: unknown): s is PokerSpot {
  const isCard = (c: unknown) => typeof c === "string" && /^[AKQJT2-9][SHDC]$/.test(c);
  const cards = (xs: unknown, n: number) => Array.isArray(xs) && xs.length === n && xs.every(isCard);
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
    default:
      return false;
  }
  return new Set(all).size === all.length; // no duplicate cards
}
