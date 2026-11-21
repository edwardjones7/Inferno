/**
 * The chip economy: every amount, cap and cooldown, and the pure rules behind them.
 *
 * Chips are play money (see AGENTS.md, "Chips"): they can't be bought, cashed out or sent to
 * anyone. They exist so a hand has something on the line. One balance (`progress.chips`, in
 * chip units, see chips.ts) pays for blackjack bets and poker cash-game buy-ins.
 *
 * Nothing in this file touches storage. Every function takes the progress draft handed out
 * by `update()` (or a plain object in tests) and the current time, so it can be tested and,
 * later, run on a server. `earn.ts` wraps them in `update()` for the screens;
 * challenges.ts holds the challenge pool and the comeback rule.
 *
 * Every chip that enters the game after the starting stack goes through `grantChips()`,
 * which also writes the ledger.
 *
 * ---------------------------------------------------------------------------- tuning
 * Reference points: a blackjack bet is usually 5-25 chips, a cash-game buy-in is 1,000
 * (100 big blinds at 5/10). Good basic strategy loses about 0.5% of what you bet, so a
 * hundred 10-chip hands cost ~5 chips on average but swing ±100. A poker buy-in can go in
 * one bad hand.
 *
 * - A casual free player (check-in plus a couple of daily challenges) makes ~700 a day:
 *   an evening of blackjack or most of a buy-in, so losing a stack stings.
 * - A committed free player (check-in, every challenge, five ads) makes ~2,000 a day, about
 *   two buy-ins: chips are worth chasing, and the chasing is mostly learning.
 * - Challenges pay the most and lean on learning and good decisions; pure volume ("play 20
 *   hands") is at most one of the three and pays the least. See challenges.ts.
 * - Pro: the signup bonus is about two weeks of committed free play in one go, the monthly
 *   grant about ten days' worth, and the check-in is doubled.
 * - Nobody is ever stuck: below the cash-game minimum buy-in, with nothing to claim, a
 *   comeback grant is free every few hours. Lessons, drills and puzzles never cost chips.
 */
import { chipsToUnits, unitsToChips } from "./chips";
import type { Progress } from "./store";

/* ------------------------------------------------------------------ amounts */

/** New players start here. */
export const STARTING_CHIPS = 2_500;

/** Daily check-in, by day of the streak. Day 7 is the big one, then the cycle repeats. */
export const CHECKIN_REWARDS = [100, 150, 200, 250, 300, 400, 750] as const;

/**
 * Challenge rewards (the pool is in challenges.ts). Three a day (~570 total) and three a
 * week (~3,300). Learning and good decisions pay more than volume.
 */
export const CHALLENGE_REWARDS = {
  day: { lesson: 250, learn: 200, skill: 200, skillEasy: 150, volume: 120 },
  week: { match: 1_500, lessons: 1_200, active: 1_200, learn: 1_000, skill: 1_000, volume: 800 },
} as const;

/** Rewarded ads: chips per ad, ads per calendar day. */
export const AD_REWARD = 150;
export const AD_DAILY_CAP = 5;

/** Comeback grant: free chips when you're below the floor and nothing else is claimable. */
export const COMEBACK_GRANT = 500;
/** "Broke" means balance plus chips at the cash table below this (the cash-game minimum buy-in). */
export const COMEBACK_BELOW = 400;
export const COMEBACK_COOLDOWN_MS = 4 * 60 * 60 * 1000;

/** Pro: once on signup, once per calendar month, and the check-in multiplier. */
export const PRO_SIGNUP_BONUS = 25_000;
export const PRO_MONTHLY_GRANT = 20_000;
export const PRO_CHECKIN_MULTIPLIER = 2;

/** 6-max cash game: blinds, full buy-in (100bb) and the shortest buy-in allowed (40bb). */
export const CASH_BLINDS = [5, 10] as const;
export const CASH_BUY_IN = 1_000;
export const CASH_MIN_BUY_IN = 400;

/** How many grants the ledger keeps. */
export const LEDGER_LIMIT = 100;

/* ------------------------------------------------------------------ state */

export type GrantReason = "checkin" | "challenge" | "ad" | "comeback" | "pro-signup" | "pro-monthly" | "streak";

export interface LedgerEntry {
  at: number;
  /** whole chips */
  chips: number;
  reason: GrantReason;
  /** e.g. the challenge id */
  note?: string;
}

export interface EconomyState {
  checkIn: { last: string | null; streak: number };
  ads: { day: string | null; n: number };
  /** when the last comeback grant was given (ms, 0 = never) */
  comebackAt: number;
  proSignup: boolean;
  /** yyyy-mm of the last monthly Pro grant */
  proMonth: string | null;
  /** claimed challenge keys ("period:challengeId") */
  claimed: string[];
  ledger: LedgerEntry[];
}

/** Chips sitting at the 6-max cash table. Poker chips are whole chips. */
export interface CashSeat {
  stack: number;
  /** total bought in this session */
  buyIn: number;
  at: number;
}

export const freshEconomy = (): EconomyState => ({
  checkIn: { last: null, streak: 0 },
  ads: { day: null, n: 0 },
  comebackAt: 0,
  proSignup: false,
  proMonth: null,
  claimed: [],
  ledger: [],
});

export type Wallet = Pick<Progress, "chips" | "economy" | "cashSeat">;

export class EconomyError extends Error {}

/* ------------------------------------------------------------------ dates */

/** Local calendar day, yyyy-mm-dd (same format as store.today()). */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const monthKey = (d: Date) => dayKey(d).slice(0, 7);

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/** Start of the local day and of the week (weeks start on Monday). */
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

/* ------------------------------------------------------------------ grants */

/** The one way chips are created after the starting stack. Mutates the draft. */
export function grantChips(p: Wallet, chips: number, reason: GrantReason, now = Date.now(), note?: string): number {
  if (!Number.isFinite(chips) || chips <= 0) throw new EconomyError("Grant must be positive");
  p.chips += chipsToUnits(chips);
  p.economy.ledger.push(note ? { at: now, chips, reason, note } : { at: now, chips, reason });
  if (p.economy.ledger.length > LEDGER_LIMIT) p.economy.ledger = p.economy.ledger.slice(-LEDGER_LIMIT);
  return chips;
}

/** Balance in whole chips, plus whatever is sitting at the cash table. */
export const netWorth = (p: Wallet) => unitsToChips(p.chips) + (p.cashSeat?.stack ?? 0);

/* ------------------------------------------------------------------ daily check-in */

export interface CheckInStatus {
  /** can be claimed now */
  available: boolean;
  /** the streak day (1-based) you're on: the one you'd claim, or just claimed */
  day: number;
  /** position in the 7-day cycle, 0-6 */
  slot: number;
  /** chips for that day */
  reward: number;
}

export function checkInStatus(p: Wallet, now: Date, pro = false): CheckInStatus {
  const { last, streak } = p.economy.checkIn;
  const t = dayKey(now);
  const yesterday = dayKey(addDays(now, -1));
  const claimed = last === t;
  const day = claimed ? streak : last === yesterday ? streak + 1 : 1;
  const slot = (Math.max(1, day) - 1) % CHECKIN_REWARDS.length;
  return { available: !claimed, day: Math.max(1, day), slot, reward: CHECKIN_REWARDS[slot] * (pro ? PRO_CHECKIN_MULTIPLIER : 1) };
}

export function claimCheckIn(p: Wallet, now: Date, pro = false): number {
  const s = checkInStatus(p, now, pro);
  if (!s.available) throw new EconomyError("Already checked in today");
  p.economy.checkIn = { last: dayKey(now), streak: s.day };
  return grantChips(p, s.reward, "checkin", now.getTime(), `day ${s.day}`);
}

/* ------------------------------------------------------------------ rewarded ads */

export function adsLeft(p: Wallet, now: Date): number {
  const { day, n } = p.economy.ads;
  return day === dayKey(now) ? Math.max(0, AD_DAILY_CAP - n) : AD_DAILY_CAP;
}

/** Call only after the ad reports the reward was earned. */
export function claimAdReward(p: Wallet, now: Date): number {
  if (adsLeft(p, now) <= 0) throw new EconomyError("That's all the ads for today");
  const t = dayKey(now);
  p.economy.ads = { day: t, n: (p.economy.ads.day === t ? p.economy.ads.n : 0) + 1 };
  return grantChips(p, AD_REWARD, "ad", now.getTime());
}

/* ------------------------------------------------------------------ Pro grants */

export interface ProGrants {
  signup: boolean;
  monthly: boolean;
}

export function proGrants(p: Wallet, now: Date, pro: boolean): ProGrants {
  if (!pro) return { signup: false, monthly: false };
  return { signup: !p.economy.proSignup, monthly: p.economy.proMonth !== monthKey(now) };
}

export function claimProSignup(p: Wallet, now: Date, pro: boolean): number {
  if (!proGrants(p, now, pro).signup) throw new EconomyError(pro ? "Already claimed" : "Members only");
  p.economy.proSignup = true;
  return grantChips(p, PRO_SIGNUP_BONUS, "pro-signup", now.getTime());
}

export function claimProMonthly(p: Wallet, now: Date, pro: boolean): number {
  if (!proGrants(p, now, pro).monthly) throw new EconomyError(pro ? "Already claimed this month" : "Members only");
  p.economy.proMonth = monthKey(now);
  return grantChips(p, PRO_MONTHLY_GRANT, "pro-monthly", now.getTime(), monthKey(now));
}

/* ------------------------------------------------------------------ cash game */

/** What a buy-in would be right now: a full 100bb, or whatever you have down to 40bb, else 0. */
export function buyInFor(p: Wallet): number {
  const have = Math.floor(unitsToChips(p.chips));
  const amount = Math.min(CASH_BUY_IN, have);
  return amount >= CASH_MIN_BUY_IN ? amount : 0;
}

/** Take a seat: settles any seat left over, then moves the buy-in from the balance to the table. */
export function sitDown(p: Wallet, now: number): number {
  cashOut(p);
  const amount = buyInFor(p);
  if (!amount) throw new EconomyError(`The cash game needs at least ${CASH_MIN_BUY_IN.toLocaleString("en-US")} chips`);
  p.chips -= chipsToUnits(amount);
  p.cashSeat = { stack: amount, buyIn: amount, at: now };
  return amount;
}

/**
 * Top a short stack back up to 100bb from the balance (a rebuy when it's empty). Returns the
 * chips added. Only between hands; `stack` is the hero's stack at the table.
 */
export function topUp(p: Wallet, stack: number): number {
  if (!p.cashSeat) throw new EconomyError("You're not seated");
  const want = CASH_BUY_IN - stack;
  const amount = Math.min(want, Math.floor(unitsToChips(p.chips)));
  if (want <= 0) throw new EconomyError("Your stack is already full");
  if (amount <= 0 || stack + amount < CASH_MIN_BUY_IN) throw new EconomyError("Not enough chips to rebuy");
  p.chips -= chipsToUnits(amount);
  p.cashSeat = { ...p.cashSeat, stack: stack + amount, buyIn: p.cashSeat.buyIn + amount };
  return amount;
}

/** Mirror the hero's stack (chips behind, not in the pot) onto the seat. */
export function syncSeat(p: Wallet, stack: number): boolean {
  if (!p.cashSeat || p.cashSeat.stack === stack) return false;
  p.cashSeat = { ...p.cashSeat, stack: Math.max(0, Math.floor(stack)) };
  return true;
}

/**
 * Leave the table: the stack goes back to the balance. Chips already in the pot of a hand
 * that wasn't finished are lost, as when you fold. Returns the chips returned.
 */
export function cashOut(p: Wallet): number {
  const seat = p.cashSeat;
  if (!seat) return 0;
  p.chips += chipsToUnits(seat.stack);
  p.cashSeat = null;
  return seat.stack;
}
