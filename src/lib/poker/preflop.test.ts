/**
 * Tests for the 6-max 100bb response charts (preflop.ts), the drills built on them, and the
 * coach's use of them. Assumptions as in preflop.ts: 2.5bb opens (SB 3bb), 100bb stacks.
 */
import { describe as group, expect, it } from "vitest";
import type { Card } from "../blackjack/cards";
import { BOT_ROSTER, equityVsRandom } from "./bots";
import { answersFor, genPokerForKey, genVs3bet, genVsOpen, gradePoker, gradeVs3bet, gradeVsOpen, validSpot } from "./drills";
import { seeded } from "./equity";
import { act, newTable, positionOf, rigDeck, startHand } from "./game";
import type { PlayerAction, PokerState } from "./game-types";
import { combosOfCode } from "./postflop";
import {
  actionOf,
  COLD_VS_3BET,
  FOUR_BET,
  SEATS,
  THREE_BET,
  VS_3BET_SPECS,
  VS_3BET_SPOTS,
  vs3betChart,
  VS_4BET,
  VS_OPEN_SPOTS,
  vsOpenChart,
  type ResponseChart,
  type Seat,
} from "./preflop";
import { combosOf, OPEN_RANGES, parseRange, rangePercent, type Position } from "./ranges";
import { coachHero } from "./table-coach";
import { equityVsHoldings, type Holding } from "./villain";

const h = (s: string) => s.split(" ") as Card[];
const total = (c: ResponseChart) => rangePercent(c.raise) + rangePercent(c.call);
const allCharts = (): [string, ResponseChart][] => [
  ...VS_OPEN_SPOTS.map(({ hero, opener }) => [`${hero} vs ${opener}`, vsOpenChart(hero, opener)!] as [string, ResponseChart]),
  ...VS_3BET_SPOTS.map(({ hero, villain }) => [`${hero} open vs ${villain} 3-bet`, vs3betChart(hero, villain)!] as [string, ResponseChart]),
  ["cold vs 3-bet", COLD_VS_3BET],
  ["vs 4-bet", VS_4BET],
];

group("chart parsing", () => {
  it("parses intervals in either order", () => {
    expect([...parseRange("JJ-77")].sort()).toEqual(["77", "88", "99", "JJ", "TT"]);
    expect(parseRange("22-44")).toEqual(parseRange("44-22"));
    expect([...parseRange("A6s-AQs")]).toHaveLength(7);
    expect([...parseRange("KTo-K7o")].sort()).toEqual(["K7o", "K8o", "K9o", "KTo"]);
  });

  it("covers every seat pair", () => {
    expect(VS_OPEN_SPOTS).toHaveLength(15);
    expect(VS_3BET_SPOTS).toHaveLength(15);
    for (const { hero, opener } of VS_OPEN_SPOTS) expect(vsOpenChart(hero, opener), `${hero} vs ${opener}`).not.toBeNull();
    expect(vsOpenChart("UTG", "BTN")).toBeNull(); // UTG acts before the button
    expect(vs3betChart("BTN", "CO")).toBeNull();
    expect(Object.keys(VS_3BET_SPECS)).toHaveLength(8);
  });

  it("every chart parses to real hand codes, with no hand both raised and called", () => {
    for (const [name, c] of allCharts()) {
      expect(c.raise.size, name).toBeGreaterThan(0);
      for (const code of [...c.raise, ...c.call, ...c.mixed]) expect(combosOfCode(code).length, `${name}: ${code}`).toBe(combosOf(code));
      const both = [...c.raise].filter((x) => c.call.has(x));
      expect(both, name).toEqual([]);
    }
  });

  it("the typical 3-bet and 4-bet ranges are the chart sets themselves", () => {
    expect(THREE_BET).toBe(vsOpenChart("BTN", "CO")!.raise);
    expect(FOUR_BET).toBe(vs3betChart("CO", "BTN")!.raise);
  });
});

group("chart widths", () => {
  const bb = (o: Position) => total(vsOpenChart("BB", o)!);

  it("big-blind defence widens against later openers and matches solver-style widths", () => {
    expect(bb("UTG")).toBeLessThan(bb("HJ"));
    expect(bb("HJ")).toBeLessThan(bb("CO"));
    expect(bb("CO")).toBeLessThan(bb("BTN"));
    // published 100bb 6-max solver outputs: ~30–35% vs UTG, ~55–65% vs BTN
    expect(bb("UTG")).toBeGreaterThan(28);
    expect(bb("UTG")).toBeLessThan(38);
    expect(bb("BTN")).toBeGreaterThan(55);
    expect(bb("BTN")).toBeLessThan(66);
    expect(bb("BTN")).toBeGreaterThan(1.6 * bb("UTG"));
  });

  it("the small blind plays 3-bet or fold, wider against later openers", () => {
    for (const o of ["UTG", "HJ", "CO", "BTN"] as Position[]) expect(vsOpenChart("SB", o)!.call.size, o).toBe(0);
    const sb = (o: Position) => rangePercent(vsOpenChart("SB", o)!.raise);
    expect(sb("UTG")).toBeLessThan(sb("CO"));
    expect(sb("CO")).toBeLessThan(sb("BTN"));
    expect(sb("BTN")).toBeGreaterThan(12);
    expect(sb("BTN")).toBeLessThan(18);
  });

  it("cold-calling is tight early and wider in position on the button", () => {
    expect(total(vsOpenChart("HJ", "UTG")!)).toBeLessThan(10);
    expect(total(vsOpenChart("BTN", "UTG")!)).toBeGreaterThan(total(vsOpenChart("HJ", "UTG")!));
    expect(total(vsOpenChart("BTN", "CO")!)).toBeGreaterThan(15);
    expect(total(vsOpenChart("BTN", "CO")!)).toBeLessThan(25);
  });

  it("3-bet ranges always hold the premiums and widen against wider openers", () => {
    for (const { hero, opener } of VS_OPEN_SPOTS) {
      const c = vsOpenChart(hero, opener)!;
      for (const code of ["AA", "KK", "AKs"]) expect(c.raise.has(code), `${hero} vs ${opener}: ${code}`).toBe(true);
    }
    expect(rangePercent(vsOpenChart("BTN", "CO")!.raise)).toBeGreaterThan(rangePercent(vsOpenChart("BTN", "UTG")!.raise));
  });

  it("facing a 3-bet: only hands you opened, never fold the top, defend ~35–50%", () => {
    for (const { hero, villain } of VS_3BET_SPOTS) {
      const c = vs3betChart(hero, villain)!;
      const open = OPEN_RANGES[hero];
      for (const code of [...c.raise, ...c.call]) expect(open.has(code), `${hero} vs ${villain}: ${code} isn't a ${hero} open`).toBe(true);
      for (const code of ["AA", "KK", "QQ", "AKs", "AKo"]) expect(actionOf(c, code), `${hero} vs ${villain}: ${code}`).not.toBe("fold");
      const share = (rangePercent(c.raise) + rangePercent(c.call)) / rangePercent(open);
      expect(share, `${hero} vs ${villain}`).toBeGreaterThan(0.35);
      expect(share, `${hero} vs ${villain}`).toBeLessThan(0.52);
    }
    // in position against a blind 3-bet you continue wider than out of position
    expect(total(vs3betChart("HJ", "BB")!)).toBeGreaterThan(total(vs3betChart("HJ", "CO")!));
  });
});

group("hand vs range equity", () => {
  const holding = (codes: Set<string>, dead: Card[]): Holding => {
    const combos = [...codes].flatMap(combosOfCode).filter((c) => !dead.includes(c[0]) && !dead.includes(c[1]));
    const cum = new Float64Array(combos.length).map((_, i) => i + 1);
    return { combos, cum, total: combos.length, label: "test" };
  };
  const eq = (hero: string, codes: Set<string>, board = "") => equityVsHoldings(h(hero), board ? h(board) : [], [holding(codes, [...h(hero), ...(board ? h(board) : [])])], 3000, seeded(3));

  it("is sensible against tight and wide ranges", () => {
    expect(eq("AS AH", parseRange("QQ+, AKs, AKo"))).toBeGreaterThan(0.8);
    expect(eq("AS KH", parseRange("QQ+, AKs, AKo"))).toBeLessThan(0.45);
    expect(eq("7S 2H", vsOpenChart("BB", "BTN")!.call)).toBeLessThan(0.4);
    // the same hand does much worse against a 4-bet range than against a button open
    expect(eq("JS JH", FOUR_BET)).toBeLessThan(eq("JS JH", OPEN_RANGES.BTN) - 0.2);
  });
});

/* ------------------------------------------------------------------ drills */

group("response drills", () => {
  it("deal valid spots whose answers grade consistently, and rebuild from their keys", () => {
    const rand = seeded(11);
    for (let i = 0; i < 60; i++) {
      for (const s of [genVsOpen(rand), genVs3bet(rand)]) {
        expect(validSpot(s), JSON.stringify(s)).toBe(true);
        const g = gradePoker(s, "?");
        expect(answersFor(s.kind)).toContain(g.correct);
        expect(gradePoker(s, g.correct).ok).toBe(true);
        const again = genPokerForKey(g.key, rand);
        expect(again, g.key).not.toBeNull();
        expect(gradePoker(again!, "?").key).toBe(g.key);
      }
    }
  });

  it("facing a 3-bet only deals hands you opened", () => {
    const rand = seeded(12);
    for (let i = 0; i < 80; i++) {
      const s = genVs3bet(rand);
      expect(OPEN_RANGES[s.hero].has(gradeVs3bet(s, "?").detail!.code as string)).toBe(true);
    }
  });

  it("can be locked to one seat pair", () => {
    const rand = seeded(13);
    for (let i = 0; i < 20; i++) expect(genVsOpen(rand, { hero: "BB", opener: "UTG" })).toMatchObject({ hero: "BB", opener: "UTG" });
    for (let i = 0; i < 20; i++) expect(genVs3bet(rand, { hero: "CO", villain: "BTN" })).toMatchObject({ hero: "CO", villain: "BTN" });
  });

  it("grades textbook answers", () => {
    const vo = (hero: Seat, opener: Position, cards: string, a: string) => gradeVsOpen({ kind: "vsopen", hero, opener, cards: h(cards) as [Card, Card] }, a);
    expect(vo("BB", "BTN", "KS 2D", "call").ok).toBe(true);
    expect(vo("BB", "UTG", "KS 2D", "fold").ok).toBe(true);
    expect(vo("SB", "BTN", "AS 9D", "fold").ok).toBe(true); // 3-bet or fold, and A9o isn't a 3-bet
    expect(vo("SB", "BTN", "AS 9D", "call").correct).toBe("fold");
    expect(vo("HJ", "UTG", "AS 5S", "3bet").ok).toBe(true);
    expect(vo("BTN", "CO", "5S 5D", "call").ok).toBe(true);
    const v3 = (hero: Position, villain: Seat, cards: string, a: string) => gradeVs3bet({ kind: "vs3bet", hero, villain, cards: h(cards) as [Card, Card] }, a);
    expect(v3("CO", "BTN", "KS KD", "4bet").ok).toBe(true);
    expect(v3("CO", "BTN", "JS JD", "call").ok).toBe(true);
    expect(v3("UTG", "BTN", "KS JD", "fold").ok).toBe(true);
    expect(v3("UTG", "BTN", "KS JD", "call").why).toMatch(/Fold/);
  });

  it("rejects impossible spots", () => {
    expect(validSpot({ kind: "vsopen", hero: "UTG", opener: "BTN", cards: ["AS", "KD"] })).toBe(false);
    expect(validSpot({ kind: "vsopen", hero: "BB", opener: "BB", cards: ["AS", "KD"] })).toBe(false);
    expect(validSpot({ kind: "vs3bet", hero: "BTN", villain: "CO", cards: ["AS", "KD"] })).toBe(false);
    expect(validSpot({ kind: "vs3bet", hero: "CO", villain: "BTN", cards: ["AS", "AS"] })).toBe(false);
    expect(genPokerForKey("vo-UTG-BTN-AKs", seeded(1))).toBeNull();
    expect(SEATS).toHaveLength(6);
  });
});

/* ------------------------------------------------------------------ coach */

const F = { kind: "fold" } as const;
const C = { kind: "call" } as const;
const K = { kind: "check" } as const;
const R = (to: number) => ({ kind: "raise", to }) as const;
const BUTTON_FOR: Record<string, number> = { BTN: 5, SB: 4, BB: 3, UTG: 2, HJ: 1, CO: 0 };

function spot(pos: string, hero: string, acts: PlayerAction[], board = "", others: Record<number, string> = {}): PokerState {
  let s = newTable({ heroName: "Hero", bots: BOT_ROSTER, stack: 1000, sb: 5, bb: 10 });
  s = startHand({ ...s, button: BUTTON_FOR[pos] }, seeded(1));
  const holes: Record<number, Card[]> = { 0: h(hero) };
  for (const [k, v] of Object.entries(others)) holes[Number(k)] = h(v);
  s = rigDeck(s, holes, board ? h(board) : []);
  expect(positionOf(s, 0)).toBe(pos);
  for (const a of acts) s = act(s, a);
  expect(s.toAct).toBe(0);
  return s;
}

group("coach uses the charts pre-flop", () => {
  const BB_VS_BTN = [F, F, F, R(25), F];
  const SB_VS_UTG = [R(25), F, F, F];
  const CO_VS_BTN_3BET = [F, F, R(25), R(80), F, F];

  it("grades against the chart and says so", () => {
    const n = coachHero(spot("BB", "QS 8D", BB_VS_BTN), C);
    expect(n.ok).toBe(true);
    expect(n.detail).toMatch(/chart says call/);
    expect(coachHero(spot("BB", "QS 8D", BB_VS_BTN), F).ok).toBe(false);
    // K2o is a mixed defend: neither answer is called a mistake
    expect(coachHero(spot("BB", "KS 2D", BB_VS_BTN), F).ok).toBeNull();
  });

  it("small blind: junk flats are mistakes, value hands should 3-bet", () => {
    expect(coachHero(spot("SB", "9S 6D", SB_VS_UTG), C).ok).toBe(false);
    expect(coachHero(spot("SB", "QS QD", SB_VS_UTG), R(110)).ok).toBe(true);
    expect(coachHero(spot("SB", "QS QD", SB_VS_UTG), C).ok).toBe(false);
  });

  it("the opener facing a 3-bet: 4-bet kings, fold the bottom of the range", () => {
    expect(coachHero(spot("CO", "KS KD", CO_VS_BTN_3BET), R(190)).ok).toBe(true);
    expect(coachHero(spot("CO", "KS KD", CO_VS_BTN_3BET), F).ok).toBe(false);
    expect(coachHero(spot("CO", "QS 8S", CO_VS_BTN_3BET), F).ok).toBe(true);
  });

  it("multiway pots fall back to the equity model", () => {
    // UTG opens, the button calls, hero in the big blind: not a heads-up chart spot
    const n = coachHero(spot("BB", "9S 8S", [R(25), F, F, C, F]), C);
    expect(n.detail).not.toMatch(/chart says/);
  });
});

group("coach post-flop: weak draws vs big bets", () => {
  it("folds ace-high with a backdoor draw to an overbet that the old random-hand model would have called", () => {
    // BB defends A5o vs the button, checks 8-7-3; the button overbets 1.5x pot.
    const s = spot("BB", "AS 5D", [F, F, F, R(25), F, C, K, R(82)], "8H 7C 3D 2S KC", { 4: "4S 4C" });
    const price = 82 / (s.pot + 82);
    // against random hands the gutshot + backdoors looks like a call
    const vsRandom = equityVsRandom(s.seats[0].hole, s.board, 1, 4000, seeded(5));
    expect(vsRandom).toBeGreaterThan(price);
    expect(coachHero(s, F).ok).toBe(true);
    expect(coachHero(s, C).ok).toBe(false);
    expect(coachHero(s, C).detail).toMatch(/betting range/);
  });
});
