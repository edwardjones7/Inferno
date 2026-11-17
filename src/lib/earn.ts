"use client";

/**
 * Chip actions for the screens: the pure rules in economy.ts / challenges.ts, applied to the
 * saved progress through `update()`. Each returns the chips moved, or throws EconomyError
 * with a message fit for a toast.
 */
import { useEffect, useState } from "react";
import { claimChallenge as claimChallengeRule, claimComeback as claimComebackRule } from "./challenges";
import {
  claimAdReward as claimAdRule,
  claimCheckIn as claimCheckInRule,
  claimProMonthly as claimProMonthlyRule,
  claimProSignup as claimProSignupRule,
  cashOut,
  EconomyError,
  sitDown,
  syncSeat,
  topUp,
} from "./economy";
import { isPro } from "./pro";
import { getProgress, update, type Progress } from "./store";

export { EconomyError };

function run(fn: (p: Progress) => number): number {
  let out = 0;
  update((p) => {
    out = fn(p);
  });
  return out;
}

export const claimCheckIn = () => run((p) => claimCheckInRule(p, new Date(), isPro()));

export const claimChallenge = (key: string) => run((p) => claimChallengeRule(p, key, new Date()));
export const claimComeback = () => run((p) => claimComebackRule(p, new Date(), isPro()));
export const claimProSignup = () => run((p) => claimProSignupRule(p, new Date(), isPro()));
export const claimProMonthly = () => run((p) => claimProMonthlyRule(p, new Date(), isPro()));
/** Call only once `showRewardedAd()` has resolved true. */
export const claimAdReward = () => run((p) => claimAdRule(p, new Date()));

/* ------------------------------------------------------------------ cash game seat */

export const takeSeat = () => run((p) => sitDown(p, Date.now()));
export const rebuy = (stack: number) => run((p) => topUp(p, stack));
export const leaveSeat = () => (getProgress().cashSeat ? run((p) => cashOut(p)) : 0);

/** Mirror the hero's stack onto the seat (skips the write when nothing changed). */
export function saveSeatStack(stack: number) {
  const seat = getProgress().cashSeat;
  if (!seat || seat.stack === stack) return;
  update((p) => {
    syncSeat(p, stack);
  });
}

/**
 * A seat still saved when you're on any other screen was left behind by an app that closed
 * mid-session: the stack goes back to the balance (a hand in progress counts as folded).
 * The cash table cashes out itself when you leave it, so this only catches hard closes.
 */
export function useSettleLeftSeat() {
  useEffect(() => {
    leaveSeat();
  }, []);
}

/** The current time, ticking every `ms` (for countdowns and day rollovers). */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
