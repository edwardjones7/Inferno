/**
 * The structured `spot` the live coach attaches to every note (the decision log that leak
 * detection trains on). Assumptions as in coach.test.ts: 6-max, 100bb (1000 chips at 5/10),
 * 2.5bb opens, 3-bets to 8bb.
 */
import { describe, expect, it } from "vitest";
import type { Card } from "../blackjack/cards";
import { botDecide, BOT_ROSTER } from "./bots";
import { seeded } from "./equity";
import { act, newTable, positionOf, rigDeck, startHand } from "./game";
import type { PlayerAction, PokerState } from "./game-types";
import { coachHero, directionOf } from "./table-coach";

const h = (s: string) => s.split(" ") as Card[];
const F = { kind: "fold" } as const;
const C = { kind: "call" } as const;
const K = { kind: "check" } as const;
const R = (to: number) => ({ kind: "raise", to }) as const;

/** `startHand` moves the button one seat on, so this puts the hero (seat 0) in `pos`. */
const BUTTON_FOR: Record<string, number> = { BTN: 5, SB: 4, BB: 3, UTG: 2, HJ: 1, CO: 0 };

function spot(pos: string, hero: string, acts: PlayerAction[], board = ""): PokerState {
  let s = newTable({ heroName: "Hero", bots: BOT_ROSTER, stack: 1000, sb: 5, bb: 10 });
  s = startHand({ ...s, button: BUTTON_FOR[pos] }, seeded(1));
  s = rigDeck(s, { 0: h(hero) }, board ? h(board) : []);
  expect(positionOf(s, 0)).toBe(pos);
  for (const a of acts) s = act(s, a);
  expect(s.toAct).toBe(0);
  return s;
}

describe("coach spot: situation", () => {
  it("first in: an open, graded on the opening chart", () => {
    const sp = coachHero(spot("UTG", "7S 2D", []), R(25)).spot!;
    expect(sp).toMatchObject({ family: "open", street: "preflop", pos: "UTG", hand: "72o", chosen: "raise", best: "fold", dir: 1, graded: "chart" });
    expect(sp.effBb).toBe(100);
    expect(sp.vs).toBeUndefined();
  });

  it("big blind vs a button open: who raised, the price, and calling junk is too loose", () => {
    const sp = coachHero(spot("BB", "7S 2D", [F, F, F, R(25), F]), C).spot!;
    expect(sp).toMatchObject({ family: "vs-open", pos: "BB", vs: "BTN", chosen: "call", best: "fold", dir: 1, toCallBb: 1.5, opps: 1, ip: false });
    expect(sp.eq).toBeGreaterThan(0);
  });

  it("opener facing a 3-bet: folding aces is too tight", () => {
    // CO opens, the button 3-bets, the blinds fold
    const sp = coachHero(spot("CO", "AS AH", [F, F, R(25), R(80), F, F]), F).spot!;
    expect(sp).toMatchObject({ family: "vs-3bet", pos: "CO", vs: "BTN", hand: "AA", chosen: "fold", best: "raise", dir: -1, graded: "chart" });
    expect(sp.toCallBb).toBe(5.5);
  });

  it("cold vs two raises", () => {
    // UTG opens, HJ 3-bets, hero on the button hasn't raised
    const sp = coachHero(spot("BTN", "7S 2D", [R(25), R(80), F]), F).spot!;
    expect(sp.family).toBe("cold");
    expect(sp.vs).toBe("HJ");
  });

  it("the pre-flop raiser on the flop is in a c-bet spot, with its hand class and the planned size", () => {
    // button opens, big blind calls and checks the flop
    const s = spot("BTN", "AS KS", [F, F, F, R(25), F, C, K], "AH 7D 2C");
    const sp = coachHero(s, R(s.seats[0].committed + Math.round(s.pot * 0.33))).spot!;
    expect(sp).toMatchObject({ family: "cbet", street: "flop", pos: "BTN", vs: "BB", cls: "toppair", ip: true, best: "raise", graded: "plan" });
    expect(sp.size).toBeCloseTo(0.33, 1);
    expect(sp.bestSize).toBeGreaterThan(0);
  });

  it("folding when checking is free is the most passive miss", () => {
    const s = spot("BTN", "7S 2D", [F, F, F, R(25), F, C, K], "AH KD QC");
    const n = coachHero(s, F);
    expect(n.ok).toBe(false);
    expect(n.spot).toMatchObject({ best: "check", dir: -1 });
  });
});

describe("coach spot: direction", () => {
  it.each([
    ["fold", "call", -1],
    ["call", "fold", 1],
    ["check", "raise", -1],
    ["raise", "check", 1],
    ["call", "raise", -1],
    ["raise", "call", 1],
    ["check", "call", 0],
  ] as const)("%s vs the coach's %s → %i", (chosen, best, dir) => {
    expect(directionOf(chosen, best)).toBe(dir);
  });

  it("sizing misses use the coach's size-up / size-down bands", () => {
    expect(directionOf("raise", "raise", 1.0, 0.33)).toBe(1);
    expect(directionOf("raise", "raise", 0.3, 0.66)).toBe(-1);
    expect(directionOf("raise", "raise", 0.6, 0.66)).toBe(0);
  });
});

describe("coach spot: every decision at a real table", () => {
  it("is recorded, and every graded mistake says which way it missed", () => {
    const rand = seeded(11);
    let s = newTable({ heroName: "Hero", bots: BOT_ROSTER, stack: 1000, sb: 5, bb: 10 });
    let graded = 0;
    for (let hand = 0; hand < 60; hand++) {
      s = startHand({ ...s, seats: s.seats.map((x) => ({ ...x, stack: 1000 })) }, rand);
      for (let guard = 0; s.street !== "done" && guard < 80; guard++) {
        const seat = s.toAct!;
        // the hero plays like a loose-aggressive bot, so it makes mistakes both ways
        const a = seat === 0 ? botDecide({ ...s, seats: s.seats.map((x) => (x.id === 0 ? { ...x, style: "lag", skill: 0.4 } : x)) }, 0, rand) : botDecide(s, seat, rand);
        if (seat === 0) {
          const n = coachHero(s, a);
          const sp = n.spot!;
          expect(sp).toBeDefined();
          expect(sp.chosen).toBe(a.kind);
          expect(sp.hand).toMatch(/^[2-9TJQKA]{2}[so]?$/);
          if (n.ok === false) {
            graded++;
            expect(sp.best, `${n.title}: ${n.detail}`).toBeDefined();
            expect(sp.dir, `${n.title}: ${n.detail}`).not.toBe(0);
          }
          if (sp.best === undefined) expect(sp.dir).toBeUndefined();
        }
        s = act(s, a);
      }
    }
    expect(graded).toBeGreaterThan(0);
  });
});
