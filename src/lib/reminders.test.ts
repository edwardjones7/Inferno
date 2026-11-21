import { describe, expect, it } from "vitest";
import { addDays, dayKey } from "./economy";
import { planReminders } from "./reminders";
import { freshStreak } from "./streak";

const NOW = new Date(2026, 10, 21, 15, 0);
const day = (n: number) => dayKey(addDays(NOW, n));

describe("streak reminders", () => {
  it("schedules today at the chosen hour while the goal is open, warning about the streak", () => {
    const s = { ...freshStreak(), met: [day(-2), day(-1)] };
    const plan = planReminders(s, NOW);
    expect(plan[0].at.getDate()).toBe(21);
    expect(plan[0].at.getHours()).toBe(19);
    expect(plan[0].title).toBe("Your 2-day streak ends at midnight");
    expect(plan).toHaveLength(7);
  });

  it("skips today once the goal is met, and tomorrow protects the streak", () => {
    const s = { ...freshStreak(), met: [day(-1), day(0)] };
    const plan = planReminders(s, NOW);
    expect(plan[0].at.getDate()).toBe(22);
    expect(plan[0].title).toContain("2-day streak");
    expect(plan).toHaveLength(6);
  });

  it("skips today once the hour has passed", () => {
    const late = new Date(2026, 10, 21, 20, 0);
    expect(planReminders(freshStreak(), late)[0].at.getDate()).toBe(22);
  });

  it("schedules nothing when turned off", () => {
    expect(planReminders({ ...freshStreak(), reminder: { on: false, hour: 19 } }, NOW)).toEqual([]);
  });
});
