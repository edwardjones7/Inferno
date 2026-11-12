import { describe, expect, it } from "vitest";
import { buildShoe, handTotal, type Card } from "./cards";
import { applyAction, deal, IllegalAction, legalActions, toView, type ActionType, type RoundState } from "./engine";
import { fairFloats, fairShoe, sha256Hex } from "./fair";
import { basicStrategy } from "./strategy";

/** Shoe whose first cards are exactly `top` (deal order: P D P D, then draws). */
const stack = (...top: Card[]): Card[] => [...top, ...Array<Card>(40).fill("2C")];
const act = (s: RoundState, shoe: Card[], ...types: ActionType[]) =>
  types.reduce((st, type) => applyAction(st, { type }, shoe), s);

describe("handTotal", () => {
  it("counts soft and hard aces", () => {
    expect(handTotal(["AS", "6H"])).toEqual({ total: 17, soft: true });
    expect(handTotal(["AS", "6H", "TD"])).toEqual({ total: 17, soft: false });
    expect(handTotal(["AS", "AH", "9D"])).toEqual({ total: 21, soft: true });
    expect(handTotal(["KS", "QH", "2D"])).toEqual({ total: 22, soft: false });
  });
});

describe("deal", () => {
  it("pays a player blackjack 3:2 immediately", () => {
    const s = deal(100, stack("AS", "9H", "KD", "7C"));
    expect(s.phase).toBe("settled");
    expect(s.hands[0].result).toBe("blackjack");
    expect(s.payout).toBe(250);
  });

  it("dealer blackjack under a ten upcard wins without the player acting", () => {
    const s = deal(100, stack("9S", "KH", "8D", "AC"));
    expect(s.phase).toBe("settled");
    expect(s.dealerBlackjack).toBe(true);
    expect(s.payout).toBe(0);
  });

  it("blackjack vs blackjack pushes", () => {
    const s = deal(100, stack("AS", "KH", "QD", "AC"));
    expect(s.hands[0].result).toBe("push");
    expect(s.payout).toBe(100);
  });

  it("offers insurance on an ace and pays 2:1 when the dealer has it", () => {
    const shoe = stack("9S", "AH", "8D", "KC");
    const s = deal(100, shoe);
    expect(s.phase).toBe("insurance");
    expect(legalActions(s)).toEqual(["insurance", "decline"]);
    const done = applyAction(s, { type: "insurance" }, shoe);
    expect(done.phase).toBe("settled");
    expect(done.wagered).toBe(150);
    expect(done.payout).toBe(150); // main bet lost, insurance 50 returns 150
  });

  it("loses insurance when the dealer has no blackjack and play continues", () => {
    const shoe = stack("9S", "AH", "8D", "6C");
    const s = applyAction(deal(100, shoe), { type: "insurance" }, shoe);
    expect(s.phase).toBe("player");
    expect(s.insurance).toEqual({ bet: 50, payout: 0 });
  });
});

describe("player actions", () => {
  it("hit to bust loses without dealer drawing", () => {
    const shoe = stack("TS", "9H", "6D", "7C", "KH");
    const s = act(deal(100, shoe), shoe, "hit");
    expect(s.phase).toBe("settled");
    expect(s.hands[0].result).toBe("lose");
    expect(s.dealer).toHaveLength(2);
  });

  it("dealer draws to 17 and stands on soft 17", () => {
    const shoe = stack("TS", "6H", "8D", "AC", "5H");
    const s = act(deal(100, shoe), shoe, "stand");
    expect(handTotal(s.dealer)).toEqual({ total: 17, soft: true });
    expect(s.hands[0].result).toBe("win");
    expect(s.payout).toBe(200);
  });

  it("double takes exactly one card and doubles the stake", () => {
    const shoe = stack("6S", "6H", "5D", "TC", "TD", "9S");
    const s = act(deal(100, shoe), shoe, "double");
    expect(s.hands[0].cards).toHaveLength(3);
    expect(s.hands[0].bet).toBe(200);
    expect(s.wagered).toBe(200);
    expect(s.hands[0].result).toBe("win"); // 21 vs 25 bust
    expect(s.payout).toBe(400);
  });

  it("surrender returns half", () => {
    const shoe = stack("TS", "TH", "6D", "7C");
    const s = act(deal(100, shoe), shoe, "surrender");
    expect(s.hands[0].result).toBe("surrender");
    expect(s.payout).toBe(50);
  });

  it("split plays each hand and 21 after a split is not a blackjack", () => {
    // P: 8 8 vs dealer T 7. Hand1 gets 3 (11) -> double gets T (21). Hand2 gets A -> 19, stand.
    const shoe = stack("8S", "TH", "8D", "7C", "3H", "TS", "AD");
    let s = deal(100, shoe);
    expect(legalActions(s)).toContain("split");
    s = act(s, shoe, "split");
    expect(s.hands).toHaveLength(2);
    expect(s.wagered).toBe(200);
    s = act(s, shoe, "double");
    expect(s.active).toBe(1);
    expect(s.hands[1].cards).toEqual(["8D", "AD"]);
    s = act(s, shoe, "stand");
    expect(s.phase).toBe("settled");
    expect(s.hands.map((h) => h.result)).toEqual(["win", "win"]);
    expect(s.wagered).toBe(300);
    expect(s.payout).toBe(600);
  });

  it("split aces get one card each and cannot be re-split", () => {
    const shoe = stack("AS", "9H", "AD", "7C", "KH", "AH");
    const s = act(deal(100, shoe), shoe, "split");
    expect(s.phase).toBe("settled");
    expect(s.hands[0].cards).toEqual(["AS", "KH"]);
    expect(s.hands[0].result).toBe("win"); // 21 (not blackjack) vs 16 -> dealer draws 2s
    expect(s.hands[0].payout).toBe(200);
    expect(s.hands[1].cards).toEqual(["AD", "AH"]);
  });

  it("rejects illegal actions", () => {
    const shoe = stack("TS", "9H", "6D", "7C", "2H", "3H");
    const s = act(deal(100, shoe), shoe, "hit");
    expect(() => applyAction(s, { type: "double" }, shoe)).toThrow(IllegalAction);
    expect(() => applyAction(s, { type: "surrender" }, shoe)).toThrow(IllegalAction);
  });

  it("hides the hole card until settlement", () => {
    const shoe = stack("TS", "6H", "6D", "TC");
    const v = toView(deal(100, shoe));
    expect(v.dealer).toEqual(["6H", null]);
    expect(v.dealerTotal?.total).toBe(6);
    expect(JSON.stringify(v)).not.toContain("TC");
  });
});

describe("provably fair shoe", () => {
  it("is a deterministic permutation of six decks", () => {
    const a = fairShoe("server", "client", 1);
    const b = fairShoe("server", "client", 1);
    const c = fairShoe("server", "client", 2);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect([...a].sort()).toEqual(buildShoe(6).sort());
  });

  it("floats are in [0,1) and hashing is stable", () => {
    for (const f of fairFloats("s", "c", 0, 500)) expect(f >= 0 && f < 1).toBe(true);
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("house edge simulation", () => {
  it("basic strategy lands near the expected ~0.5% house edge", () => {
    // Fast seeded PRNG shoe (the engine is shoe-agnostic); fair shoe is too slow for 300k hands.
    let seed = 0x9e3779b9;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const base = buildShoe(6);
    const hands = 300_000;
    let wagered = 0;
    let returned = 0;
    for (let i = 0; i < hands; i++) {
      const shoe = [...base];
      // only the first ~40 cards can ever be dealt: partial Fisher-Yates from the top
      for (let idx = 0; idx < 40; idx++) {
        const k = idx + Math.floor(rand() * (shoe.length - idx));
        [shoe[idx], shoe[k]] = [shoe[k], shoe[idx]];
      }
      let s = deal(100, shoe);
      if (s.phase === "insurance") s = applyAction(s, { type: "decline" }, shoe);
      while (s.phase === "player") {
        const h = s.hands[s.active];
        s = applyAction(s, { type: basicStrategy(h.cards, s.dealer[0], legalActions(s)) }, shoe);
      }
      wagered += 100;
      returned += s.payout - (s.wagered - 100);
    }
    const edge = (wagered - returned) / wagered;
    expect(edge).toBeGreaterThan(-0.01);
    expect(edge).toBeLessThan(0.02);
  });
});
