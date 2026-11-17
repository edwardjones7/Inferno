import { describe, expect, it } from "vitest";
import type { Card } from "./cards";
import { gradeAction, gradeSpot } from "./coach";
import { spotLegal } from "./drill";
import { DEFAULT_RULES, deal, type Rules } from "./engine";
import { bestMove, INSURANCE_COST, moveEVs } from "./ev";
import { basicStrategy } from "./strategy";
import { TABLES } from "./tables";

const UPS: Card[] = ["2S", "3S", "4S", "5S", "6S", "7S", "8S", "9S", "TS", "AS"];
const upLabel = (c: Card) => (c[0] === "T" ? "10" : c[0]);

/** One representative two-card hand per chart cell. */
function chartHands(): { key: string; cards: [Card, Card] }[] {
  const out: { key: string; cards: [Card, Card] }[] = [];
  const hardSplits: Record<number, [Card, Card]> = {
    5: ["2H", "3D"], 6: ["2H", "4D"], 7: ["2H", "5D"], 8: ["2H", "6D"], 9: ["2H", "7D"], 10: ["2H", "8D"], 11: ["2H", "9D"],
    12: ["3H", "9D"], 13: ["3H", "TD"], 14: ["4H", "TD"], 15: ["5H", "TD"], 16: ["6H", "TD"], 17: ["7H", "TD"], 18: ["8H", "TD"], 19: ["9H", "TD"],
  };
  for (let t = 5; t <= 19; t++) out.push({ key: `hard ${t}`, cards: hardSplits[t] });
  for (let x = 2; x <= 9; x++) out.push({ key: `soft ${11 + x}`, cards: ["AH", `${x}D` as Card] });
  for (const r of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T"]) out.push({ key: `pair ${r === "T" ? "10" : r}`, cards: [`${r}H` as Card, `${r}D` as Card] });
  return out;
}

function disagreements(rules: Rules) {
  const diffs: string[] = [];
  let cells = 0;
  for (const h of chartHands()) {
    for (const up of UPS) {
      const legal = spotLegal(h.cards, up, rules);
      const evs = moveEVs(h.cards, up, rules, legal);
      const bs = basicStrategy(h.cards, up, legal, rules);
      const best = bestMove(evs)!;
      cells++;
      if (best.move !== bs) {
        const gap = best.ev - (evs[bs] ?? NaN);
        diffs.push(`${h.key} vs ${upLabel(up)}: EV says ${best.move}, chart says ${bs} (gap ${(gap * 100).toFixed(2)}%)`);
      }
    }
  }
  return { cells, diffs };
}

describe("blackjack EV model", () => {
  it("matches basic strategy on nearly every chart cell (default rules)", () => {
    const { cells, diffs } = disagreements(DEFAULT_RULES);
    if (diffs.length) console.info(`EV vs basic strategy (classic), ${diffs.length}/${cells}:\n  ${diffs.join("\n  ")}`);
    expect(cells).toBe(330);
    expect(diffs.length).toBeLessThanOrEqual(6);
    // the disagreements are all close calls (infinite deck vs 6-deck composition effects)
    for (const d of diffs) expect(Number(/gap (-?[\d.]+)%/.exec(d)![1])).toBeLessThan(1.5);
  });

  it.each(Object.values(TABLES).map((t) => [t.id, t.rules] as const))("stays close to the chart under %s rules", (_, rules) => {
    const { diffs } = disagreements(rules);
    expect(diffs.length).toBeLessThanOrEqual(8);
  });

  it("gets the textbook sanity values right", () => {
    const r = DEFAULT_RULES;
    const s20v6 = moveEVs(["TH", "QD"], "6S", r);
    expect(s20v6.stand!).toBeGreaterThan(0.6);
    expect(s20v6.split!).toBeLessThan(s20v6.stand!);

    const h16v10 = moveEVs(["TH", "6D"], "TS", r);
    expect(h16v10.stand!).toBeCloseTo(-0.54, 1);
    expect(h16v10.hit!).toBeCloseTo(-0.54, 1);
    expect(Math.abs(h16v10.hit! - h16v10.stand!)).toBeLessThan(0.01);
    expect(h16v10.surrender).toBe(-0.5);

    const h11v6 = moveEVs(["5H", "6D"], "6S", r);
    expect(bestMove(h11v6)!.move).toBe("double");
    expect(h11v6.double!).toBeGreaterThan(0.6);

    const aa = moveEVs(["AH", "AD"], "6S", r);
    expect(bestMove(aa)!.move).toBe("split");

    const h12v4 = moveEVs(["TH", "2D"], "4S", r);
    expect(Math.abs(h12v4.hit! - h12v4.stand!)).toBeLessThan(0.02);
  });

  it("multi-card hands only hit or stand", () => {
    const evs = moveEVs(["5H", "4D", "7C"], "TS");
    expect(Object.keys(evs).sort()).toEqual(["hit", "stand"]);
  });

  it("is fast enough to price the whole chart", () => {
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) disagreements(TABLES.h17.rules);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe("coach costs", () => {
  it("fills cost for mistakes only", () => {
    const legal = spotLegal(["TH", "6D"], "6S", DEFAULT_RULES);
    const right = gradeSpot(["TH", "6D"], "6S", legal, DEFAULT_RULES, "stand");
    expect(right.ok).toBe(true);
    expect(right.cost).toBeUndefined();
    const wrong = gradeSpot(["TH", "6D"], "6S", legal, DEFAULT_RULES, "hit");
    expect(wrong.ok).toBe(false);
    expect(wrong.cost!).toBeGreaterThan(0.1);
    expect(wrong.cost!).toBeLessThan(0.3);
  });

  it("never reports a negative cost", () => {
    for (const up of UPS) {
      for (const h of chartHands()) {
        const legal = spotLegal(h.cards, up, DEFAULT_RULES);
        for (const a of legal) {
          const d = gradeSpot(h.cards, up, legal, DEFAULT_RULES, a);
          if (d.cost !== undefined) expect(d.cost).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("prices insurance", () => {
    const shoe: Card[] = ["TH", "AS", "6D", "5C", ...Array<Card>(20).fill("2C")];
    const s = deal(10, shoe);
    expect(s.phase).toBe("insurance");
    expect(gradeAction(s, "insurance")!.cost).toBeCloseTo(INSURANCE_COST);
    expect(gradeAction(s, "decline")!.cost).toBeUndefined();
  });
});
