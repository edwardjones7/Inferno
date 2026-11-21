import { describe, expect, it } from "vitest";
import { addDays, dayKey } from "../economy";
import { chooseBackup, daysLeftInWeek, duel, friendStreak, tierName, zoneOf } from "./social-rules";

const NOW = new Date(2026, 10, 21, 12); // a Saturday
const day = (n: number) => dayKey(addDays(NOW, n));

describe("friend streak", () => {
  it("counts days both met the goal, alive until midnight", () => {
    expect(friendStreak([day(-2), day(-1)], [day(-3), day(-2), day(-1)], NOW)).toBe(2);
    expect(friendStreak([day(-1), day(0)], [day(-1), day(0)], NOW)).toBe(2);
  });
  it("breaks on a day only one of you met it", () => {
    expect(friendStreak([day(-3), day(-2), day(-1)], [day(-3), day(-1)], NOW)).toBe(1);
    expect(friendStreak([day(-1)], [], NOW)).toBe(0);
  });
});

describe("puzzle duels", () => {
  it("waits until both have answered all three", () => {
    expect(duel([true, false, true], [true], 3).verdict).toBe("waiting");
    expect(duel([], [true, true, true], 3).verdict).toBe("unplayed");
  });
  it("more solved wins; equal ties", () => {
    expect(duel([true, false, true], [true, false, false]).verdict).toBe("win");
    expect(duel([false, false, true], [true, false, true]).verdict).toBe("loss");
    expect(duel([true, true, false], [false, true, true]).verdict).toBe("tie");
  });
  it("lines up answers puzzle by puzzle", () => {
    expect(duel([true], null).rows).toEqual([
      { mine: true, theirs: null },
      { mine: null, theirs: null },
      { mine: null, theirs: null },
    ]);
  });
});

describe("leagues", () => {
  it("names tiers and clamps out-of-range ones", () => {
    expect(tierName(0)).toBe("Copper");
    expect(tierName(5)).toBe("Diamond");
    expect(tierName(9)).toBe("Diamond");
  });
  it("puts the top 7 with XP in the promotion zone, the bottom 5 of a big group in demotion", () => {
    expect(zoneOf(7, 30, 1, 50)).toBe("up");
    expect(zoneOf(8, 30, 1, 50)).toBe("stay");
    expect(zoneOf(1, 30, 1, 0)).toBe("stay");
    expect(zoneOf(26, 30, 1, 10)).toBe("down");
    expect(zoneOf(26, 30, 0, 10)).toBe("stay");
    expect(zoneOf(8, 9, 2, 10)).toBe("stay");
    expect(zoneOf(1, 30, 5, 100)).toBe("stay");
  });
  it("counts the days left in a Monday-Sunday week", () => {
    expect(daysLeftInWeek(NOW)).toBe(2);
    expect(daysLeftInWeek(new Date(2026, 10, 23))).toBe(7);
  });
});

describe("cloud backup on sign-in", () => {
  it("uploads when there's no backup and downloads onto a fresh device", () => {
    expect(chooseBackup({ activity: 40, updatedAt: 1 }, null)).toBe("upload");
    expect(chooseBackup({ activity: 0, updatedAt: 1 }, { activity: 40, updatedAt: 0 })).toBe("download");
  });
  it("asks when both copies have real progress", () => {
    expect(chooseBackup({ activity: 40, updatedAt: 1 }, { activity: 90, updatedAt: 0 })).toBe("ask");
    expect(chooseBackup({ activity: 40, updatedAt: 1 }, { activity: 2, updatedAt: 0 })).toBe("upload");
    expect(chooseBackup({ activity: 40, updatedAt: 1 }, { activity: 40, updatedAt: 0 })).toBe("same");
  });
});
