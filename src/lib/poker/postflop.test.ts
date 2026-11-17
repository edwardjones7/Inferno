import { describe as group, expect, it } from "vitest";
import type { Card } from "../blackjack/cards";
import { BOT_ROSTER } from "./bots";
import {
  answersFor,
  answersForSpot,
  genCbet,
  genHandRead,
  genPoker,
  genPokerForKey,
  genPotOdds,
  genSizing,
  genTexture,
  gradeCbet,
  gradeHandRead,
  gradePoker,
  gradePotOdds,
  gradeSizing,
  gradeTexture,
  POKER_DRILLS,
  validSpot,
  type PokerDrill,
} from "./drills";
import { seeded } from "./equity";
import { act, newTable, rigDeck, startHand } from "./game";
import type { PokerState } from "./game-types";
import { BB_DEFEND, betEV, combosOfCode, flopInfo, handClass, parseRangeWithDashes, readRange, sizingAnswer } from "./postflop";
import { handCode, parseRange } from "./ranges";
import { coachHero } from "./table-coach";

const h = (s: string) => s.split(" ") as Card[];
const h2 = (s: string) => h(s) as [Card, Card];
const h3 = (s: string) => h(s) as [Card, Card, Card];
const NEW: PokerDrill[] = ["texture", "handread", "sizing", "cbet"];

group("board texture", () => {
  it.each([
    ["KS 7D 2C", "dry", "raiser"],
    ["KH KD 5C", "paired", "raiser"],
    ["AH 8H 3H", "monotone", "neutral"],
    ["8H 7H 6C", "wet", "caller"],
    ["9S 8D 6C", "semiwet", "caller"],
    ["AS 5D 4C", "semiwet", "neutral"], // wheel straight is possible
    ["QH 7H 2C", "semiwet", "neutral"],
  ])("%s is %s and favours the %s", (b, texture, favors) => {
    const i = flopInfo(h(b));
    expect(i.texture).toBe(texture);
    expect(i.favors).toBe(favors);
  });
});

group("hand class", () => {
  it.each([
    ["AS AD", "KS 7D 2C", "overpair"],
    ["KH QH", "KS 7D 2C", "toppair"],
    ["7H 7C", "KS 9D 2C", "medium"],
    ["7H 2H", "KS 7D 2C", "strong"],
    ["5H 5C", "KS KD 2C", "medium"],
    ["KH 3C", "KS KD 2C", "strong"],
    ["QH JH", "TH 9C 2H", "draw"],
    ["AH QC", "8S 7D 2C", "air"],
  ])("%s on %s is %s", (hole, board, cls) => {
    expect(handClass(h(hole), h(board))).toBe(cls);
  });
});

group("ranges and combos", () => {
  it("parses closed intervals", () => {
    expect(parseRangeWithDashes("22-JJ").size).toBe(10);
    expect([...parseRangeWithDashes("A2s-AQs")]).toContain("A2s");
    expect(parseRangeWithDashes("A2s-AQs").has("AKs")).toBe(false);
    expect(BB_DEFEND.has("QQ")).toBe(false);
    expect(BB_DEFEND.has("JJ")).toBe(true);
    expect(BB_DEFEND.has("AQo")).toBe(true);
    expect(BB_DEFEND.has("AKo")).toBe(false);
  });

  it("expands combos", () => {
    expect(combosOfCode("77")).toHaveLength(6);
    expect(combosOfCode("AKs")).toHaveLength(4);
    expect(combosOfCode("AKo")).toHaveLength(12);
    for (const [a, b] of combosOfCode("T9s")) expect(handCode(a, b)).toBe("T9s");
  });

  it("counts combos ahead after blockers", () => {
    // AA loses 3 combos to the AH blocker, 77 loses 3 to the 7D on board: all 6 left beat top pair
    const r = readRange(h("AH KH"), h("KS 7D 2C"), parseRange("AA, 77"));
    expect(r.live).toBe(6);
    expect(r.beat).toBe(6);
    expect(r.share).toBe(1);
    // a set of kings is ahead of every 4-bet hand that's left
    expect(readRange(h("KH KD"), h("KS 7D 2C"), parseRange("QQ+, AKs, AKo")).beat).toBe(0);
  });
});

group("new drills: generators", () => {
  it("are deterministic for a seed", () => {
    for (const k of NEW) expect(genPoker(k, seeded(42))).toEqual(genPoker(k, seeded(42)));
  });

  it("deal valid spots whose correct answer is a listed answer", () => {
    const rand = seeded(7);
    for (const k of NEW)
      for (let i = 0; i < 12; i++) {
        const s = genPoker(k, rand);
        expect(validSpot(s), JSON.stringify(s)).toBe(true);
        const g = gradePoker(s, "?");
        expect(answersForSpot(s)).toContain(g.correct);
        expect(answersFor(k)).toContain(g.correct);
        expect(gradePoker(s, g.correct).ok).toBe(true);
        expect(g.key.length).toBeGreaterThan(3);
      }
  });

  it("are all in the drill list", () => {
    for (const k of NEW) expect(POKER_DRILLS.some((d) => d.id === k)).toBe(true);
  });

  it("sizing and c-bet spots are textbook-clear", () => {
    const rand = seeded(9);
    for (let i = 0; i < 15; i++) {
      const s = genSizing(rand);
      expect(sizingAnswer(s.hero, s.board).clear).toBe(true);
      const c = genCbet(rand);
      expect(flopInfo(c.board).favors).not.toBe("neutral");
    }
  });

  it("rejects malformed new spots", () => {
    expect(validSpot({ kind: "texture", board: h3("KS 7D 2C"), q: "both" })).toBe(false);
    expect(validSpot({ kind: "handread", line: "nope", hero: h2("AS AD"), board: h("KS 7D 2C") })).toBe(false);
    expect(validSpot({ kind: "handread", line: "calldown", hero: h2("AS AD"), board: h("KS 7D 2C") })).toBe(false); // river line needs 5 cards
    expect(validSpot({ kind: "cbet", pos: "BTN", hero: h2("AS KS"), board: h3("KS 7D 2C"), pot: 5.5 })).toBe(false); // duplicate card
    expect(validSpot({ kind: "sizing", hero: h2("AS AD"), board: h("KS 7D 2C"), pot: -1 })).toBe(false);
  });
});

group("new drills: graders", () => {
  it("texture", () => {
    expect(gradeTexture({ kind: "texture", board: h3("8H 7H 6C"), q: "class" }, "wet")).toMatchObject({ ok: true, key: "tx-wet" });
    expect(gradeTexture({ kind: "texture", board: h3("AS KD 2C"), q: "favor" }, "caller")).toMatchObject({ ok: false, correct: "raiser", key: "tx-fav-raiser" });
  });

  it("hand reading", () => {
    const g = gradeHandRead({ kind: "handread", line: "fourbet", hero: h2("KH KD"), board: h("KS 7D 2C") }, "lt25");
    expect(g.ok).toBe(true);
    expect(g.key).toBe("hr-fourbet");
    // one pair on the river vs a range that only calls with a pair or better: lots of it is ahead
    const r = gradeHandRead({ kind: "handread", line: "calldown", hero: h2("8H 8C"), board: h("KS QD 9C 4H 2S") }, "gt75");
    expect(r.correct).toBe("gt75");
  });

  it("sizing", () => {
    expect(gradeSizing({ kind: "sizing", hero: h2("AS AD"), board: h("KC 7H 2D"), pot: 5.5 }, "33")).toMatchObject({ ok: true, key: "sz-dry-value" });
    const medium = gradeSizing({ kind: "sizing", hero: h2("5S 5D"), board: h("9H 8H 6C"), pot: 5.5 }, "100");
    expect(medium).toMatchObject({ ok: false, correct: "check", key: "sz-wet-medium" });
    expect(gradeSizing({ kind: "sizing", hero: h2("9S 9D"), board: h("KC 9H 4D 2S 7C"), pot: 21 }, "100").ok).toBe(true);
  });

  it("c-bet", () => {
    expect(gradeCbet({ kind: "cbet", pos: "BTN", hero: h2("QS JD"), board: h3("KC 7H 2D"), pot: 5.5 }, "bet")).toMatchObject({ ok: true, key: "cb-dry-air" });
    const air = gradeCbet({ kind: "cbet", pos: "CO", hero: h2("AS QD"), board: h3("8H 7H 6C"), pot: 5.5 }, "bet");
    expect(air).toMatchObject({ ok: false, correct: "check", key: "cb-wet-air" });
    expect(gradeCbet({ kind: "cbet", pos: "CO", hero: h2("QS QD"), board: h3("8H 7H 6C"), pot: 5.5 }, "bet").ok).toBe(true);
    // answers are stable: equity is seeded by the cards
    expect(gradeCbet({ kind: "cbet", pos: "CO", hero: h2("AS QD"), board: h3("8H 7H 6C"), pot: 5.5 }, "bet")).toEqual(air);
  });
});

group("EV cost", () => {
  it("pot odds: only wrong answers cost, in big blinds", () => {
    const rand = seeded(3);
    for (let i = 0; i < 5; i++) {
      const s = genPotOdds(rand);
      const right = gradePotOdds(s, "call");
      const g = right.ok ? gradePotOdds(s, "fold") : right;
      expect(g.ok).toBe(false);
      expect(g.cost).toBeGreaterThan(0);
      expect(gradePotOdds(s, g.correct).cost).toBeUndefined();
    }
  });

  it("toy model: value bets beat checks, pure air bets don't on a caller's board", () => {
    expect(betEV(0.9, 0.33, 10)).toBeGreaterThan(betEV(0.9, 0, 10));
    expect(betEV(0.25, 0.66, 10, -0.1)).toBeLessThan(betEV(0.25, 0, 10));
  });

  it("wrong c-bet answers carry a cost when the model agrees", () => {
    const g = gradeCbet({ kind: "cbet", pos: "CO", hero: h2("AS AD"), board: h3("8H 7H 6C"), pot: 5.5 }, "check");
    expect(g.ok).toBe(false);
    expect(g.cost).toBeGreaterThan(0);
  });
});

group("genPokerForKey", () => {
  it("rebuilds pre-flop keys exactly", () => {
    const s = genPokerForKey("pre-BTN-AKs", seeded(1));
    expect(s?.kind).toBe("preflop");
    if (s?.kind !== "preflop") return;
    expect(s.pos).toBe("BTN");
    expect(handCode(s.cards[0], s.cards[1])).toBe("AKs");
    expect(genPokerForKey("pre-SB-77", seeded(2))).toMatchObject({ kind: "preflop", pos: "SB" });
    expect(genPokerForKey("pre-MP-77", seeded(2))).toBeNull();
    expect(genPokerForKey("bj-hard-16-10", seeded(2))).toBeNull();
  });

  it("deals a spot with the same key for every drill", () => {
    const rand = seeded(11);
    for (const d of POKER_DRILLS) {
      for (let i = 0; i < 3; i++) {
        const key = gradePoker(genPoker(d.id, rand), "?").key;
        const again = genPokerForKey(key, rand);
        expect(again, key).not.toBeNull();
        expect(validSpot(again)).toBe(true);
        expect(gradePoker(again!, "?").key, key).toBe(key);
      }
    }
  });

  it("covers every texture and favour key", () => {
    for (const key of ["tx-dry", "tx-semiwet", "tx-wet", "tx-paired", "tx-monotone", "tx-fav-raiser", "tx-fav-caller"])
      expect(gradePoker(genPokerForKey(key, seeded(5))!, "?").key).toBe(key);
    expect(genTexture(seeded(5), { q: "favor", favors: "caller" })).toMatchObject({ kind: "texture", q: "favor" });
    expect(gradeHandRead(genHandRead(seeded(5), "calldown"), "?").key).toBe("hr-calldown");
  });
});

group("live coach post-flop", () => {
  /** Hero opens the button, the big blind calls, the big blind checks the flop. */
  function flopSpot(hole: string, board: string): PokerState {
    let s = newTable({ heroName: "Hero", bots: BOT_ROSTER, stack: 1000, sb: 5, bb: 10 });
    s = startHand({ ...s, button: 5 }, seeded(1));
    s = rigDeck(s, { 0: h(hole), 2: h("4S 4C") }, h(board + " 3C 3D").slice(0, 5));
    for (const a of [{ kind: "fold" }, { kind: "fold" }, { kind: "fold" }, { kind: "raise", to: 25 }, { kind: "fold" }, { kind: "call" }, { kind: "check" }] as const)
      s = act(s, a);
    expect(s.street).toBe("flop");
    expect(s.toAct).toBe(0);
    return s;
  }

  it("flags a missed c-bet on a dry high board, with a cost", () => {
    const s = flopSpot("QS JD", "KC 7H 2D");
    const n = coachHero(s, { kind: "check" });
    expect(n.ok).toBe(false);
    expect(n.title).toMatch(/c-bet/i);
    expect(coachHero(s, { kind: "raise", to: Math.round(s.pot / 3) }).ok).toBe(true);
  });

  it("wants a check with air on a low connected board", () => {
    const s = flopSpot("AS QD", "8H 7H 6C");
    expect(coachHero(s, { kind: "check" }).ok).toBe(true);
    const bet = coachHero(s, { kind: "raise", to: 40 });
    expect(bet.ok).toBe(false);
  });

  it("asks to size up value on a wet board", () => {
    const s = flopSpot("QS QD", "8H 7H 6C");
    const n = coachHero(s, { kind: "raise", to: 10 });
    expect(n.title).toBe("Size up");
    expect(n.ok).toBe(false);
  });
});
