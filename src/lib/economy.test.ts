import { describe, expect, it } from "vitest";
import { challengesFor, CHALLENGES, claimableCount, claimChallenge, claimComeback, comebackStatus, periodWindow, pickChallenges } from "./challenges";
import { chipsToUnits, unitsToChips } from "./chips";
import {
  AD_DAILY_CAP,
  AD_REWARD,
  adsLeft,
  buyInFor,
  CASH_BUY_IN,
  CASH_MIN_BUY_IN,
  cashOut,
  CHECKIN_REWARDS,
  checkInStatus,
  claimAdReward,
  claimCheckIn,
  claimProMonthly,
  claimProSignup,
  COMEBACK_BELOW,
  COMEBACK_COOLDOWN_MS,
  COMEBACK_GRANT,
  EconomyError,
  grantChips,
  LEDGER_LIMIT,
  PRO_CHECKIN_MULTIPLIER,
  PRO_MONTHLY_GRANT,
  PRO_SIGNUP_BONUS,
  sitDown,
  STARTING_CHIPS,
  syncSeat,
  topUp,
} from "./economy";
import { LESSONS } from "./learn";
import { freshProgress, type BjRoundRecord, type Progress } from "./store";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
const fresh = () => freshProgress(0);
const balance = (p: Progress) => unitsToChips(p.chips);
const setBalance = (p: Progress, chips: number) => (p.chips = chipsToUnits(chips));

function bjRound(atMs: number, oks: boolean[]): BjRoundRecord {
  return {
    id: String(Math.random()),
    at: atMs,
    tableId: "classic",
    bet: 1000,
    wagered: 1000,
    payout: 0,
    dealer: [],
    hands: [],
    decisions: oks.map((ok) => ({ ok }) as BjRoundRecord["decisions"][number]),
  };
}

describe("grants", () => {
  it("adds whole chips in chip units and writes the ledger", () => {
    const p = fresh();
    grantChips(p, 150, "ad", 5);
    expect(balance(p)).toBe(STARTING_CHIPS + 150);
    expect(p.economy.ledger).toEqual([{ at: 5, chips: 150, reason: "ad" }]);
  });

  it("refuses zero or negative grants", () => {
    expect(() => grantChips(fresh(), 0, "ad")).toThrow(EconomyError);
    expect(() => grantChips(fresh(), -5, "ad")).toThrow(EconomyError);
  });

  it("keeps the ledger bounded", () => {
    const p = fresh();
    for (let i = 0; i < LEDGER_LIMIT + 20; i++) grantChips(p, 1, "ad", i);
    expect(p.economy.ledger).toHaveLength(LEDGER_LIMIT);
    expect(p.economy.ledger.at(-1)!.at).toBe(LEDGER_LIMIT + 19);
  });
});

describe("daily check-in", () => {
  it("pays day 1 and can't be claimed twice the same day", () => {
    const p = fresh();
    expect(checkInStatus(p, at(2026, 11, 17)).available).toBe(true);
    expect(claimCheckIn(p, at(2026, 11, 17, 8))).toBe(CHECKIN_REWARDS[0]);
    expect(checkInStatus(p, at(2026, 11, 17, 23)).available).toBe(false);
    expect(() => claimCheckIn(p, at(2026, 11, 17, 23))).toThrow(EconomyError);
    expect(balance(p)).toBe(STARTING_CHIPS + CHECKIN_REWARDS[0]);
  });

  it("escalates on consecutive days and repeats after day 7", () => {
    const p = fresh();
    const paid: number[] = [];
    for (let d = 0; d < 9; d++) paid.push(claimCheckIn(p, at(2026, 11, 10 + d)));
    expect(paid).toEqual([...CHECKIN_REWARDS, CHECKIN_REWARDS[0], CHECKIN_REWARDS[1]]);
    expect(p.economy.checkIn.streak).toBe(9);
  });

  it("rolls over at local midnight, and across months", () => {
    const p = fresh();
    claimCheckIn(p, new Date(2026, 10, 30, 23, 59));
    const s = checkInStatus(p, new Date(2026, 11, 1, 0, 1));
    expect(s.available).toBe(true);
    expect(s.day).toBe(2);
  });

  it("restarts the streak after a missed day", () => {
    const p = fresh();
    claimCheckIn(p, at(2026, 11, 10));
    claimCheckIn(p, at(2026, 11, 11));
    const s = checkInStatus(p, at(2026, 11, 13));
    expect(s.day).toBe(1);
    expect(claimCheckIn(p, at(2026, 11, 13))).toBe(CHECKIN_REWARDS[0]);
  });

  it("doubles for members", () => {
    expect(claimCheckIn(fresh(), at(2026, 11, 17), true)).toBe(CHECKIN_REWARDS[0] * PRO_CHECKIN_MULTIPLIER);
  });

  it("escalates in value", () => {
    for (let i = 1; i < CHECKIN_REWARDS.length; i++) expect(CHECKIN_REWARDS[i]).toBeGreaterThan(CHECKIN_REWARDS[i - 1]);
  });
});

describe("challenges", () => {
  const now = at(2026, 11, 17);

  it("are the same for everyone on a date, and change with the date", () => {
    const a = pickChallenges("day", now).map((c) => c.id);
    expect(pickChallenges("day", at(2026, 11, 17, 22)).map((c) => c.id)).toEqual(a);
    const days = Array.from({ length: 14 }, (_, i) => pickChallenges("day", at(2026, 11, 1 + i)).map((c) => c.id).join());
    expect(new Set(days).size).toBeGreaterThan(3);
  });

  it("weekly sets hold for the whole Monday-to-Sunday week", () => {
    const mon = pickChallenges("week", at(2026, 11, 16)).map((c) => c.id);
    expect(pickChallenges("week", at(2026, 11, 22, 23)).map((c) => c.id)).toEqual(mon);
    expect(periodWindow("week", at(2026, 11, 22)).key).toBe("w2026-11-16");
    expect(periodWindow("week", at(2026, 11, 23)).key).toBe("w2026-11-23");
  });

  it("always include a learning challenge and a skill challenge, and at most one volume one", () => {
    for (let d = 0; d < 60; d++) {
      for (const period of ["day", "week"] as const) {
        const set = pickChallenges(period, at(2026, 1, 1 + d));
        expect(set).toHaveLength(3);
        expect(new Set(set.map((c) => c.id)).size).toBe(3);
        expect(set.some((c) => c.group === "learn")).toBe(true);
        expect(set.some((c) => c.group === "skill")).toBe(true);
        expect(set.filter((c) => c.group === "volume").length).toBeLessThanOrEqual(1);
        expect(set.every((c) => c.period === period)).toBe(true);
      }
    }
  });

  it("skip lesson challenges once every lesson is done", () => {
    const p = fresh();
    for (const l of LESSONS) p.lessons[l.id] = 1;
    for (let d = 0; d < 30; d++) {
      const set = pickChallenges("day", at(2026, 3, 1 + d), p);
      expect(set.some((c) => c.id === "d-lesson")).toBe(false);
      expect(set).toHaveLength(3);
    }
  });

  it("measure progress from today's activity only", () => {
    const p = fresh();
    const today = at(2026, 11, 17).getTime();
    const yesterday = at(2026, 11, 16).getTime();
    for (let i = 0; i < 30; i++) p.bjRounds.push(bjRound(yesterday, [true]));
    for (let i = 0; i < 7; i++) p.bjRounds.push(bjRound(today, [true, true]));
    p.bjRounds.push(bjRound(today, [false]));
    const def = (id: string) => CHALLENGES.find((c) => c.id === id)!;
    const w = periodWindow("day", now);
    expect(def("d-bj-hands").measure(p, w)).toBe(8);
    expect(def("d-bj-streak").measure(p, w)).toBe(14);
    expect(def("d-bj-clean").measure(p, w)).toBe(7);
    // the weekly streak is broken by the miss at the end of the run but the best run stands
    expect(def("w-bj-streak").measure(p, periodWindow("week", now))).toBe(44);
  });

  it("measure lessons, puzzles, drills, poker and matches", () => {
    const p = fresh();
    const t = at(2026, 11, 17).getTime();
    const def = (id: string) => CHALLENGES.find((c) => c.id === id)!;
    const day = periodWindow("day", now);
    const week = periodWindow("week", now);
    p.lessons = { a: t, b: at(2026, 11, 16).getTime(), c: at(2026, 11, 1).getTime() };
    expect(def("d-lesson").measure(p, day)).toBe(1);
    expect(def("w-lessons").measure(p, week)).toBe(2);
    p.daily = { "2026-11-17": [true, false, true], "2026-11-16": [true, true, true], "2026-11-15": [true, true, true] };
    expect(def("d-daily").measure(p, day)).toBe(3);
    expect(def("w-daily").measure(p, week)).toBe(1);
    p.drills = [true, true, false, true].map((ok) => ({ at: t, game: "poker", key: "k", label: "l", kind: "preflop", correct: "x", ok }));
    expect(def("d-drills").measure(p, day)).toBe(3);
    const hand = (net: number, oks: (boolean | null)[]) =>
      ({ id: "h", at: t, mode: "table", bots: [], handNo: 1, hole: [], board: [], shown: {}, names: [], net, bb: 10, log: [], notes: oks.map((ok) => ({ street: "preflop", ok, title: "", detail: "", at: 0 })) }) as Progress["pokerHands"][number];
    p.pokerHands = [hand(250, [true, null, false]), hand(600, [true, true]), hand(-100, [])];
    expect(def("d-pk-coach").measure(p, day)).toBe(3);
    expect(def("d-pk-pot").measure(p, day)).toBe(2);
    expect(def("w-pk-pot").measure(p, week)).toBe(1);
    expect(def("d-pk-hands").measure(p, day)).toBe(3);
    p.matches = [{ id: "m", at: t, botId: "x", result: "win", hands: 10, before: 1000, after: 1010 }];
    expect(def("w-match").measure(p, week)).toBe(1);
    p.days = ["2026-11-10", "2026-11-16", "2026-11-17"];
    expect(def("w-active").measure(p, week)).toBe(2);
  });

  it("can be claimed once when finished, and not before", () => {
    const p = fresh();
    const list = challengesFor("day", p, now);
    const c = list[0];
    expect(c.done).toBe(false);
    expect(() => claimChallenge(p, c.key, now)).toThrow(EconomyError);
    // finish every daily challenge with plenty of activity
    const t = now.getTime();
    for (let i = 0; i < 30; i++) p.bjRounds.push(bjRound(t, [true]));
    p.lessons = { x: t };
    p.daily = { "2026-11-17": [true, true, true] };
    p.drills = Array.from({ length: 20 }, () => ({ at: t, game: "poker" as const, key: "k", label: "l", kind: "preflop", correct: "x", ok: true }));
    p.pokerHands = Array.from({ length: 30 }, () => ({ id: "h", at: t, mode: "table" as const, bots: [], handNo: 1, hole: [], board: [], shown: {}, names: [], net: 300, bb: 10, log: [], notes: [{ street: "preflop", ok: true, title: "", detail: "", at: 0 }] }));
    const done = challengesFor("day", p, now);
    expect(done.every((c) => c.done)).toBe(true);
    const before = balance(p);
    expect(claimChallenge(p, done[0].key, now)).toBe(done[0].reward);
    expect(balance(p)).toBe(before + done[0].reward);
    expect(challengesFor("day", p, now)[0].claimed).toBe(true);
    expect(() => claimChallenge(p, done[0].key, now)).toThrow(EconomyError);
    // tomorrow it's a different period: yesterday's key can't be claimed
    expect(() => claimChallenge(p, done[1].key, at(2026, 11, 18))).toThrow(/ended/);
  });

  it("forget claims from finished periods", () => {
    const p = fresh();
    p.economy.claimed = ["d2026-01-01:d-lesson", "w2025-12-29:w-hands"];
    const t = now.getTime();
    p.lessons = { x: t };
    p.daily = { "2026-11-17": [true, true, true] };
    p.drills = Array.from({ length: 20 }, () => ({ at: t, game: "poker" as const, key: "k", label: "l", kind: "preflop", correct: "x", ok: true }));
    const learn = challengesFor("day", p, now).find((c) => c.group === "learn")!;
    expect(learn.done).toBe(true);
    claimChallenge(p, learn.key, now);
    expect(p.economy.claimed).toEqual([learn.key]);
  });
});

describe("rewarded ads", () => {
  it("pay up to the daily cap, then reset the next day", () => {
    const p = fresh();
    const day = at(2026, 11, 17);
    for (let i = 0; i < AD_DAILY_CAP; i++) expect(claimAdReward(p, day)).toBe(AD_REWARD);
    expect(adsLeft(p, day)).toBe(0);
    expect(() => claimAdReward(p, day)).toThrow(EconomyError);
    expect(adsLeft(p, at(2026, 11, 18))).toBe(AD_DAILY_CAP);
    claimAdReward(p, at(2026, 11, 18));
    expect(adsLeft(p, at(2026, 11, 18))).toBe(AD_DAILY_CAP - 1);
    expect(balance(p)).toBe(STARTING_CHIPS + AD_REWARD * (AD_DAILY_CAP + 1));
  });
});

describe("Pro grants", () => {
  it("are for members only", () => {
    const p = fresh();
    expect(() => claimProSignup(p, at(2026, 11, 17), false)).toThrow(EconomyError);
    expect(() => claimProMonthly(p, at(2026, 11, 17), false)).toThrow(EconomyError);
  });

  it("pay the signup bonus once and the monthly grant once per calendar month", () => {
    const p = fresh();
    expect(claimProSignup(p, at(2026, 11, 17), true)).toBe(PRO_SIGNUP_BONUS);
    expect(() => claimProSignup(p, at(2027, 1, 1), true)).toThrow(EconomyError);
    expect(claimProMonthly(p, at(2026, 11, 17), true)).toBe(PRO_MONTHLY_GRANT);
    expect(() => claimProMonthly(p, at(2026, 11, 30), true)).toThrow(EconomyError);
    expect(claimProMonthly(p, at(2026, 12, 1), true)).toBe(PRO_MONTHLY_GRANT);
  });

  it("are generous next to the free sources", () => {
    const freeWeek = CHECKIN_REWARDS.reduce((a, b) => a + b, 0) + AD_REWARD * AD_DAILY_CAP * 7;
    expect(PRO_SIGNUP_BONUS).toBeGreaterThan(freeWeek * 2);
    expect(PRO_MONTHLY_GRANT).toBeGreaterThan(freeWeek * 1.5);
  });
});

describe("comeback grant", () => {
  const now = at(2026, 11, 17, 10);

  it("isn't offered while you can still play", () => {
    const p = fresh();
    expect(comebackStatus(p, now, false).broke).toBe(false);
    expect(() => claimComeback(p, now, false)).toThrow(EconomyError);
  });

  it("waits until the other free rewards are claimed", () => {
    const p = fresh();
    setBalance(p, 50);
    const s = comebackStatus(p, now, false);
    expect(s.broke).toBe(true);
    expect(s.blocked).toBe(true); // the check-in is waiting
    expect(claimableCount(p, now, false)).toBe(1);
    claimCheckIn(p, now);
    setBalance(p, 50);
    expect(comebackStatus(p, now, false).available).toBe(true);
  });

  it("pays a small grant, then cools down", () => {
    const p = fresh();
    claimCheckIn(p, now);
    setBalance(p, 0);
    expect(claimComeback(p, now, false)).toBe(COMEBACK_GRANT);
    expect(balance(p)).toBe(COMEBACK_GRANT);
    setBalance(p, 0);
    const s = comebackStatus(p, new Date(now.getTime() + 60_000), false);
    expect(s.available).toBe(false);
    expect(s.readyAt).toBe(now.getTime() + COMEBACK_COOLDOWN_MS);
    expect(() => claimComeback(p, new Date(now.getTime() + 60_000), false)).toThrow(/ready/);
    expect(claimComeback(p, new Date(now.getTime() + COMEBACK_COOLDOWN_MS), false)).toBe(COMEBACK_GRANT);
  });

  it("counts chips sitting at the cash table", () => {
    const p = fresh();
    claimCheckIn(p, now);
    setBalance(p, 0);
    p.cashSeat = { stack: COMEBACK_BELOW, buyIn: 1000, at: 0 };
    expect(comebackStatus(p, now, false).broke).toBe(false);
  });

  it("always covers the cash game's minimum buy-in", () => {
    expect(COMEBACK_GRANT).toBeGreaterThanOrEqual(CASH_MIN_BUY_IN);
    expect(COMEBACK_BELOW).toBeLessThanOrEqual(COMEBACK_GRANT);
  });
});

describe("cash game seat", () => {
  it("buys in 100bb from the balance and cashes the stack back out", () => {
    const p = fresh();
    expect(sitDown(p, 1)).toBe(CASH_BUY_IN);
    expect(balance(p)).toBe(STARTING_CHIPS - CASH_BUY_IN);
    expect(p.cashSeat).toEqual({ stack: CASH_BUY_IN, buyIn: CASH_BUY_IN, at: 1 });
    syncSeat(p, 1_450);
    expect(cashOut(p)).toBe(1_450);
    expect(balance(p)).toBe(STARTING_CHIPS - CASH_BUY_IN + 1_450);
    expect(p.cashSeat).toBeNull();
    expect(cashOut(p)).toBe(0);
  });

  it("buys in short when you have less than 100bb, but not below the minimum", () => {
    const p = fresh();
    setBalance(p, 650.5);
    expect(buyInFor(p)).toBe(650);
    expect(sitDown(p, 0)).toBe(650);
    expect(balance(p)).toBeCloseTo(0.5);
    const q = fresh();
    setBalance(q, CASH_MIN_BUY_IN - 1);
    expect(buyInFor(q)).toBe(0);
    expect(() => sitDown(q, 0)).toThrow(EconomyError);
    expect(balance(q)).toBe(CASH_MIN_BUY_IN - 1);
  });

  it("settles a seat left behind before taking a new one", () => {
    const p = fresh();
    sitDown(p, 0);
    syncSeat(p, 300); // lost most of it, then the app closed
    sitDown(p, 1);
    expect(balance(p)).toBe(STARTING_CHIPS - CASH_BUY_IN + 300 - CASH_BUY_IN);
    expect(p.cashSeat!.stack).toBe(CASH_BUY_IN);
  });

  it("rebuys up to 100bb from the balance", () => {
    const p = fresh();
    sitDown(p, 0);
    syncSeat(p, 0);
    expect(topUp(p, 0)).toBe(CASH_BUY_IN);
    expect(p.cashSeat).toMatchObject({ stack: CASH_BUY_IN, buyIn: CASH_BUY_IN * 2 });
    expect(balance(p)).toBe(STARTING_CHIPS - CASH_BUY_IN * 2);
    syncSeat(p, 700);
    expect(topUp(p, 700)).toBe(300);
    expect(() => topUp(p, CASH_BUY_IN)).toThrow(/full/);
  });

  it("won't rebuy below the minimum, and chips never go negative", () => {
    const p = fresh();
    sitDown(p, 0);
    setBalance(p, 100);
    syncSeat(p, 0);
    expect(() => topUp(p, 0)).toThrow(EconomyError);
    expect(balance(p)).toBe(100);
    expect(topUp(p, 900)).toBe(100);
    expect(balance(p)).toBe(0);
  });

  it("needs a seat to rebuy or sync", () => {
    const p = fresh();
    expect(() => topUp(p, 0)).toThrow(EconomyError);
    expect(syncSeat(p, 10)).toBe(false);
  });
});

describe("saved documents", () => {
  it("old progress without economy fields loads with defaults", () => {
    const old = { ...fresh() } as Partial<Progress>;
    delete old.economy;
    delete old.cashSeat;
    const merged = { ...freshProgress(), ...old } as Progress;
    expect(merged.economy.claimed).toEqual([]);
    expect(merged.cashSeat).toBeNull();
    expect(checkInStatus(merged, at(2026, 11, 17)).available).toBe(true);
  });
});
