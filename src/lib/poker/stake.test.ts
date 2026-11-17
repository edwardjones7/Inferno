import { describe, expect, it } from "vitest";
import { addChip, columns, COLUMN, MAX_COLUMNS, mixedChips, stackTo, sum } from "./stake";

describe("mixedChips", () => {
  it("is worth exactly the amount", () => {
    for (const a of [1, 7, 30, 155, 990, 1995, 4321]) expect(sum(mixedChips(a))).toBe(a);
  });
  it("makes change so a bet looks like a handful, not one chip", () => {
    const c = mixedChips(100);
    expect(c.length).toBeGreaterThanOrEqual(4);
    expect(new Set(c).size).toBeGreaterThan(1);
    expect(mixedChips(155).length).toBeGreaterThanOrEqual(5);
  });
  it("never goes over the cap and stacks big chips at the bottom", () => {
    const c = mixedChips(990, 7, 12);
    expect(c.length).toBeLessThanOrEqual(12);
    expect([...c].sort((a, b) => b - a)).toEqual(c);
  });
});

describe("building a stack", () => {
  it("adds chips on top without changing the ones already there", () => {
    let s = addChip([], 25, 1000);
    s = addChip(s, 5, 1000);
    s = addChip(s, 100, 1000);
    expect(s).toEqual([25, 5, 100]);
  });
  it("won't push more than you can bet", () => {
    expect(addChip([500], 1000, 990)).toEqual([500]);
  });
  it("tops up to a preset keeping what's there", () => {
    const s = stackTo([25, 5], 155);
    expect(s.slice(0, 2)).toEqual([25, 5]);
    expect(sum(s)).toBe(155);
  });
  it("takes chips off the top when a preset is smaller", () => {
    expect(stackTo([100, 25, 5], 125)).toEqual([100, 25]);
    expect(sum(stackTo([100, 25, 5], 60))).toBe(60);
  });
  it("changes up a pile too big for the felt", () => {
    let s: number[] = [];
    for (let i = 0; i < 40; i++) s = addChip(s, 1, 1000);
    expect(sum(s)).toBe(40);
    expect(s.length).toBeLessThanOrEqual(COLUMN * MAX_COLUMNS);
  });
});

describe("columns", () => {
  it("fills short columns in push order", () => {
    const c = columns([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(c).toEqual([[1, 2, 3, 4, 5, 6], [7, 8]]);
  });
});
