/**
 * Rules audit: edge cases of the table rules, and the strategy hint checked cell-by-cell
 * against the standard 4–8 deck chart for dealer-stands-soft-17, double after split,
 * late surrender.
 */
import { describe, expect, it } from "vitest";
import type { Card } from "./cards";
import { applyAction, deal, DEFAULT_RULES, legalActions, type ActionType, type RoundState } from "./engine";
import { generateSpot, spotFromKey, spotLegal } from "./drill";
import { basicStrategy, spotOf, type Move } from "./strategy";

const stack = (...top: Card[]): Card[] => [...top, ...Array<Card>(40).fill("2C")];
const act = (s: RoundState, shoe: Card[], ...types: ActionType[]) => types.reduce((st, type) => applyAction(st, { type }, shoe), s);

describe("insurance and even money", () => {
  it("player blackjack vs ace, decline, dealer has no blackjack: paid 3:2", () => {
    const shoe = stack("AS", "AH", "KD", "7C");
    const s = deal(100, shoe);
    expect(s.phase).toBe("insurance");
    const done = act(s, shoe, "decline");
    expect(done.hands[0].result).toBe("blackjack");
    expect(done.payout).toBe(250);
  });

  it("player blackjack vs ace, insured, dealer blackjack: main pushes and insurance pays 2:1", () => {
    const shoe = stack("AS", "AH", "KD", "QC");
    const done = act(deal(100, shoe), shoe, "insurance");
    expect(done.hands[0].result).toBe("push");
    expect(done.wagered).toBe(150);
    expect(done.payout).toBe(100 + 150); // stake back + 50 insurance at 2:1 (+ its stake)
  });

  it("uninsured hand vs dealer ace-blackjack loses only the main bet", () => {
    const shoe = stack("9S", "AH", "8D", "KC");
    const done = act(deal(100, shoe), shoe, "decline");
    expect(done.dealerBlackjack).toBe(true);
    expect(done.wagered).toBe(100);
    expect(done.payout).toBe(0);
  });

  it("insurance is only offered on an ace", () => {
    const s = deal(100, stack("9S", "KH", "8D", "7C"));
    expect(s.phase).toBe("player");
    expect(legalActions(s)).not.toContain("insurance");
  });
});

describe("dealer play", () => {
  const dealerFinal = (dealerCards: Card[], draws: Card[]) => {
    // player stands on 20 so the dealer always plays
    const shoe = stack("TS", dealerCards[0], "QS", dealerCards[1], ...draws);
    let s = deal(100, shoe);
    if (s.phase === "insurance") s = act(s, shoe, "decline");
    return act(s, shoe, "stand").dealer;
  };

  it("stands on soft 17 (A+6) and on multi-card soft 17 (A+2+4)", () => {
    expect(dealerFinal(["6H", "AC"], [])).toEqual(["6H", "AC"]);
    expect(dealerFinal(["2H", "AC"], ["4D", "9S"])).toEqual(["2H", "AC", "4D"]);
  });

  it("hits 16 and stands on hard 17", () => {
    expect(dealerFinal(["TH", "6C"], ["AD", "5S"])).toEqual(["TH", "6C", "AD"]);
  });

  it("does not draw when every player hand has busted", () => {
    // split 8s vs 6: each hand gets a ten, hits, busts -> dealer keeps two cards
    const shoe = stack("8S", "6H", "8D", "TC", "TS", "KD", "TH", "QD");
    const s = act(deal(100, shoe), shoe, "split", "hit", "hit");
    expect(s.phase).toBe("settled");
    expect(s.hands.map((h) => h.result)).toEqual(["lose", "lose"]);
    expect(s.dealer).toHaveLength(2);
  });
});

describe("split, double, surrender limits", () => {
  it("re-splits up to four hands, then no more", () => {
    const shoe = stack("8S", "9H", "8D", "7C", "8H", "8C", "8S", "2D", "3D", "4D", "TD", "TD", "TD", "TD");
    let s = act(deal(100, shoe), shoe, "split"); // hand0 gets 8H -> pair again
    expect(legalActions(s)).toContain("split");
    s = act(s, shoe, "split"); // hand0 gets 8C
    s = act(s, shoe, "split"); // 4 hands now
    expect(s.hands).toHaveLength(4);
    expect(legalActions(s)).not.toContain("split");
    expect(s.wagered).toBe(400);
  });

  it("allows double after split on non-aces", () => {
    const shoe = stack("8S", "9H", "8D", "7C", "3H", "TS", "AD");
    const s = act(deal(100, shoe), shoe, "split");
    expect(legalActions(s)).toContain("double");
  });

  it("surrender only on the opening two cards, never after a hit or split", () => {
    const shoe = stack("TS", "9H", "6D", "7C", "2H", "8S", "8D");
    const s = deal(100, shoe);
    expect(legalActions(s)).toContain("surrender");
    expect(legalActions(act(s, shoe, "hit"))).not.toContain("surrender");
    const pair = stack("8S", "9H", "8D", "7C", "3H", "4H");
    expect(legalActions(act(deal(100, pair), pair, "split"))).not.toContain("surrender");
  });

  it("no doubling on three cards", () => {
    const shoe = stack("5S", "9H", "4D", "7C", "2H");
    expect(legalActions(act(deal(100, shoe), shoe, "hit"))).not.toContain("double");
  });
});

/* ------------------------------------------------------------------ strategy chart */

const UP = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const upCard = (v: number): Card => (v === 11 ? "AC" : v === 10 ? "KC" : (`${v}C` as Card));
const ALL: ActionType[] = ["hit", "stand", "double", "split", "surrender"];
const code: Record<string, Move> = { H: "hit", S: "stand", D: "double", P: "split", R: "surrender" };

// Rows list the correct play vs dealer 2,3,4,5,6,7,8,9,T,A (S17, DAS, late surrender).
const HARD: Record<number, string> = {
  5: "HHHHHHHHHH",
  6: "HHHHHHHHHH",
  7: "HHHHHHHHHH",
  8: "HHHHHHHHHH",
  9: "HDDDDHHHHH",
  10: "DDDDDDDDHH",
  11: "DDDDDDDDDH",
  12: "HHSSSHHHHH",
  13: "SSSSSHHHHH",
  14: "SSSSSHHHHH",
  15: "SSSSSHHHRH",
  16: "SSSSSHHRRR",
  17: "SSSSSSSSSS",
};
const SOFT: Record<number, string> = {
  13: "HHHDDHHHHH",
  14: "HHHDDHHHHH",
  15: "HHDDDHHHHH",
  16: "HHDDDHHHHH",
  17: "HDDDDHHHHH",
  18: "SDDDDSSHHH",
  19: "SSSSSSSSSS",
  20: "SSSSSSSSSS",
};
const PAIRS: Record<string, string> = {
  A: "PPPPPPPPPP",
  T: "SSSSSSSSSS",
  "9": "PPPPPSPPSS",
  "8": "PPPPPPPPPP",
  "7": "PPPPPPHHHH",
  "6": "PPPPPHHHHH",
  "5": "DDDDDDDDHH",
  "4": "HHHPPHHHHH",
  "3": "PPPPPPHHHH",
  "2": "PPPPPPHHHH",
};

// Two-card hard totals without pairs or aces.
const hardHand = (t: number): Card[] => {
  for (let a = 2; a <= 10; a++) {
    const b = t - a;
    if (b >= 2 && b <= 10 && a !== b) return [(a === 10 ? "TS" : `${a}S`) as Card, (b === 10 ? "TH" : `${b}H`) as Card];
  }
  throw new Error(`no hard hand for ${t}`);
};

describe("basic strategy hint matches the S17 / DAS / LS chart", () => {
  it.each(Object.entries(HARD))("hard %s", (t, row) => {
    UP.forEach((u, i) => expect([t, u, basicStrategy(hardHand(+t), upCard(u), ALL)]).toEqual([t, u, code[row[i]]]));
  });
  it.each(Object.entries(SOFT))("soft %s", (t, row) => {
    const other = +t - 11;
    const hand: Card[] = ["AS", (other === 10 ? "TH" : `${other}H`) as Card];
    UP.forEach((u, i) => expect([t, u, basicStrategy(hand, upCard(u), ALL)]).toEqual([t, u, code[row[i]]]));
  });
  it.each(Object.entries(PAIRS))("pair %s", (r, row) => {
    const hand: Card[] = [`${r}S` as Card, `${r}H` as Card];
    UP.forEach((u, i) => expect([r, u, basicStrategy(hand, upCard(u), ALL)]).toEqual([r, u, code[row[i]]]));
  });
  it("falls back sensibly when the best move isn't allowed", () => {
    expect(basicStrategy(["TS", "6H"], "TC", ["hit", "stand"])).toBe("hit"); // no surrender -> hit
    expect(basicStrategy(["AS", "7H"], "4C", ["hit", "stand"])).toBe("stand"); // Ds -> stand
    expect(basicStrategy(["6S", "5H", "TD"].slice(0, 2) as Card[], "AC", ["hit", "stand"])).toBe("hit");
  });
});

describe("strategy adapts to table rules", () => {
  const H17 = { ...DEFAULT_RULES, dealerHitsSoft17: true };
  const NODAS = { ...DEFAULT_RULES, doubleAfterSplit: false };
  const NOLS = { ...DEFAULT_RULES, surrender: false };
  const bs = (cards: Card[], up: Card, rules = DEFAULT_RULES) => basicStrategy(cards, up, ALL, rules);

  it("H17 changes: 11 vs A doubles, A7 vs 2 and A8 vs 6 double, more surrenders", () => {
    expect(bs(["6S", "5H"], "AC")).toBe("hit");
    expect(bs(["6S", "5H"], "AC", H17)).toBe("double");
    expect(bs(["AS", "7H"], "2C", H17)).toBe("double");
    expect(bs(["AS", "8H"], "6C", H17)).toBe("double");
    expect(bs(["TS", "5H"], "AC", H17)).toBe("surrender");
    expect(bs(["TS", "7H"], "AC", H17)).toBe("surrender");
    expect(bs(["8S", "8H"], "AC", H17)).toBe("surrender");
    expect(bs(["8S", "8H"], "AC")).toBe("split");
  });

  it("no double-after-split splits small pairs less", () => {
    expect(bs(["2S", "2H"], "2C", NODAS)).toBe("hit");
    expect(bs(["2S", "2H"], "4C", NODAS)).toBe("split");
    expect(bs(["4S", "4H"], "5C", NODAS)).toBe("hit");
    expect(bs(["6S", "6H"], "2C", NODAS)).toBe("hit");
    expect(bs(["6S", "6H"], "3C", NODAS)).toBe("split");
  });

  it("without surrender, falls back to the playing decision", () => {
    expect(basicStrategy(["TS", "6H"], "TC", ["hit", "stand", "double"], NOLS)).toBe("hit");
  });
});

describe("drill spots", () => {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  it("generates valid spots for every category and never a blackjack", () => {
    for (const cat of ["all", "hard", "soft", "pair", "surrender", "leaks"] as const) {
      for (let i = 0; i < 300; i++) {
        const s = generateSpot(cat, rand, ["soft-18-9", "pair-9-7"]);
        const legal = spotLegal(s.cards, s.up, DEFAULT_RULES);
        expect(legal.length).toBeGreaterThan(1);
        const spot = spotOf(s.cards, s.up);
        if (cat === "hard") expect(spot.kind).toBe("hard");
        if (cat === "soft") expect(spot.kind).toBe("soft");
        if (cat === "pair") expect(spot.kind).toBe("pair");
        if (cat === "leaks") expect(["soft-18-9", "pair-9-7"]).toContain(spot.key);
      }
    }
  });
  it("rebuilds a spot from its key", () => {
    for (const key of ["hard-16-10", "soft-18-2", "pair-8-11", "pair-10-6", "hard-5-11"]) {
      const s = spotFromKey(key, rand)!;
      expect(spotOf(s.cards, s.up).key).toBe(key);
    }
  });
});
