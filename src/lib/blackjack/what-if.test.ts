import { describe, expect, it } from "vitest";
import type { Card } from "./cards";
import { applyAction, deal } from "./engine";
import { whatIf } from "./what-if";

// shoe order: player, dealer, player, dealer, then draws
const shoe = (...cards: Card[]): Card[] => [...cards, ...Array<Card>(40).fill("2C")];

describe("whatIf", () => {
  it("replays the hand with the right play from the same shoe", () => {
    // player 10+6 = 16 vs dealer 10 (hole 7). Next card is a 5: hitting makes 21.
    const s = shoe("TS", "TH", "6D", "7C", "5S", "9H");
    const before = deal(100, s);
    expect(before.phase).toBe("player");

    // the player stood (a mistake): dealer 17 beats 16
    const actual = applyAction(before, { type: "stand" }, s);
    expect(actual.hands[0].bet).toBe(100);
    expect(actual.payout).toBe(0);

    // the right play (hit) draws the 5 for 21, then stands by basic strategy and wins
    const alt = whatIf(before, s, "hit");
    expect(alt.phase).toBe("settled");
    expect(alt.hands[0].total).toBe(21);
    expect(alt.payout).toBe(200);
  });

  it("can show the right play losing too (it is about the long run)", () => {
    // 16 vs 10 again, but the next card is a ten: hitting busts
    const s = shoe("TS", "TH", "6D", "7C", "KS");
    const alt = whatIf(deal(100, s), s, "hit");
    expect(alt.hands[0].total).toBeGreaterThan(21);
    expect(alt.payout).toBe(0);
  });
});
