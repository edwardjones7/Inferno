/**
 * The decision log: one compact row per graded decision, for both games, kept far longer
 * than the full hand records (see LIMITS in store.ts). It's what leak detection trains on
 * and what the JSON export hands to the offline scripts.
 *
 * Rows are written when a poker hand or blackjack round ends, so each row knows how that
 * hand turned out (`net`). Ordering by `at` within a `sid` gives the sequence of play, which
 * is what tilt and fatigue features are built from.
 */
import type { Decision } from "./blackjack/coach";
import type { ActionType } from "./blackjack/engine";
import type { CoachSpot } from "./poker/game-types";

/** A blackjack decision in the same shape as a poker CoachSpot where they overlap. */
export interface BjSpot {
  /** "hard", "soft", "pair" or "insurance" */
  family: string;
  /** chart cell, e.g. "soft-18-9" */
  key: string;
  chosen: ActionType;
  best: string;
  /** -1 more passive than basic strategy (stand vs hit, hit vs double, not splitting), +1 more aggressive */
  dir?: -1 | 0 | 1;
  /** the round's opening bet, in chip units */
  bet: number;
}

export interface DecisionRow {
  at: number;
  /** play session: a new one starts after SESSION_GAP of inactivity */
  sid: string;
  game: "poker" | "blackjack";
  /** "table" = 6-max practice table, "match" = heads-up bot match, "bj" = blackjack table */
  mode: "table" | "match" | "bj";
  /** hand / round id; links to pokerHands / bjRounds while those are still kept */
  hid: string;
  /** decision number within the hand (0-based) */
  i: number;
  /** milliseconds from the decision being offered to the action, capped at MAX_MS; absent when unknown */
  ms?: number;
  ok: boolean | null;
  /** what the mistake gave up: big blinds (poker) or a fraction of the bet (blackjack) */
  cost?: number;
  /** how the hand ended: big blinds (poker), multiples of the opening bet (blackjack) */
  net: number;
  poker?: CoachSpot;
  bj?: BjSpot;
}

export const SESSION_GAP = 30 * 60 * 1000;
/** Longer than this and the player was probably away, not thinking. */
export const MAX_MS = 120_000;

const newSid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 8);

/** The session a decision at `now` belongs to: the last row's, unless play paused for SESSION_GAP. */
export function sessionFor(rows: readonly DecisionRow[], now: number): string {
  const last = rows[rows.length - 1];
  return last && now - last.at < SESSION_GAP && now >= last.at ? last.sid : newSid();
}

/** Clamp a measured think time; drop nonsense (negative, NaN). */
export function thinkMs(ms: number | undefined): number | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return undefined;
  return Math.min(MAX_MS, Math.round(ms));
}

/* ------------------------------------------------------------------ blackjack direction */

/** How much a play commits, from most passive to most aggressive. Split and double both add a bet. */
const BJ_RANK: Partial<Record<string, number>> = { surrender: 0, stand: 1, hit: 2, double: 3, split: 3 };

/**
 * Which way a blackjack play missed basic strategy. Taking insurance is +1. Double vs split
 * (same commitment, different play) has no direction.
 */
export function bjDirection(chosen: string, best: string): -1 | 0 | 1 | undefined {
  if (chosen === best) return 0;
  if (best === "decline") return chosen === "insurance" ? 1 : undefined;
  const a = BJ_RANK[chosen];
  const b = BJ_RANK[best];
  if (a === undefined || b === undefined || a === b) return undefined;
  return a < b ? -1 : 1;
}

/* ------------------------------------------------------------------ row builders */

interface PokerNoteLike {
  ok: boolean | null;
  cost?: number;
  spot?: CoachSpot;
  ms?: number;
}

/** Rows for one finished poker hand (notes without a structured spot are skipped). */
export function pokerRows(notes: readonly PokerNoteLike[], hand: { id: string; at: number; mode: "table" | "match"; net: number; bb: number }, sid: string): DecisionRow[] {
  const net = Math.round((hand.net / hand.bb) * 100) / 100;
  const rows: DecisionRow[] = [];
  notes.forEach((n, i) => {
    if (!n.spot) return;
    const row: DecisionRow = { at: hand.at, sid, game: "poker", mode: hand.mode, hid: hand.id, i, ok: n.ok, net, poker: n.spot };
    const ms = thinkMs(n.ms);
    if (ms !== undefined) row.ms = ms;
    if (n.cost !== undefined) row.cost = n.cost;
    rows.push(row);
  });
  return rows;
}

/** Rows for one settled blackjack round. */
export function bjRows(decisions: readonly Decision[], round: { id: string; at: number; bet: number; wagered: number; payout: number }, sid: string): DecisionRow[] {
  const net = round.bet > 0 ? Math.round(((round.payout - round.wagered) / round.bet) * 100) / 100 : 0;
  return decisions.map((d, i) => {
    const bj: BjSpot = { family: d.kind, key: d.spot, chosen: d.chosen, best: d.correct, bet: round.bet };
    const dir = bjDirection(d.chosen, d.correct);
    if (dir !== undefined) bj.dir = dir;
    const row: DecisionRow = { at: round.at, sid, game: "blackjack", mode: "bj", hid: round.id, i, ok: d.ok, net, bj };
    const ms = thinkMs(d.ms);
    if (ms !== undefined) row.ms = ms;
    if (d.cost !== undefined) row.cost = d.cost;
    return row;
  });
}

/* ------------------------------------------------------------------ export */

export const EXPORT_FORMAT = "inferno-history";
export const EXPORT_VERSION = 1;

interface Exportable {
  createdAt: number;
  decisions: DecisionRow[];
  drills: unknown[];
  pokerHands: unknown[];
  bjRounds: unknown[];
  matches: unknown[];
}

/**
 * Everything the offline leak-detection scripts read, as one JSON-ready object. Leaves out
 * the player's name, chips and purchases: it's play history only.
 */
export function exportDataset(p: Exportable, now = Date.now()) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date(now).toISOString(),
    createdAt: p.createdAt,
    counts: { decisions: p.decisions.length, drills: p.drills.length, pokerHands: p.pokerHands.length, bjRounds: p.bjRounds.length },
    decisions: p.decisions,
    drills: p.drills,
    pokerHands: p.pokerHands,
    bjRounds: p.bjRounds,
    matches: p.matches,
  };
}

export const exportFileName = (now = new Date()) => `inferno-history-${now.toISOString().slice(0, 10)}.json`;
