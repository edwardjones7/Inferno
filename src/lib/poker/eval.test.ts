import { describe as group, expect, it } from "vitest";
import type { Card } from "../blackjack/cards";
import { equity, outs, seeded } from "./equity";
import { categoryOf, DECK, describe, evaluate } from "./eval";
import { genEquity, genPotOdds, genShowdown, gradeEquity, gradePotOdds, gradePreflop, gradeShowdown, validSpot } from "./drills";
import { GRID, handCode, OPEN_RANGES, parseRange, POSITIONS, rangePercent } from "./ranges";

const h = (s: string) => s.split(" ") as Card[];

/** Brute force: best of every 5-card subset, scored by a separate naive ranking. */
function naive5(cards: Card[]): number[] {
  const vals = cards.map((c) => "23456789TJQKA".indexOf(c[0]) + 2).sort((a, b) => b - a);
  const suits = cards.map((c) => c[1]);
  const flush = suits.every((s) => s === suits[0]);
  const uniq = [...new Set(vals)];
  let straightHi = 0;
  if (uniq.length === 5) {
    if (vals[0] - vals[4] === 4) straightHi = vals[0];
    else if (vals.join() === "14,5,4,3,2") straightHi = 5;
  }
  const groups = uniq.map((v) => [vals.filter((x) => x === v).length, v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const shape = groups.map((g) => g[0]).join("");
  const order = groups.map((g) => g[1]);
  if (straightHi && flush) return [8, straightHi];
  if (shape === "41") return [7, ...order];
  if (shape === "32") return [6, ...order];
  if (flush) return [5, ...vals];
  if (straightHi) return [4, straightHi];
  if (shape === "311") return [3, ...order];
  if (shape === "221") return [2, ...order];
  if (shape === "2111") return [1, ...order];
  return [0, ...vals];
}
const cmp = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
};
function naiveBest(cards: Card[]): number[] {
  let best: number[] = [-1];
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const s = naive5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (cmp(s, best) > 0) best = s;
          }
  return best;
}

group("hand evaluator", () => {
  it("names categories correctly", () => {
    expect(describe(h("AS KS QS JS TS 2D 3C")).name).toBe("Royal flush");
    expect(describe(h("5S 4S 3S 2S AS KD KC")).name).toBe("Straight flush, five high");
    expect(describe(h("9C 9D 9H 9S 2D 3C 4H")).name).toBe("Four of a kind, nines");
    expect(describe(h("KC KD KH 7S 7D 3C 2H")).name).toBe("Full house, kings full of sevens");
    expect(describe(h("AH 9H 7H 4H 2H KD KC")).name).toBe("Flush, ace high");
    expect(describe(h("5D 4C 3H 2S AD KC QH")).name).toBe("Straight, five high");
    expect(describe(h("QC QD QH 9S 5D 3C 2H")).name).toBe("Three of a kind, queens");
    expect(describe(h("KC KD 7H 7S 5D 3C 2H")).name).toBe("Two pair, kings and sevens");
    expect(describe(h("JC JD 9H 7S 5D 3C 2H")).name).toBe("Pair of jacks");
    expect(describe(h("AC JD 9H 7S 5D 3C 2H")).name).toBe("High card, ace");
  });

  it("handles kickers and tricky full houses", () => {
    expect(evaluate(h("AS AD KC 9H 7S 3D 2C"))).toBeGreaterThan(evaluate(h("AH AC QC 9D 7H 3C 2D")));
    expect(evaluate(h("8S 8D 8C 5H 5S 5D 2C"))).toBe(evaluate(h("8S 8D 8C 5H 5S 2D 2C"))); // 888-55 either way
    expect(evaluate(h("KS KD 9C 9H 4S 4D AC"))).toBeGreaterThan(evaluate(h("KS KD 9C 9H 4S 4D QC"))); // third pair can't play, kicker can
    expect(categoryOf(evaluate(h("6S 7S 8S 9S TS JS QS")))).toBe(8);
  });

  it("agrees with brute force on 4,000 random 7-card hands", () => {
    const rand = seeded(42);
    for (let i = 0; i < 4000; i++) {
      const deck = [...DECK];
      for (let k = 0; k < 14; k++) {
        const j = k + Math.floor(rand() * (deck.length - k));
        [deck[k], deck[j]] = [deck[j], deck[k]];
      }
      const a = deck.slice(0, 7);
      const b = deck.slice(7, 14);
      const fast = Math.sign(evaluate(a) - evaluate(b));
      const slow = Math.sign(cmp(naiveBest(a), naiveBest(b)));
      expect([a.join(" "), b.join(" "), fast]).toEqual([a.join(" "), b.join(" "), slow]);
    }
  });
});

group("equity", () => {
  it("known pre-flop matchups (Monte Carlo, within 1.5%)", () => {
    expect(equity(h("AS AH"), h("KS KH")).equity).toBeCloseTo(0.82, 1);
    expect(Math.abs(equity(h("AS KS"), h("QH QD")).equity - 0.46)).toBeLessThan(0.015);
    expect(Math.abs(equity(h("7S 2D"), h("AC KH")).equity - 0.32)).toBeLessThan(0.02);
  });

  it("exact on the flop and turn, and counts outs", () => {
    // nut flush draw + ace overcard vs top pair: 9 hearts + 3 aces = 12 outs, ~46% to the river
    const hero = h("AH 5H");
    const villain = h("KS QD");
    const flop = h("KH 9H 2C");
    const e = equity(hero, villain, flop);
    expect(e.exact).toBe(true);
    expect(e.samples).toBe(990);
    expect(e.equity).toBeGreaterThan(0.42);
    expect(e.equity).toBeLessThan(0.5);
    const o = outs(hero, villain, flop);
    expect(o.filter((c) => c[1] === "H")).toHaveLength(9);
    expect(o).toHaveLength(12);
    expect(equity(hero, villain, [...flop, "3D"]).samples).toBe(44);
  });
});

group("opening ranges", () => {
  it("parses notation and has sensible widths that widen by position", () => {
    expect([...parseRange("TT+")].sort()).toEqual(["AA", "JJ", "KK", "QQ", "TT"]);
    expect([...parseRange("KTs+")].sort()).toEqual(["KJs", "KQs", "KTs"]);
    expect([...parseRange("A9o+")]).toHaveLength(5);
    const pct = POSITIONS.map((p) => rangePercent(OPEN_RANGES[p]));
    expect(pct[0]).toBeGreaterThan(14);
    expect(pct[0]).toBeLessThan(20);
    expect(pct[3]).toBeGreaterThan(40);
    expect(pct[3]).toBeLessThan(50);
    for (const [early, late] of [["UTG", "HJ"], ["HJ", "CO"], ["CO", "BTN"]] as const) {
      for (const c of OPEN_RANGES[early]) expect([early, late, c, OPEN_RANGES[late].has(c)]).toEqual([early, late, c, true]);
    }
  });
  it("hand codes and grid", () => {
    expect(handCode("KS", "AS")).toBe("AKs");
    expect(handCode("9D", "TC")).toBe("T9o");
    expect(handCode("7H", "7D")).toBe("77");
    expect(GRID.flat()).toHaveLength(169);
    expect(new Set(GRID.flat()).size).toBe(169);
    expect(GRID[0][1]).toBe("AKs");
    expect(GRID[1][0]).toBe("AKo");
  });
});

group("poker drills", () => {
  const rand = seeded(9);
  it("pre-flop grading follows the chart", () => {
    expect(gradePreflop({ kind: "preflop", pos: "UTG", cards: ["AS", "KD"] }, "raise").ok).toBe(true);
    expect(gradePreflop({ kind: "preflop", pos: "UTG", cards: ["7S", "2D"] }, "fold").ok).toBe(true);
    expect(gradePreflop({ kind: "preflop", pos: "BTN", cards: ["KS", "4S"] }, "raise").ok).toBe(true);
    expect(gradePreflop({ kind: "preflop", pos: "UTG", cards: ["KS", "4S"] }, "raise").correct).toBe("fold");
  });
  it("pot-odds spots are clear-cut and graded by exact equity vs price", () => {
    for (let i = 0; i < 15; i++) {
      const s = genPotOdds(rand);
      const g = gradePotOdds(s, "call");
      const e = Number(g.detail!.equity) / 100;
      const need = s.bet / (s.pot + 2 * s.bet);
      expect(Math.abs(e - need)).toBeGreaterThan(0.035);
      expect(g.correct).toBe(e >= need ? "call" : "fold");
    }
    const textbook = gradePotOdds({ kind: "potodds", hero: ["AH", "5H"], villain: ["KS", "QD"], board: ["KH", "9H", "2C"], pot: 100, bet: 50 }, "call");
    expect(textbook.ok).toBe(true); // 46% equity vs 25% needed
  });
  it("showdowns name the right winner, including splits", () => {
    const split = gradeShowdown({ kind: "showdown", board: ["AS", "KS", "QS", "JS", "TS"], hands: [["2C", "3D"], ["4C", "5D"], ["6C", "7D"]] }, "split");
    expect(split.ok).toBe(true);
    const kicker = gradeShowdown({ kind: "showdown", board: ["AS", "8D", "6C", "3H", "2S"], hands: [["AD", "KC"], ["AC", "QD"], ["7D", "7C"]] }, "0");
    expect(kicker.ok).toBe(true);
    for (let i = 0; i < 30; i++) expect(validSpot(genShowdown(rand))).toBe(true);
  });
  it("equity buckets and validation", () => {
    expect(gradeEquity({ kind: "equity", hero: ["AS", "AH"], villain: ["KD", "KC"] }, "gt65").ok).toBe(true);
    expect(gradeEquity({ kind: "equity", hero: ["KD", "KC"], villain: ["AS", "AH"] }, "lt35").ok).toBe(true);
    expect(validSpot({ kind: "equity", hero: ["AS", "AS"], villain: ["KD", "KC"] })).toBe(false);
    expect(validSpot({ kind: "preflop", pos: "MP", cards: ["AS", "KD"] })).toBe(false);
    for (let i = 0; i < 10; i++) expect(validSpot(genEquity(rand))).toBe(true);
  });
});
