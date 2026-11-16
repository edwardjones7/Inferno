import { describe, expect, it } from "vitest";
import { dailyPuzzles } from "./daily";
import { botDecide } from "./poker/bots";
import { act, legal, newTable, startHand } from "./poker/game";
import { seeded } from "./poker/equity";
import { blindsFor, isUnlocked, MATCH, ROSTER } from "./poker/roster";
import { expected, rate } from "./rating";
import { streakOf, today } from "./store";

describe("ratings", () => {
  it("expected score is symmetric and 50% for equal ratings", () => {
    expect(expected(1200, 1200)).toBeCloseTo(0.5);
    expect(expected(1400, 1000) + expected(1000, 1400)).toBeCloseTo(1);
  });

  it("beating a stronger opponent gains more than beating a weaker one", () => {
    const up = rate(1000, 1400, 1, 50) - 1000;
    const down = rate(1000, 600, 1, 50) - 1000;
    expect(up).toBeGreaterThan(down);
    expect(rate(1000, 1000, 0, 50)).toBeLessThan(1000);
  });

  it("provisional ratings move faster", () => {
    expect(rate(800, 800, 1, 0) - 800).toBeGreaterThan(rate(800, 800, 1, 500) - 800);
  });
});

describe("streak", () => {
  const day = (offset: number) => {
    const d = new Date(2026, 10, 15);
    d.setDate(d.getDate() + offset);
    return today(d);
  };
  const now = new Date(2026, 10, 15, 12);

  it("counts consecutive days ending today", () => {
    expect(streakOf([day(-2), day(-1), day(0)], now)).toBe(3);
  });
  it("survives until midnight when today isn't played yet", () => {
    expect(streakOf([day(-3), day(-2), day(-1)], now)).toBe(3);
  });
  it("breaks on a gap", () => {
    expect(streakOf([day(-4), day(-2)], now)).toBe(0);
    expect(streakOf([], now)).toBe(0);
  });
});

describe("roster", () => {
  it("is ordered by rating with unique ids", () => {
    const ratings = ROSTER.map((b) => b.rating);
    expect([...ratings].sort((a, b) => a - b)).toEqual(ratings);
    expect(new Set(ROSTER.map((b) => b.id)).size).toBe(ROSTER.length);
  });

  it("unlocks the first three, then one at a time", () => {
    expect(isUnlocked(ROSTER[2].id, [])).toBe(true);
    expect(isUnlocked(ROSTER[3].id, [])).toBe(false);
    expect(isUnlocked(ROSTER[3].id, [ROSTER[2].id])).toBe(true);
  });

  it("raises the blinds every level", () => {
    expect(blindsFor(1)).toEqual(MATCH.levels[0]);
    expect(blindsFor(MATCH.levelEvery)).toEqual(MATCH.levels[0]);
    expect(blindsFor(MATCH.levelEvery + 1)).toEqual(MATCH.levels[1]);
    expect(blindsFor(999)).toEqual(MATCH.levels.at(-1));
  });
});

describe("bots", () => {
  it("weak bots still only take legal actions", () => {
    const rand = seeded(7);
    for (const bot of ROSTER) {
      let s = startHand(newTable({ heroName: "You", bots: [{ name: bot.name, style: bot.style, skill: bot.skill }], stack: 1000, sb: 5, bb: 10 }), rand);
      for (let guard = 0; s.street !== "done" && guard < 60; guard++) {
        const seat = s.toAct!;
        const L = legal(s);
        const a = botDecide(s, seat, rand);
        if (a.kind === "check") expect(L.canCheck).toBe(true);
        if (a.kind === "raise") {
          expect(a.to).toBeGreaterThanOrEqual(L.minRaiseTo);
          expect(a.to).toBeLessThanOrEqual(L.maxRaiseTo);
        }
        s = act(s, a);
      }
    }
  });
});

describe("daily puzzles", () => {
  it("are the same for everyone on a given day and differ between days", () => {
    const a = dailyPuzzles("2026-11-15");
    expect(dailyPuzzles("2026-11-15")).toEqual(a);
    expect(dailyPuzzles("2026-11-16")).not.toEqual(a);
    expect(a.map((p) => p.game)).toEqual(["blackjack", "poker", "poker"]);
    const bj = a[0];
    if (bj.game === "blackjack") expect(bj.legal.length).toBeGreaterThan(1);
  });
});
