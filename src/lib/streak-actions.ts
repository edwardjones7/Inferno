"use client";

/**
 * Streak actions for the screens: the pure rules in streak.ts applied through `update()`.
 * Each throws StreakError with a message fit for a toast.
 */
import { useSyncExternalStore } from "react";
import { showRewardedAd } from "./ads";
import { isPro } from "./pro";
import { getProgress, update, useHydrated, useProgress } from "./store";
import {
  atRisk,
  buyFreeze as buyFreezeRule,
  dayXp,
  freezeCap,
  goalXp,
  grantProFreeze as grantProFreezeRule,
  nextMilestone,
  repairStreak as repairRule,
  streakLength,
  StreakError,
  type Celebration,
  type GoalId,
} from "./streak";
import { dayKey } from "./economy";

export { StreakError };

export function setGoal(goal: GoalId) {
  update((p) => {
    p.streak.goal = goal;
  });
}

export function setReminder(r: Partial<{ on: boolean; hour: number }>) {
  update((p) => {
    p.streak.reminder = { ...p.streak.reminder, ...r };
  });
}

export function buyFreeze() {
  update((p) => buyFreezeRule(p, isPro()));
}

/** Watch a rewarded ad to repair today's broken streak. Resolves the restored length, or 0 if no reward. */
export async function repairWithAd(): Promise<number> {
  if (!getProgress().streak.repair) throw new StreakError("There's no streak to repair today");
  if (!(await showRewardedAd("streak-repair"))) return 0;
  let n = 0;
  update((p) => {
    n = repairRule(p.streak);
  });
  return n;
}

/** Pro members get a monthly freeze; call when the app opens. */
export function grantProFreeze() {
  if (!isPro()) return;
  const s = getProgress().streak;
  const month = dayKey(new Date()).slice(0, 7);
  if (s.proFreezeMonth === month) return;
  update((p) => {
    grantProFreezeRule(p.streak);
  });
}

/** Take the oldest celebration off the queue. */
export function shiftCelebration(): Celebration | undefined {
  const c = getProgress().streak.pending[0];
  if (!c) return undefined;
  update((p) => {
    p.streak.pending.shift();
  });
  return c;
}

const tick = (l: () => void) => {
  const t = setInterval(l, 60_000);
  return () => clearInterval(t);
};
/** Today's key, re-rendering when the day rolls over. */
function useToday(): string {
  return useSyncExternalStore(tick, () => dayKey(new Date()), () => "");
}

export interface StreakView {
  ready: boolean;
  streak: number;
  best: number;
  todayXp: number;
  goal: number;
  goalId: GoalId;
  metToday: boolean;
  atRisk: boolean;
  freezes: number;
  freezeCap: number;
  repair: { days: number; length: number } | null;
  next: ReturnType<typeof nextMilestone>;
}

/** Everything a streak widget needs, computed from saved progress. */
export function useStreak(pro: boolean): StreakView {
  const p = useProgress();
  const ready = useHydrated();
  const t = useToday();
  const s = p.streak;
  const now = new Date();
  return {
    ready,
    streak: ready ? streakLength(s, now) : 0,
    best: ready ? s.best : 0,
    todayXp: ready && t ? dayXp(s, t) : 0,
    goal: goalXp(s),
    goalId: s.goal,
    metToday: ready && s.met.includes(t),
    atRisk: ready && atRisk(s, now),
    freezes: s.freezes,
    freezeCap: freezeCap(pro),
    repair: ready && s.repair && s.repair.on === t ? { days: s.repair.days.length, length: s.repair.length } : null,
    next: nextMilestone(s),
  };
}
