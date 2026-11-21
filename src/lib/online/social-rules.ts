/**
 * The rules behind the social features, kept pure for tests: friend streaks, puzzle duels,
 * league tiers and what to do with a cloud backup on sign-in.
 */
import { addDays, dayKey } from "../economy";

/* ------------------------------------------------------------------ friend streaks */

/**
 * Days in a row both friends met their daily goal, ending today (or yesterday: today isn't
 * over yet). `a` and `b` are the yyyy-mm-dd days each one met the goal.
 */
export function friendStreak(a: Iterable<string>, b: Iterable<string>, now = new Date()): number {
  const mine = new Set(a);
  const both = new Set([...b].filter((d) => mine.has(d)));
  let d = both.has(dayKey(now)) ? now : addDays(now, -1);
  let n = 0;
  while (both.has(dayKey(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/* ------------------------------------------------------------------ puzzle duels */

export type DuelVerdict = "win" | "loss" | "tie" | "waiting" | "unplayed";

export interface Duel {
  mine: number;
  theirs: number;
  verdict: DuelVerdict;
  /** puzzle-by-puzzle: true solved, false missed, null not answered */
  rows: { mine: boolean | null; theirs: boolean | null }[];
}

/** Compare two players' answers to the same daily puzzles (everyone gets the same three). */
export function duel(mine: readonly boolean[] | null | undefined, theirs: readonly boolean[] | null | undefined, count = 3): Duel {
  const m = mine ?? [];
  const t = theirs ?? [];
  const solved = (xs: readonly boolean[]) => xs.filter(Boolean).length;
  const rows = Array.from({ length: count }, (_, i) => ({ mine: m[i] ?? null, theirs: t[i] ?? null }));
  const done = (xs: readonly boolean[]) => xs.length >= count;
  let verdict: DuelVerdict;
  if (!m.length) verdict = "unplayed";
  else if (!done(m) || !done(t)) verdict = "waiting";
  else verdict = solved(m) > solved(t) ? "win" : solved(m) < solved(t) ? "loss" : "tie";
  return { mine: solved(m), theirs: solved(t), verdict, rows };
}

/* ------------------------------------------------------------------ leagues */

export const LEAGUE_TIERS = ["Copper", "Brass", "Silver", "Gold", "Platinum", "Diamond"] as const;
export const PROMOTE_TOP = 7;
export const DEMOTE_BOTTOM = 5;
/** Demotion only applies in groups at least this big (see join_league in the migration). */
export const DEMOTE_MIN_GROUP = 10;

export const tierName = (t: number) => LEAGUE_TIERS[Math.max(0, Math.min(LEAGUE_TIERS.length - 1, t))];

export type Zone = "up" | "down" | "stay";

/** Where a 1-based rank sits in a group: promotion zone, demotion zone or safe. */
export function zoneOf(rank: number, size: number, tier: number, xp: number): Zone {
  if (rank <= PROMOTE_TOP && xp > 0 && tier < LEAGUE_TIERS.length - 1) return "up";
  if (size >= DEMOTE_MIN_GROUP && rank > size - DEMOTE_BOTTOM && tier > 0) return "down";
  return "stay";
}

/** Days left in the league week (weeks run Monday to Sunday). */
export function daysLeftInWeek(now = new Date()): number {
  return 7 - ((now.getDay() + 6) % 7);
}

/* ------------------------------------------------------------------ cloud backup */

export interface BackupSide {
  /** how much has been done: graded answers, hands, lessons */
  activity: number;
  /** ms */
  updatedAt: number;
}

export type BackupChoice = "upload" | "download" | "ask" | "same";

/**
 * On sign-in: a fresh device takes the cloud copy, a device with progress and no backup
 * uploads, and when both have real progress the player chooses.
 */
export function chooseBackup(local: BackupSide, cloud: BackupSide | null): BackupChoice {
  if (!cloud) return "upload";
  if (local.activity === cloud.activity) return "same";
  if (local.activity < 5) return "download";
  if (cloud.activity < 5) return "upload";
  return "ask";
}
