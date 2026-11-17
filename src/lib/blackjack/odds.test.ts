import { describe, expect, it } from "vitest";
import { bustIfHit, dealerBust } from "./odds";

describe("bustIfHit", () => {
  it("is zero when no card can bust the hand", () => {
    expect(bustIfHit(["5S", "6H"])).toBe(0);
    expect(bustIfHit(["AS", "6H"])).toBe(0); // soft 17
  });
  it("matches the ranks that bust", () => {
    expect(bustIfHit(["TS", "2H"])).toBeCloseTo(4 / 13); // 12: only tens
    expect(bustIfHit(["TS", "6H"])).toBeCloseTo(8 / 13); // 16: 6..9 and tens
    expect(bustIfHit(["TS", "TH"])).toBeCloseTo(12 / 13); // 20: everything but an ace
  });
  it("is certain at 21", () => {
    expect(bustIfHit(["TS", "5H", "6C"])).toBe(1);
  });
});

describe("dealerBust", () => {
  it("peaks against 5 and 6 and is lowest against an ace", () => {
    expect(dealerBust("6H", false)).toBeGreaterThan(dealerBust("TH", false));
    expect(dealerBust("AH", false)).toBeLessThan(dealerBust("7H", false));
  });
  it("treats face cards as tens", () => {
    expect(dealerBust("KD", false)).toBe(dealerBust("TD", false));
  });
  it("busts more often when the dealer hits soft 17", () => {
    expect(dealerBust("6S", true)).toBeGreaterThan(dealerBust("6S", false));
  });
});
