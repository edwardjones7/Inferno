import { describe, expect, it } from "vitest";
import { dueCards, schedule, type SrsCard } from "./srs";

const base = { game: "blackjack" as const, key: "soft-18-9", label: "Soft 18 vs 9", kind: "soft" };

describe("schedule", () => {
  it("ignores spots answered right on first sight", () => {
    expect(schedule(undefined, base, true, "2026-11-16")).toBeNull();
  });

  it("brings a miss back tomorrow, then widens the gap", () => {
    const a = schedule(undefined, base, false, "2026-11-16")!;
    expect(a.due).toBe("2026-11-17");
    const b = schedule(a, base, true, "2026-11-17")!;
    expect(b.due).toBe("2026-11-20");
    const c = schedule(b, base, true, "2026-11-20")!;
    expect(c.interval).toBeGreaterThan(b.interval);
  });

  it("doesn't advance when answered before it's due", () => {
    const a = schedule(undefined, base, false, "2026-11-16")!;
    expect(schedule(a, base, true, "2026-11-16")).toBe(a);
  });

  it("resets on a lapse and crosses month ends", () => {
    const a: SrsCard = { ...base, due: "2026-11-30", interval: 16, ease: 2.5, reps: 4, lapses: 1 };
    const b = schedule(a, base, false, "2026-11-30")!;
    expect(b).toMatchObject({ interval: 1, reps: 0, lapses: 2, due: "2026-12-01" });
    expect(b.ease).toBeLessThan(2.5);
  });
});

describe("dueCards", () => {
  it("returns only due cards, oldest first", () => {
    const mk = (key: string, due: string): SrsCard => ({ ...base, key, due, interval: 1, ease: 2.3, reps: 0, lapses: 1 });
    const out = dueCards({ a: mk("a", "2026-11-18"), b: mk("b", "2026-11-10"), c: mk("c", "2026-11-16") }, "2026-11-16");
    expect(out.map((c) => c.key)).toEqual(["b", "c"]);
  });
});
