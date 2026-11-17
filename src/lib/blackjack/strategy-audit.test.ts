/**
 * Strategy audit, part two: the full H17 and no-DAS charts (rules.test.ts covers S17/DAS/LS
 * cell by cell), the explanations the coach shows, the dealer-bust overlay, the true-count
 * convention, and the H17 index plays. Charts: 4–8 decks, dealer peeks, from the standard
 * published basic-strategy tables (Wizard of Odds).
 */
import { describe, expect, it } from "vitest";
import { dealerBustChance, trueCount as lessonTrueCount } from "../learn/math";
import type { Card } from "./cards";
import { gradeSpot } from "./coach";
import { countAdjustedPlay, trueCount } from "./counting";
import { DEFAULT_RULES, type ActionType, type Rules } from "./engine";
import { dealerBust } from "./odds";
import { basicStrategy, chartMove, explain, spotOf, type Move } from "./strategy";

const ALL: ActionType[] = ["hit", "stand", "double", "split", "surrender"];
const DEALER: Card[] = ["2D", "3D", "4D", "5D", "6D", "7D", "8D", "9D", "TD", "AD"];
const LETTER: Record<string, Move> = { H: "hit", S: "stand", D: "double", R: "surrender", P: "split" };
const H17: Rules = { ...DEFAULT_RULES, dealerHitsSoft17: true };
const NO_DAS: Rules = { ...DEFAULT_RULES, doubleAfterSplit: false };

/** Two different non-pair cards for a hard total. */
function hard(total: number): Card[] {
  for (let a = 10; a >= 2; a--) {
    const b = total - a;
    if (b >= 2 && b <= 10 && a !== b) return [`${a === 10 ? "T" : a}S` as Card, `${b === 10 ? "T" : b}H` as Card];
  }
  throw new Error(`no hard ${total}`);
}
const soft = (total: number): Card[] => ["AS", `${total - 11}H` as Card];
const pair = (v: string): Card[] => [`${v}S` as Card, `${v}H` as Card];

function checkRow(cards: Card[], row: string, rules: Rules, label: string) {
  const want = row.split(" ");
  DEALER.forEach((up, i) => {
    expect(basicStrategy(cards, up, ALL, rules), `${label} vs ${up[0]}`).toBe(LETTER[want[i]]);
  });
}

describe("H17, DAS, late surrender: every cell", () => {
  //                 2 3 4 5 6 7 8 9 T A
  const HARD: [number, string][] = [
    [8, "H H H H H H H H H H"],
    [9, "H D D D D H H H H H"],
    [10, "D D D D D D D D H H"],
    [11, "D D D D D D D D D D"],
    [12, "H H S S S H H H H H"],
    [13, "S S S S S H H H H H"],
    [14, "S S S S S H H H H H"],
    [15, "S S S S S H H H R R"],
    [16, "S S S S S H H R R R"],
    [17, "S S S S S S S S S R"],
    [18, "S S S S S S S S S S"],
  ];
  const SOFT: [number, string][] = [
    [13, "H H H D D H H H H H"],
    [14, "H H H D D H H H H H"],
    [15, "H H D D D H H H H H"],
    [16, "H H D D D H H H H H"],
    [17, "H D D D D H H H H H"],
    [18, "D D D D D S S H H H"],
    [19, "S S S S D S S S S S"],
    [20, "S S S S S S S S S S"],
  ];
  const PAIRS: [string, string][] = [
    ["A", "P P P P P P P P P P"],
    ["T", "S S S S S S S S S S"],
    ["9", "P P P P P S P P S S"],
    ["8", "P P P P P P P P P R"],
    ["7", "P P P P P P H H H H"],
    ["6", "P P P P P H H H H H"],
    ["5", "D D D D D D D D H H"],
    ["4", "H H H P P H H H H H"],
    ["3", "P P P P P P H H H H"],
    ["2", "P P P P P P H H H H"],
  ];
  it.each(HARD)("hard %i", (t, row) => checkRow(hard(t), row, H17, `hard ${t}`));
  it.each(SOFT)("soft %i", (t, row) => checkRow(soft(t), row, H17, `soft ${t}`));
  it.each(PAIRS)("pair %s", (v, row) => checkRow(pair(v), row, H17, `${v},${v}`));
});

describe("S17, no double after split: the pair rows that change", () => {
  //                 2 3 4 5 6 7 8 9 T A
  const PAIRS: [string, string][] = [
    ["6", "H P P P P H H H H H"],
    ["4", "H H H H H H H H H H"],
    ["3", "H H P P P P H H H H"],
    ["2", "H H P P P P H H H H"],
  ];
  it.each(PAIRS)("pair %s", (v, row) => checkRow(pair(v), row, NO_DAS, `${v},${v}`));
});

describe("dealer bust overlay", () => {
  it("is conditional on no dealer blackjack, matching the lesson numbers", () => {
    expect(dealerBust("AS", false)).toBeCloseTo(0.167, 2);
    expect(dealerBust("AS", true)).toBeCloseTo(0.201, 2);
    expect(dealerBust("KS", false)).toBeCloseTo(0.23, 2);
    expect(dealerBust("6S", false)).toBeCloseTo(dealerBustChance(6), 6);
  });

  it("H17 busts more with every small card", () => {
    for (const up of ["2S", "3S", "4S", "5S", "6S"] as Card[]) expect(dealerBust(up, true)).toBeGreaterThan(dealerBust(up, false));
  });
});

describe("true count convention", () => {
  it("lessons and the count trainer both floor", () => {
    for (const [rc, decks] of [[-3, 2], [-7, 2], [5, 2], [9, 3], [-1, 4]] as const) expect(lessonTrueCount(rc, decks)).toBe(trueCount(rc, decks));
    expect(trueCount(-3, 2)).toBe(-2);
  });
});

describe("coach explanations", () => {
  const why = (cards: Card[], up: Card, legal: ActionType[], action: ActionType, rules = DEFAULT_RULES) => gradeSpot(cards, up, legal, rules, action);

  it("a three-card 11 says doubling isn't allowed, not that 11 is too weak", () => {
    const d = why(["5S", "2H", "4D"], "6C", ["hit", "stand"], "stand");
    expect(d.correct).toBe("hit");
    expect(d.why).toMatch(/isn't allowed/);
    expect(d.why).not.toMatch(/strong enough/);
  });

  it("8,8 at the split limit says splitting isn't allowed", () => {
    const d = why(["8S", "8H"], "TC", ["hit", "stand"], "stand");
    expect(d.correct).toBe("hit");
    expect(d.why).toMatch(/Split is the chart play/);
  });

  it("not splitting against a weak card doesn't call it a strong dealer card", () => {
    const d = why(["4S", "4H"], "3C", ALL, "split");
    expect(d.why).not.toMatch(/strong dealer/);
    expect(d.why).toMatch(/hard 8/);
    const nine = why(["9S", "9H"], "7C", ALL, "split");
    expect(nine.why).toMatch(/17/);
  });

  it("uses the right article", () => {
    expect(explain(spotOf(["5S", "4H"], "8C"), "hit")).toMatch(/against an 8/);
    expect(explain(spotOf(["6S", "4H"], "AC"), "hit")).toMatch(/against an ace/);
  });

  it("chartMove reads the chart cell regardless of the hand's card count", () => {
    expect(chartMove(spotOf(["5S", "2H", "4D"], "6C"))).toBe("double");
    expect(chartMove(spotOf(["TS", "6H"], "TC"))).toBe("surrender");
    expect(chartMove(spotOf(["TS", "6H"], "TC"), { ...DEFAULT_RULES, surrender: false })).toBe("hit");
  });

  it("never reports a free mistake when the EV model disagrees with the chart", () => {
    const d = why(["AS", "2H"], "5C", ALL, "hit");
    expect(d.ok).toBe(false);
    expect(d.cost === undefined || d.cost > 0).toBe(true);
  });
});

describe("index plays under H17", () => {
  const legal: ActionType[] = ["hit", "stand", "double", "surrender"];
  it("11 vs A: S17 doubles from +1, H17 from −1 and hits below", () => {
    expect(countAdjustedPlay(["6S", "5H"], "AC", legal, DEFAULT_RULES, 0)).toBe("hit");
    expect(countAdjustedPlay(["6S", "5H"], "AC", legal, DEFAULT_RULES, 1)).toBe("double");
    expect(countAdjustedPlay(["6S", "5H"], "AC", legal, H17, -1)).toBe("double");
    expect(countAdjustedPlay(["6S", "5H"], "AC", legal, H17, -2)).toBe("hit");
  });

  it("10 vs A: H17 doubles from +3, S17 from +4", () => {
    expect(countAdjustedPlay(["6S", "4H"], "AC", legal, H17, 3)).toBe("double");
    expect(countAdjustedPlay(["6S", "4H"], "AC", legal, DEFAULT_RULES, 3)).toBe("hit");
  });

  it("15 vs A with surrender: H17 surrenders from −1 and hits below", () => {
    expect(countAdjustedPlay(["TS", "5H"], "AC", legal, H17, -1)).toBe("surrender");
    expect(countAdjustedPlay(["TS", "5H"], "AC", legal, H17, -2)).toBe("hit");
    expect(countAdjustedPlay(["TS", "5H"], "AC", legal, DEFAULT_RULES, 0)).toBe("hit");
    expect(countAdjustedPlay(["TS", "5H"], "AC", legal, DEFAULT_RULES, 1)).toBe("surrender");
  });
});
