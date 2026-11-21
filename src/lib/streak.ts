/**
 * The daily streak, Duolingo-style: a day counts when you hit your daily goal of skill XP,
 * not when you merely open the app or play a hand.
 *
 * Rules (all pure, no storage; `store.ts` applies them to the saved progress):
 *
 * - XP comes from learning. A lesson is worth 10 (5 when repeated), a drill or puzzle answer 2
 *   when right and 1 when wrong (trying counts). Graded live decisions at the tables earn 1
 *   each when right, but at most LIVE_XP_CAP a day, so play alone can't keep the streak:
 *   some deliberate practice is always needed.
 * - Goals: casual 10 XP (one lesson, or five drill answers), regular 20, serious 40.
 * - Freezes cover a missed day automatically. You bank at most FREEZE_CAP (Pro: one more).
 *   You earn one every 7 days of streak, Pro members get one a month, and one can be bought
 *   for chips. Freezes never cost real money and never gate learning.
 * - Repair: a streak of 3+ days broken by one or two missed days (with no freezes left) can
 *   be repaired on the day you come back, by watching a rewarded ad or by earning double
 *   your goal that day. Once every REPAIR_COOLDOWN_DAYS.
 * - Milestones pay chips once per account (not per streak, so they can't be farmed).
 *
 * Days are local calendar days (yyyy-mm-dd), the same keys as `store.today()`.
 */
import { chipsToUnits } from "./chips";
import { addDays, dayKey, monthKey } from "./economy";

export type GoalId = "casual" | "regular" | "serious";

export const GOALS: Record<GoalId, { xp: number; label: string; sub: string }> = {
  casual: { xp: 10, label: "Casual", sub: "One lesson or five drill answers" },
  regular: { xp: 20, label: "Regular", sub: "A lesson and the daily puzzles" },
  serious: { xp: 40, label: "Serious", sub: "A real study session" },
};
export const GOAL_IDS = Object.keys(GOALS) as GoalId[];
export const isGoalId = (v: unknown): v is GoalId => typeof v === "string" && v in GOALS;

export const XP = { lesson: 10, lessonRepeat: 5, drillRight: 2, drillWrong: 1, liveRight: 1 } as const;
/** Live table play counts, but only this much of it per day. */
export const LIVE_XP_CAP = 5;

export const FREEZE_CAP = 2;
export const FREEZE_CAP_PRO = 3;
/** A freeze for chips: a chip sink with a purpose. About half a committed free player's day. */
export const FREEZE_PRICE = 1_000;

export const REPAIR_MIN_STREAK = 3;
export const REPAIR_MAX_GAP = 2;
export const REPAIR_COOLDOWN_DAYS = 30;

export interface Milestone {
  days: number;
  chips: number;
  title: string;
}

export const MILESTONES: readonly Milestone[] = [
  { days: 3, chips: 300, title: "Lit" },
  { days: 7, chips: 1_000, title: "One week" },
  { days: 14, chips: 1_500, title: "Two weeks" },
  { days: 30, chips: 3_000, title: "A month at the table" },
  { days: 50, chips: 5_000, title: "Fifty nights" },
  { days: 100, chips: 10_000, title: "The hundred" },
  { days: 200, chips: 15_000, title: "Regular" },
  { days: 365, chips: 25_000, title: "A year in the back room" },
];

export type Celebration =
  | { kind: "goal"; streak: number }
  | { kind: "milestone"; days: number; chips: number; title: string }
  | { kind: "freeze-earned"; streak: number }
  | { kind: "frozen"; days: string[] }
  | { kind: "repaired"; streak: number };

export interface StreakState {
  goal: GoalId;
  /** day -> XP earned that day; live play is kept apart so its cap can be applied */
  xp: Record<string, { learn: number; live: number }>;
  /** days the goal was met (ascending, capped) */
  met: string[];
  /** missed days covered by a freeze or a repair */
  covered: string[];
  freezes: number;
  /** milestone day counts already paid */
  milestones: number[];
  /** a broken streak that can still be repaired today */
  repair: { days: string[]; length: number; on: string } | null;
  /** day of the last repair (for the cooldown) */
  lastRepair: string | null;
  /** yyyy-mm of the last Pro monthly freeze */
  proFreezeMonth: string | null;
  /** last day `settleStreak` ran */
  settled: string | null;
  /** longest streak ever */
  best: number;
  /** things to celebrate on screen, oldest first; the UI shifts them off */
  pending: Celebration[];
  /** daily reminder (native apps only) */
  reminder: { on: boolean; hour: number };
}

export function freshStreak(): StreakState {
  return {
    goal: "casual",
    xp: {},
    met: [],
    covered: [],
    freezes: 0,
    milestones: [],
    repair: null,
    lastRepair: null,
    proFreezeMonth: null,
    settled: null,
    best: 0,
    pending: [],
    reminder: { on: true, hour: 19 },
  };
}

/** Bring a saved (possibly older) streak up to the current shape. `legacyDays` were active days before goals existed. */
export function migrateStreak(saved: Partial<StreakState> | undefined, legacyDays: readonly string[]): StreakState {
  const fresh = freshStreak();
  if (!saved) {
    // every day that used to count keeps counting, so nobody loses a streak to the upgrade
    const met = [...new Set(legacyDays)].sort();
    return { ...fresh, met, best: longestRun(met) };
  }
  return {
    ...fresh,
    ...saved,
    goal: isGoalId(saved.goal) ? saved.goal : fresh.goal,
    reminder: { ...fresh.reminder, ...saved.reminder },
    pending: Array.isArray(saved.pending) ? saved.pending : [],
  };
}

const LIMIT = { met: 800, covered: 200, xp: 60, pending: 6 };

export function trimStreak(s: StreakState) {
  if (s.met.length > LIMIT.met) s.met = s.met.slice(-LIMIT.met);
  if (s.covered.length > LIMIT.covered) s.covered = s.covered.slice(-LIMIT.covered);
  if (s.pending.length > LIMIT.pending) s.pending = s.pending.slice(-LIMIT.pending);
  const keys = Object.keys(s.xp).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - LIMIT.xp))) delete s.xp[k];
}

/* ------------------------------------------------------------------ reading */

export const goalXp = (s: Pick<StreakState, "goal">) => GOALS[s.goal].xp;

/** XP that counts toward the goal on `day` (live play capped). */
export function dayXp(s: Pick<StreakState, "xp">, day: string): number {
  const x = s.xp[day];
  return x ? x.learn + Math.min(x.live, LIVE_XP_CAP) : 0;
}

export const goalMet = (s: Pick<StreakState, "met">, day: string) => s.met.includes(day);

function counted(s: Pick<StreakState, "met" | "covered">): Set<string> {
  return new Set([...s.met, ...s.covered]);
}

/** Length of the run of counted days ending on `end` (0 if `end` itself doesn't count). */
function runEndingOn(set: Set<string>, end: Date): number {
  let n = 0;
  let d = end;
  while (set.has(dayKey(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** The current streak: counted days ending today, or yesterday (today isn't over yet). */
export function streakLength(s: Pick<StreakState, "met" | "covered">, now = new Date()): number {
  const set = counted(s);
  return set.has(dayKey(now)) ? runEndingOn(set, now) : runEndingOn(set, addDays(now, -1));
}

/** True when the streak is alive but today's goal isn't met yet. */
export function atRisk(s: Pick<StreakState, "met" | "covered">, now = new Date()): boolean {
  return !counted(s).has(dayKey(now)) && streakLength(s, now) > 0;
}

export function freezeCap(pro: boolean): number {
  return pro ? FREEZE_CAP_PRO : FREEZE_CAP;
}

/** The next milestone not yet paid. */
export function nextMilestone(s: Pick<StreakState, "milestones">): Milestone | undefined {
  return MILESTONES.find((m) => !s.milestones.includes(m.days));
}

function longestRun(sortedDays: readonly string[]): number {
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sortedDays) {
    run = prev && dayKey(addDays(parseDay(prev), 1)) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/* ------------------------------------------------------------------ writing */

export type XpKind = "learn" | "live";

export interface XpResult {
  /** today's goal was reached by this XP */
  justMet: boolean;
  /** streak after the change */
  streak: number;
  /** milestones reached by this XP (chips still to be granted by the caller) */
  milestones: Milestone[];
}

/**
 * Add XP for today. When it completes the goal: the day is marked, a freeze is earned every
 * 7 days of streak, milestones are reported for the caller to pay, and a pending repair
 * completes once double the goal is reached. Mutates `s`.
 */
export function addXp(s: StreakState, kind: XpKind, n: number, now = new Date(), pro = false): XpResult {
  const t = dayKey(now);
  const out: XpResult = { justMet: false, streak: streakLength(s, now), milestones: [] };
  if (!(n > 0)) return out;
  const x = (s.xp[t] ??= { learn: 0, live: 0 });
  x[kind] += n;
  const total = dayXp(s, t);

  if (s.repair && s.repair.on === t && total >= 2 * goalXp(s)) repairStreak(s, now);

  if (!s.met.includes(t) && total >= goalXp(s)) {
    s.met.push(t);
    out.justMet = true;
    const streak = streakLength(s, now);
    s.best = Math.max(s.best, streak);
    s.pending.push({ kind: "goal", streak });
    if (streak % 7 === 0 && s.freezes < freezeCap(pro)) {
      s.freezes++;
      s.pending.push({ kind: "freeze-earned", streak });
    }
    for (const m of MILESTONES) {
      if (streak >= m.days && !s.milestones.includes(m.days)) {
        s.milestones.push(m.days);
        out.milestones.push(m);
        s.pending.push({ kind: "milestone", days: m.days, chips: m.chips, title: m.title });
      }
    }
  }
  out.streak = streakLength(s, now);
  return out;
}

/**
 * Run once a day (cheap to call more often): spend freezes on missed days, or offer a repair
 * when the freezes don't cover the gap. Only whole past days are judged; today is never
 * "missed" before it ends. Mutates `s`.
 */
export function settleStreak(s: StreakState, now = new Date()): void {
  const t = dayKey(now);
  if (s.repair && s.repair.on !== t) s.repair = null;
  if (s.settled === t) return;
  s.settled = t;

  const set = counted(s);
  if (set.has(t)) return;
  const yesterday = addDays(now, -1);
  if (set.has(dayKey(yesterday))) return;

  // the most recent counted day before yesterday
  const last = [...set].filter((d) => d < dayKey(yesterday)).sort().at(-1);
  if (!last) return;
  const gap: string[] = [];
  for (let d = addDays(parseDay(last), 1); dayKey(d) < t; d = addDays(d, 1)) gap.push(dayKey(d));
  if (!gap.length) return;

  if (gap.length <= s.freezes) {
    s.freezes -= gap.length;
    s.covered.push(...gap);
    s.covered.sort();
    s.pending.push({ kind: "frozen", days: gap });
    return;
  }

  const length = runEndingOn(set, parseDay(last));
  const cooled = !s.lastRepair || dayKey(addDays(parseDay(s.lastRepair), REPAIR_COOLDOWN_DAYS)) <= t;
  if (length >= REPAIR_MIN_STREAK && gap.length <= REPAIR_MAX_GAP && cooled) {
    s.repair = { days: gap, length, on: t };
  }
}

/** Cover the missed days of today's repair offer. Mutates `s`; returns the restored streak. */
export function repairStreak(s: StreakState, now = new Date()): number {
  const t = dayKey(now);
  if (!s.repair || s.repair.on !== t) throw new StreakError("There's no streak to repair today");
  s.covered.push(...s.repair.days);
  s.covered.sort();
  s.lastRepair = t;
  s.repair = null;
  const streak = streakLength(s, now);
  s.best = Math.max(s.best, streak);
  s.pending.push({ kind: "repaired", streak });
  return streak;
}

/** Pro members get one freeze a month (within the cap). Returns true when one was added. */
export function grantProFreeze(s: StreakState, now = new Date()): boolean {
  const m = monthKey(now);
  if (s.proFreezeMonth === m) return false;
  s.proFreezeMonth = m;
  if (s.freezes >= FREEZE_CAP_PRO) return false;
  s.freezes++;
  return true;
}

export class StreakError extends Error {}

/** Buy a freeze for FREEZE_PRICE chips (`chips` in chip units, see chips.ts). Mutates `p`. */
export function buyFreeze(p: { chips: number; streak: StreakState }, pro: boolean): void {
  if (p.streak.freezes >= freezeCap(pro)) throw new StreakError(`You can hold ${freezeCap(pro)} freezes at most`);
  const cost = chipsToUnits(FREEZE_PRICE);
  if (p.chips < cost) throw new StreakError(`A freeze costs ${FREEZE_PRICE.toLocaleString("en-US")} chips`);
  p.chips -= cost;
  p.streak.freezes++;
}
