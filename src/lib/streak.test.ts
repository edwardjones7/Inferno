import { describe, expect, it } from "vitest";
import { addDays, dayKey } from "./economy";
import {
  addXp,
  atRisk,
  dayXp,
  FREEZE_CAP,
  freshStreak,
  grantProFreeze,
  LIVE_XP_CAP,
  migrateStreak,
  repairStreak,
  settleStreak,
  streakLength,
  StreakError,
  XP,
  type StreakState,
} from "./streak";

const NOW = new Date(2026, 10, 21, 15, 0);
const day = (n: number) => dayKey(addDays(NOW, n));
const at = (n: number, h = 15) => {
  const d = addDays(NOW, n);
  d.setHours(h);
  return d;
};

/** A streak whose goal was met on each of the given day offsets. */
function withMet(offsets: number[], patch: Partial<StreakState> = {}): StreakState {
  return { ...freshStreak(), met: offsets.map(day).sort(), ...patch };
}

describe("daily goal", () => {
  it("counts a day only once the goal's XP is reached", () => {
    const s = freshStreak(); // casual: 10 XP
    expect(addXp(s, "learn", XP.drillRight * 4, NOW).justMet).toBe(false);
    expect(streakLength(s, NOW)).toBe(0);
    const r = addXp(s, "learn", XP.drillRight, NOW);
    expect(r.justMet).toBe(true);
    expect(r.streak).toBe(1);
    expect(addXp(s, "learn", 5, NOW).justMet).toBe(false);
  });

  it("one lesson meets the casual goal", () => {
    const s = freshStreak();
    expect(addXp(s, "learn", XP.lesson, NOW).justMet).toBe(true);
  });

  it("live play alone can't meet the goal", () => {
    const s = freshStreak();
    addXp(s, "live", 50, NOW);
    expect(dayXp(s, day(0))).toBe(LIVE_XP_CAP);
    expect(s.met).toEqual([]);
    addXp(s, "learn", 10 - LIVE_XP_CAP, NOW);
    expect(s.met).toEqual([day(0)]);
  });

  it("the serious goal needs 40 XP", () => {
    const s = { ...freshStreak(), goal: "serious" as const };
    addXp(s, "learn", 39, NOW);
    expect(s.met).toEqual([]);
    addXp(s, "learn", 1, NOW);
    expect(s.met).toEqual([day(0)]);
  });

  it("ignores zero and negative XP", () => {
    const s = freshStreak();
    addXp(s, "learn", 0, NOW);
    addXp(s, "learn", -5, NOW);
    expect(s.xp).toEqual({});
  });
});

describe("streak length", () => {
  it("survives until midnight: yesterday's streak still counts today", () => {
    const s = withMet([-3, -2, -1]);
    expect(streakLength(s, NOW)).toBe(3);
    expect(atRisk(s, NOW)).toBe(true);
  });

  it("includes today once the goal is met", () => {
    const s = withMet([-2, -1, 0]);
    expect(streakLength(s, NOW)).toBe(3);
    expect(atRisk(s, NOW)).toBe(false);
  });

  it("is broken by a missed day", () => {
    expect(streakLength(withMet([-4, -3, -1]), NOW)).toBe(1);
    expect(streakLength(withMet([-4, -3]), NOW)).toBe(0);
  });

  it("counts covered (frozen or repaired) days", () => {
    const s = withMet([-3, -1], { covered: [day(-2)] });
    expect(streakLength(s, NOW)).toBe(3);
  });

  it("crosses month boundaries", () => {
    const s = freshStreak();
    const jan31 = new Date(2027, 0, 31, 12);
    const feb1 = new Date(2027, 1, 1, 12);
    addXp(s, "learn", 10, jan31);
    addXp(s, "learn", 10, feb1);
    expect(streakLength(s, feb1)).toBe(2);
  });
});

describe("freezes", () => {
  it("earns one every 7 days of streak, up to the cap", () => {
    const s = withMet([-6, -5, -4, -3, -2, -1]);
    addXp(s, "learn", 10, NOW);
    expect(s.freezes).toBe(1);
    expect(s.pending.some((c) => c.kind === "freeze-earned")).toBe(true);

    const full = withMet([-6, -5, -4, -3, -2, -1], { freezes: FREEZE_CAP });
    addXp(full, "learn", 10, NOW);
    expect(full.freezes).toBe(FREEZE_CAP);
  });

  it("covers a missed day automatically", () => {
    const s = withMet([-4, -3, -2], { freezes: 1 });
    settleStreak(s, NOW);
    expect(s.freezes).toBe(0);
    expect(s.covered).toEqual([day(-1)]);
    expect(streakLength(s, NOW)).toBe(4);
    expect(s.pending).toContainEqual({ kind: "frozen", days: [day(-1)] });
  });

  it("covers two missed days with two freezes", () => {
    const s = withMet([-5, -4, -3], { freezes: 2 });
    settleStreak(s, NOW);
    expect(s.freezes).toBe(0);
    expect(streakLength(s, NOW)).toBe(5);
  });

  it("isn't spent when there aren't enough to save the streak", () => {
    const s = withMet([-6, -5, -4], { freezes: 1 });
    settleStreak(s, NOW);
    expect(s.freezes).toBe(1);
    expect(s.covered).toEqual([]);
  });

  it("isn't spent when nothing was missed, and settling twice is harmless", () => {
    const s = withMet([-2, -1], { freezes: 1 });
    settleStreak(s, NOW);
    settleStreak(s, NOW);
    expect(s.freezes).toBe(1);
  });

  it("never treats today as missed", () => {
    const s = withMet([-1], { freezes: 1 });
    settleStreak(s, at(0, 23));
    expect(s.freezes).toBe(1);
  });

  it("Pro gets one a month", () => {
    const s = freshStreak();
    expect(grantProFreeze(s, NOW)).toBe(true);
    expect(grantProFreeze(s, NOW)).toBe(false);
    expect(s.freezes).toBe(1);
    expect(grantProFreeze(s, new Date(2026, 11, 2))).toBe(true);
    expect(s.freezes).toBe(2);
  });
});

describe("repair", () => {
  it("is offered for a streak of 3+ broken by one or two missed days, and lapses after", () => {
    const s = withMet([-4, -3, -2]);
    settleStreak(s, NOW);
    expect(s.repair).toEqual({ days: [day(-1)], length: 3, on: day(0) });
    settleStreak(s, at(1));
    expect(s.repair).toEqual({ days: [day(-1), day(0)], length: 3, on: day(1) });
    settleStreak(s, at(2));
    expect(s.repair).toBeNull();
  });

  it("isn't offered for short streaks or long gaps", () => {
    const short = withMet([-3, -2]);
    settleStreak(short, NOW);
    expect(short.repair).toBeNull();
    const long = withMet([-7, -6, -5, -4]);
    settleStreak(long, NOW);
    expect(long.repair).toBeNull();
  });

  it("restores the streak", () => {
    const s = withMet([-5, -4, -3]);
    settleStreak(s, NOW);
    expect(s.repair?.days).toEqual([day(-2), day(-1)]);
    expect(repairStreak(s, NOW)).toBe(5);
    expect(s.repair).toBeNull();
    addXp(s, "learn", 10, NOW);
    expect(streakLength(s, NOW)).toBe(6);
  });

  it("completes by itself when double the goal is earned that day", () => {
    const s = withMet([-4, -3, -2]);
    settleStreak(s, NOW);
    addXp(s, "learn", 10, NOW);
    expect(s.repair).not.toBeNull();
    expect(streakLength(s, NOW)).toBe(1);
    addXp(s, "learn", 10, NOW);
    expect(s.repair).toBeNull();
    expect(streakLength(s, NOW)).toBe(5);
  });

  it("has a cooldown", () => {
    const s = withMet([-4, -3, -2], { lastRepair: day(-10) });
    settleStreak(s, NOW);
    expect(s.repair).toBeNull();
  });

  it("throws without an offer", () => {
    expect(() => repairStreak(freshStreak(), NOW)).toThrow(StreakError);
  });
});

describe("milestones", () => {
  it("pays once when reached", () => {
    const s = withMet([-2, -1]);
    const r = addXp(s, "learn", 10, NOW);
    expect(r.milestones.map((m) => m.days)).toEqual([3]);
    expect(s.milestones).toEqual([3]);
  });

  it("isn't paid again on a later streak", () => {
    const s = withMet([-2, -1], { milestones: [3] });
    expect(addXp(s, "learn", 10, NOW).milestones).toEqual([]);
  });

  it("tracks the best streak", () => {
    const s = withMet([-2, -1]);
    addXp(s, "learn", 10, NOW);
    expect(s.best).toBe(3);
  });
});

describe("migration", () => {
  it("keeps every old active day so nobody loses a streak to the upgrade", () => {
    const s = migrateStreak(undefined, [day(-2), day(-1)]);
    expect(streakLength(s, NOW)).toBe(2);
    expect(s.best).toBe(2);
  });

  it("fills in missing fields on a saved streak", () => {
    const s = migrateStreak({ goal: "serious", met: [day(-1)] } as Partial<StreakState>, []);
    expect(s.goal).toBe("serious");
    expect(s.reminder.hour).toBe(19);
    expect(s.freezes).toBe(0);
  });

  it("rejects an unknown goal", () => {
    expect(migrateStreak({ goal: "nope" } as unknown as Partial<StreakState>, []).goal).toBe("casual");
  });
});

describe("buying a freeze", () => {
  it("costs chips and respects the cap", async () => {
    const { buyFreeze, FREEZE_PRICE } = await import("./streak");
    const { chipsToUnits } = await import("./chips");
    const p = { chips: chipsToUnits(FREEZE_PRICE * 3), streak: freshStreak() };
    buyFreeze(p, false);
    buyFreeze(p, false);
    expect(p.streak.freezes).toBe(2);
    expect(p.chips).toBe(chipsToUnits(FREEZE_PRICE));
    expect(() => buyFreeze(p, false)).toThrow(StreakError);
    buyFreeze(p, true);
    expect(p.streak.freezes).toBe(3);
    expect(() => buyFreeze({ chips: 0, streak: freshStreak() }, false)).toThrow(/costs/);
  });
});
