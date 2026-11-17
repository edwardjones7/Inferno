"use client";

/**
 * Everything the player has done, kept on the device: chips, hand history, drill answers,
 * ratings, beaten bots and the daily streak. One versioned JSON document in localStorage,
 * read through `useProgress()` (useSyncExternalStore, so every screen stays in sync and
 * other tabs pick up changes through the storage event).
 */
import { useSyncExternalStore } from "react";
import type { Card } from "./blackjack/cards";
import type { Decision } from "./blackjack/coach";
import type { HandResult, RoundState } from "./blackjack/engine";
import type { TableId } from "./blackjack/tables";
import { chipsToUnits, STARTING_CHIPS } from "./chips";
import type { HandEvent } from "./poker/game-types";
import { difficultyOf, rate, START_RATING } from "./rating";
import { schedule, srsId, type SrsCard } from "./srs";

const KEY = "inferno:progress:v1";

export interface ActiveRound {
  id: string;
  tableId: TableId;
  state: RoundState;
  shoe: Card[];
  decisions: Decision[];
  at: number;
}

export interface BjRoundRecord {
  id: string;
  at: number;
  tableId: TableId;
  bet: number;
  wagered: number;
  payout: number;
  dealer: Card[];
  hands: { cards: Card[]; result?: HandResult; total: number }[];
  decisions: Decision[];
}

export interface DrillRecord {
  at: number;
  game: "blackjack" | "poker";
  /** chart cell (blackjack) or concept key (poker) */
  key: string;
  label: string;
  /** blackjack spot kind or poker drill id */
  kind: string;
  correct: string;
  ok: boolean;
  /** how much the chosen play gave up vs the best one (blackjack: fraction of the bet; poker: big blinds) */
  cost?: number;
}

export interface PokerNote {
  street: string;
  ok: boolean | null;
  title: string;
  detail: string;
  /** index into the hand log at the moment of the decision */
  at: number;
  /** big blinds given up vs the coach's play (absent when not estimated) */
  cost?: number;
}

export interface PokerHandRecord {
  id: string;
  at: number;
  mode: "match" | "table";
  /** bot ids at the table, seat order (seat 1 first) */
  bots: string[];
  handNo: number;
  hole: Card[];
  board: Card[];
  /** hole cards of everyone who reached showdown, by seat id */
  shown: Record<number, Card[]>;
  names: string[];
  net: number;
  bb: number;
  log: HandEvent[];
  notes: PokerNote[];
}

export interface MatchRecord {
  id: string;
  at: number;
  botId: string;
  result: "win" | "loss" | "draw";
  hands: number;
  before: number;
  after: number;
}

export type RatingKey = "poker" | "blackjack" | "training";

export interface Progress {
  v: 1;
  name: string;
  createdAt: number;
  /** blackjack balance in chip units (see chips.ts) */
  chips: number;
  activeRound: ActiveRound | null;
  bjRounds: BjRoundRecord[];
  drills: DrillRecord[];
  pokerHands: PokerHandRecord[];
  matches: MatchRecord[];
  ratings: Record<RatingKey, { r: number; games: number; peak: number; history: number[] }>;
  beaten: string[];
  /** yyyy-mm-dd -> answers for that day's puzzles (true = solved) */
  daily: Record<string, boolean[]>;
  /** yyyy-mm-dd of every day with any activity (most recent last, capped) */
  days: string[];
  /** lesson id -> time it was completed */
  lessons: Record<string, number>;
  /** spaced-repetition cards keyed by srsId(game, key) */
  srs: Record<string, SrsCard>;
}

const LIMITS = { bjRounds: 200, drills: 2000, pokerHands: 150, matches: 200, days: 400, history: 120 };

const rating = () => ({ r: START_RATING, games: 0, peak: START_RATING, history: [START_RATING] });

export function freshProgress(now = 0): Progress {
  return {
    v: 1,
    name: "",
    createdAt: now,
    chips: chipsToUnits(STARTING_CHIPS),
    activeRound: null,
    bjRounds: [],
    drills: [],
    pokerHands: [],
    matches: [],
    ratings: { poker: rating(), blackjack: rating(), training: rating() },
    beaten: [],
    daily: {},
    days: [],
    lessons: {},
    srs: {},
  };
}

const ADJ = ["Ashen", "Molten", "Scorched", "Blazing", "Cinder", "Obsidian", "Searing", "Crimson", "Smoky", "Gilded"];
const NOUN = ["Wolf", "Phoenix", "Viper", "Drake", "Raven", "Fox", "Lynx", "Mantis", "Heron", "Otter"];
const randomName = () => `${ADJ[Math.floor(Math.random() * ADJ.length)]}${NOUN[Math.floor(Math.random() * NOUN.length)]}`;

/* ------------------------------------------------------------------ external store */

const SERVER: Progress = freshProgress();
let cache: Progress | null = null;
const listeners = new Set<() => void>();

function load(): Progress {
  if (cache) return cache;
  let p: Progress | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Progress>;
      if (parsed && parsed.v === 1) p = { ...freshProgress(), ...parsed } as Progress;
    }
  } catch {}
  if (!p) {
    p = { ...freshProgress(Date.now()), name: randomName() };
    persist(p);
  }
  cache = p;
  return p;
}

function persist(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage full or blocked: keep playing in memory
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = null;
    l();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useProgress(): Progress {
  return useSyncExternalStore(subscribe, load, () => SERVER);
}

/** True after hydration, when `useProgress()` reflects the device's real data. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
const noopSubscribe = () => () => {};

export function getProgress(): Progress {
  return load();
}

/** Apply a change. `fn` receives a deep copy it may mutate. */
export function update(fn: (p: Progress) => void): Progress {
  const next = structuredClone(load());
  fn(next);
  trim(next);
  cache = next;
  persist(next);
  listeners.forEach((l) => l());
  return next;
}

function trim(p: Progress) {
  const cap = <T,>(xs: T[], n: number) => (xs.length > n ? xs.slice(xs.length - n) : xs);
  p.bjRounds = cap(p.bjRounds, LIMITS.bjRounds);
  p.drills = cap(p.drills, LIMITS.drills);
  p.pokerHands = cap(p.pokerHands, LIMITS.pokerHands);
  p.matches = cap(p.matches, LIMITS.matches);
  p.days = cap(p.days, LIMITS.days);
  for (const k of Object.keys(p.ratings) as RatingKey[]) p.ratings[k].history = cap(p.ratings[k].history, LIMITS.history);
  const dailyKeys = Object.keys(p.daily).sort();
  for (const k of dailyKeys.slice(0, Math.max(0, dailyKeys.length - 60))) delete p.daily[k];
  // keep the schedule bounded: drop the most-mastered cards first
  const srs = Object.entries(p.srs);
  if (srs.length > 600) {
    srs.sort(([, a], [, b]) => a.interval - b.interval);
    p.srs = Object.fromEntries(srs.slice(0, 600));
  }
}

export function resetProgress() {
  const name = load().name;
  cache = null;
  const p = { ...freshProgress(Date.now()), name };
  cache = p;
  persist(p);
  listeners.forEach((l) => l());
}

/* ------------------------------------------------------------------ helpers */

export function today(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Mark today as active (mutates the draft passed to `update`). */
export function touchDay(p: Progress) {
  const t = today();
  if (p.days.at(-1) !== t) p.days.push(t);
}

/** Consecutive active days ending today (or yesterday, so the streak survives until midnight). */
export function streakOf(days: readonly string[], now = new Date()): number {
  const set = new Set(days);
  const d = new Date(now);
  if (!set.has(today(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(today(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function applyRating(p: Progress, key: RatingKey, opponent: number, score: number) {
  const r = p.ratings[key];
  r.r = rate(r.r, opponent, score, r.games);
  r.games += 1;
  r.peak = Math.max(r.peak, r.r);
  r.history.push(r.r);
}

/** Record drill / puzzle answers, move the training rating and schedule spaced reviews. */
export function recordDrills(records: Omit<DrillRecord, "at">[]) {
  if (!records.length) return;
  update((p) => {
    const at = Date.now();
    for (const r of records) {
      p.drills.push({ ...r, at });
      applyRating(p, "training", difficultyOf(r.kind), r.ok ? 1 : 0);
      reviewSpot(p, r);
    }
    touchDay(p);
  });
}

/** Feed one graded answer into the spaced-repetition schedule (mutates the draft). */
export function reviewSpot(p: Progress, r: { game: "blackjack" | "poker"; key: string; label: string; kind: string; ok: boolean }) {
  const id = srsId(r.game, r.key);
  const next = schedule(p.srs[id], { game: r.game, key: r.key, label: r.label, kind: r.kind }, r.ok, today());
  if (next) p.srs[id] = next;
}

/** Mark a lesson finished. */
export function completeLesson(id: string) {
  update((p) => {
    if (!p.lessons[id]) p.lessons[id] = Date.now();
    touchDay(p);
  });
}

export interface LeakRow {
  key: string;
  label: string;
  kind: string;
  game: "blackjack" | "poker";
  correct: string;
  seen: number;
  misses: number;
}

/** The spots missed most often across live blackjack decisions and every drill. */
export function leaksOf(p: Progress, game?: "blackjack" | "poker", limit = 8): LeakRow[] {
  const rows = new Map<string, LeakRow>();
  const add = (g: "blackjack" | "poker", key: string, label: string, kind: string, correct: string, ok: boolean) => {
    const id = `${g}|${key}|${correct}`;
    const row = rows.get(id) ?? { key, label, kind, game: g, correct, seen: 0, misses: 0 };
    row.seen++;
    if (!ok) row.misses++;
    rows.set(id, row);
  };
  for (const r of p.bjRounds) for (const d of r.decisions) add("blackjack", d.spot, d.label, d.kind, d.correct, d.ok);
  for (const d of p.drills) add(d.game, d.key, d.label, d.kind, d.correct, d.ok);
  return [...rows.values()]
    .filter((r) => r.misses > 0 && (!game || r.game === game))
    .sort((a, b) => b.misses - a.misses || b.misses / b.seen - a.misses / a.seen)
    .slice(0, limit);
}

export function accuracy(records: { ok: boolean }[]): number | null {
  if (!records.length) return null;
  return Math.round((records.filter((r) => r.ok).length / records.length) * 100);
}

export function bestStreak(records: { ok: boolean }[]): number {
  let s = 0;
  let best = 0;
  for (const r of records) {
    s = r.ok ? s + 1 : 0;
    best = Math.max(best, s);
  }
  return best;
}
