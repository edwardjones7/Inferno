import { describe as group, expect, it } from "vitest";
import type { Card } from "../blackjack/cards";
import { botDecide, BOT_ROSTER, botThinkMs, equityVsRandom } from "./bots";
import { seeded } from "./equity";
import { act, blindSeats, isHandOver, legal, newTable, positionOf, rigDeck, startHand, totalChips } from "./game";
import type { PokerState } from "./game-types";
import { coachHero } from "./table-coach";

const h = (s: string) => s.split(" ") as Card[];

function table(stack = 1000, stacks?: number[]): PokerState {
  const s = newTable({ heroName: "Hero", bots: BOT_ROSTER, stack, sb: 5, bb: 10 });
  if (stacks) stacks.forEach((v, i) => (s.seats[i].stack = v));
  return s;
}

/** Start a hand with the button on `button` (the first live seat after `button - 1`). */
function deal(s: PokerState, button: number, seed = 1): PokerState {
  return startHand({ ...s, button: (button - 1 + s.seats.length) % s.seats.length }, seeded(seed));
}

const fold = { kind: "fold" } as const;
const call = { kind: "call" } as const;
const check = { kind: "check" } as const;
const raise = (to: number) => ({ kind: "raise", to }) as const;

/** Apply a list of actions, checking the expected seat acts each time. */
function play(s: PokerState, steps: [number, Parameters<typeof act>[1]][]): PokerState {
  for (const [seat, a] of steps) {
    expect(s.toAct, `expected seat ${seat} to act`).toBe(seat);
    s = act(s, a);
  }
  return s;
}

group("table setup and blinds", () => {
  it("first hand puts the button on the hero and posts blinds", () => {
    const s = startHand(table(), seeded(1));
    expect(s.handNo).toBe(1);
    expect(s.button).toBe(0);
    expect(s.seats[1].committed).toBe(5);
    expect(s.seats[2].committed).toBe(10);
    expect(s.pot).toBe(15);
    expect(s.toAct).toBe(3);
    expect(s.currentBet).toBe(10);
    expect(s.seats.every((x) => x.hole.length === 2)).toBe(true);
    expect(new Set(s.seats.flatMap((x) => x.hole)).size).toBe(12);
    expect(s.deck.length).toBe(40);
    expect(positionOf(s, 3)).toBe("UTG");
    expect(positionOf(s, 4)).toBe("HJ");
    expect(positionOf(s, 5)).toBe("CO");
    expect(positionOf(s, 0)).toBe("BTN");
    expect(positionOf(s, 1)).toBe("SB");
    expect(positionOf(s, 2)).toBe("BB");
  });

  it("rotates the button and skips busted seats", () => {
    let s = table(1000, [1000, 0, 1000, 1000, 1000, 1000]);
    s = startHand(s, seeded(2));
    expect(s.button).toBe(0);
    expect(s.seats[1].folded).toBe(true);
    expect(s.seats[1].hole).toEqual([]);
    expect(blindSeats(s)).toEqual({ sb: 2, bb: 3 });
    expect(s.seats[2].committed).toBe(5);
    expect(s.seats[3].committed).toBe(10);
    expect(s.toAct).toBe(4);
    expect(positionOf(s, 4)).toBe("HJ");
    expect(positionOf(s, 5)).toBe("CO");
    // finish quickly and rotate
    while (!isHandOver(s)) s = act(s, fold);
    s = startHand(s, seeded(3));
    expect(s.button).toBe(2);
    expect(s.handNo).toBe(2);
  });

  it("short blinds post all-in", () => {
    const s = deal(table(1000, [1000, 3, 7, 1000, 1000, 1000]), 0);
    expect(s.seats[1].committed).toBe(3);
    expect(s.seats[1].allIn).toBe(true);
    expect(s.seats[2].committed).toBe(7);
    expect(s.seats[2].allIn).toBe(true);
    expect(s.currentBet).toBe(10);
    expect(legal(s).toCall).toBe(10);
  });

  it("heads-up: the button posts the small blind and acts first pre-flop, last after", () => {
    let s = deal(table(1000, [1000, 0, 0, 1000, 0, 0]), 3);
    expect(s.button).toBe(3);
    expect(s.seats[3].committed).toBe(5);
    expect(s.seats[0].committed).toBe(10);
    expect(s.toAct).toBe(3);
    expect(positionOf(s, 3)).toBe("BTN");
    expect(positionOf(s, 0)).toBe("BB");
    s = play(s, [
      [3, call],
      [0, check],
    ]);
    expect(s.street).toBe("flop");
    expect(s.toAct).toBe(0);
  });

  it("throws with fewer than two players holding chips", () => {
    expect(() => startHand(table(1000, [1000, 0, 0, 0, 0, 0]), seeded(1))).toThrow(/two players/);
  });
});

group("betting rules", () => {
  it("min bet, min raise, and raise increments", () => {
    let s = deal(table(), 0);
    let L = legal(s);
    expect(L).toMatchObject({ canCheck: false, toCall: 10, canRaise: true, minRaiseTo: 20, maxRaiseTo: 1000, isOpeningBet: false });
    expect(() => act(s, raise(15))).toThrow(/Minimum raise is to 20/);
    expect(() => act(s, check)).toThrow(/can't check/);
    s = act(s, raise(30)); // raise of 20
    L = legal(s);
    expect(L.minRaiseTo).toBe(50);
    s = act(s, raise(80)); // raise of 50
    expect(legal(s).minRaiseTo).toBe(130);
    // to above the stack is clamped to all-in
    s = act(s, raise(5000));
    expect(s.seats[5].allIn).toBe(true);
    expect(s.seats[5].committed).toBe(1000);
  });

  it("post-flop min bet is the big blind and BB gets the pre-flop option", () => {
    let s = deal(table(), 0);
    s = play(s, [
      [3, call],
      [4, fold],
      [5, fold],
      [0, fold],
      [1, call],
    ]);
    expect(s.toAct).toBe(2);
    expect(legal(s).canCheck).toBe(true);
    expect(legal(s).canRaise).toBe(true);
    s = act(s, check);
    expect(s.street).toBe("flop");
    expect(s.board.length).toBe(3);
    expect(s.pot).toBe(30);
    expect(s.toAct).toBe(1);
    const L = legal(s);
    expect(L).toMatchObject({ canCheck: true, toCall: 0, minRaiseTo: 10, isOpeningBet: true });
  });

  it("a short all-in raise does not reopen the betting for players who already acted", () => {
    let s = deal(table(1000, [1000, 1000, 1000, 1000, 1000, 135]), 0);
    s = play(s, [
      [3, raise(100)], // raise of 90
      [4, call],
      [5, raise(135)], // all-in, only 35 more: not a full raise
    ]);
    expect(s.seats[5].allIn).toBe(true);
    expect(s.lastRaiseSize).toBe(90);
    // hero hasn't acted yet: may re-raise, min to 135 + 90
    expect(s.toAct).toBe(0);
    expect(legal(s)).toMatchObject({ canRaise: true, minRaiseTo: 225, toCall: 135 });
    s = play(s, [
      [0, fold],
      [1, fold],
      [2, fold],
    ]);
    // UTG already acted and faces only a short all-in: call or fold only
    expect(s.toAct).toBe(3);
    expect(legal(s)).toMatchObject({ canRaise: false, toCall: 35, canCheck: false });
    expect(() => act(s, raise(300))).toThrow(/can't raise/);
    s = act(s, call);
    expect(s.toAct).toBe(4);
    expect(legal(s).canRaise).toBe(false);
    s = act(s, call);
    expect(s.street).toBe("flop");
  });

  it("a full raise after a short all-in reopens the action", () => {
    let s = deal(table(1000, [1000, 1000, 1000, 1000, 1000, 135]), 0);
    s = play(s, [
      [3, raise(100)],
      [4, call],
      [5, raise(135)],
      [0, raise(225)],
      [1, fold],
      [2, fold],
    ]);
    expect(s.toAct).toBe(3);
    expect(legal(s)).toMatchObject({ canRaise: true, minRaiseTo: 315 });
  });

  it("the last player in can't raise when everyone else is all-in", () => {
    let s = deal(table(1000, [1000, 1000, 1000, 1000, 1000, 1000]), 0);
    s = play(s, [
      [3, raise(1000)],
      [4, fold],
      [5, fold],
      [0, fold],
      [1, fold],
    ]);
    expect(legal(s)).toMatchObject({ canRaise: false, toCall: 990 });
  });
});

group("hand endings and pots", () => {
  it("fold-around: big blind wins, nothing shown", () => {
    let s = deal(table(), 0);
    const before = totalChips(s);
    s = play(s, [
      [3, fold],
      [4, fold],
      [5, fold],
      [0, fold],
      [1, fold],
    ]);
    expect(s.street).toBe("done");
    expect(s.toAct).toBeNull();
    expect(s.winners).toEqual([{ seat: 2, amount: 10, pot: 0 }]);
    expect(s.seats[2].stack).toBe(1005);
    expect(s.seats[1].stack).toBe(995);
    expect(s.pot).toBe(0);
    expect(totalChips(s)).toBe(before);
  });

  it("uncalled bets are returned", () => {
    let s = deal(table(), 0);
    s = play(s, [
      [3, raise(30)],
      [4, fold],
      [5, fold],
      [0, fold],
      [1, fold],
      [2, fold],
    ]);
    expect(s.winners).toEqual([{ seat: 3, amount: 25, pot: 0 }]);
    expect(s.seats[3].stack).toBe(1015);
  });

  it("three all-ins for different amounts build exact side pots", () => {
    let s = deal(table(1000, [1000, 1000, 1000, 100, 300, 600]), 0);
    s = rigDeck(s, { 3: h("AS AH"), 4: h("KS KH"), 5: h("QS QH"), 0: h("2C 7D"), 1: h("3C 8D"), 2: h("4C 9D") }, h("2S 5D 9C JH 3D"));
    const before = totalChips(s);
    s = play(s, [
      [3, raise(100)],
      [4, raise(300)],
      [5, raise(600)],
      [0, fold],
      [1, fold],
      [2, call], // BB calls 600
    ]);
    // BB still has chips but nobody to bet against? seat 5 all-in, BB matched: run out
    expect(s.street).toBe("done");
    expect(s.board).toEqual(h("2S 5D 9C JH 3D"));
    // main: 100*4 + 5 (SB) = 405; side1: 200*3 = 600; side2: 300*2 = 600
    expect(s.pots).toEqual([
      { amount: 405, eligible: [2, 3, 4, 5] },
      { amount: 600, eligible: [2, 4, 5] },
      { amount: 600, eligible: [2, 5] },
    ]);
    expect(s.winners.map((w) => [w.seat, w.amount, w.pot])).toEqual([
      [3, 405, 0],
      [4, 600, 1],
      [5, 600, 2],
    ]);
    expect(s.winners[0].hand).toBe("Pair of aces");
    expect(s.seats[3].stack).toBe(405);
    expect(s.seats[4].stack).toBe(600);
    expect(s.seats[5].stack).toBe(600);
    expect(s.seats[2].stack).toBe(400);
    expect(s.seats[1].stack).toBe(995);
    expect(totalChips(s)).toBe(before);
  });

  it("split pot between two equal hands", () => {
    let s = deal(table(1000, [1000, 1000, 1000, 1000, 1000, 1000]), 0);
    // board plays: broadway straight for everyone left
    s = rigDeck(s, { 1: h("2C 3D"), 2: h("2D 3C") }, h("AS KD QH JC TS"));
    s = play(s, [
      [3, fold],
      [4, fold],
      [5, fold],
      [0, call], // 10
      [1, call], // 10
      [2, check],
    ]);
    // flop: SB first
    expect(s.toAct).toBe(1);
    s = play(s, [
      [1, raise(15)],
      [2, call],
      [0, fold],
    ]);
    // pot is 30 + 30 = 60 split
    s = play(s, [
      [1, check],
      [2, check],
      [1, raise(11)],
      [2, raise(22)],
      [1, raise(33)],
      [2, call],
    ]);
    expect(s.street).toBe("done");
    expect(s.winners.length).toBe(2);
    const total = s.winners.reduce((n, w) => n + w.amount, 0);
    expect(total).toBe(30 + 30 + 66);
    expect(s.winners[0]).toMatchObject({ seat: 1, amount: 63 });
    expect(s.winners[1]).toMatchObject({ seat: 2, amount: 63 });
    expect(s.winners[0].hand).toBe("Straight, ace high");
  });

  it("odd chip goes to the first winner left of the button", () => {
    let s = deal(table(), 0);
    s = rigDeck(s, { 0: h("2C 3D"), 2: h("2D 3C") }, h("AS KD QH JC TS"));
    s = play(s, [
      [3, fold],
      [4, fold],
      [5, fold],
      [0, call],
      [1, fold], // 5 dead chips: pot 25
      [2, check],
    ]);
    for (let k = 0; k < 3; k++)
      s = play(s, [
        [2, check],
        [0, check],
      ]);
    expect(s.pots).toEqual([{ amount: 25, eligible: [0, 2] }]);
    expect(s.winners.map((w) => [w.seat, w.amount])).toEqual([
      [2, 13],
      [0, 12],
    ]);
  });

  it("all-in pre-flop runs out the board automatically", () => {
    let s = deal(table(), 0);
    s = rigDeck(s, { 3: h("AS AD"), 0: h("KC KH") }, h("2S 7D 9C 4H 3C"));
    const before = totalChips(s);
    s = play(s, [
      [3, raise(1000)],
      [4, fold],
      [5, fold],
      [0, call],
      [1, fold],
      [2, fold],
    ]);
    expect(s.street).toBe("done");
    expect(s.board).toEqual(h("2S 7D 9C 4H 3C"));
    expect(s.seats[3].stack).toBe(2015);
    expect(s.seats[0].stack).toBe(0);
    expect(s.log.some((e) => e.kind === "showdown")).toBe(true);
    expect(totalChips(s)).toBe(before);
    // the busted hero sits out the next hand
    const n = startHand(s, seeded(9));
    expect(n.seats[0].folded).toBe(true);
    expect(n.seats[0].hole).toEqual([]);
  });

  it("checks down to a showdown", () => {
    let s = deal(table(1000, [1000, 1000, 1000, 0, 0, 0]), 0);
    s = rigDeck(s, { 0: h("AS KS"), 1: h("QD QC"), 2: h("7H 2D") }, h("AH 8D 9C 4H 3C"));
    s = play(s, [
      [0, call],
      [1, call],
      [2, check],
    ]);
    for (let street = 0; street < 3; street++)
      s = play(s, [
        [1, check],
        [2, check],
        [0, check],
      ]);
    expect(s.street).toBe("done");
    expect(s.winners).toEqual([{ seat: 0, amount: 30, hand: "Pair of aces", pot: 0 }]);
  });
});

group("bots", () => {
  it("roster and think time", () => {
    expect(BOT_ROSTER.length).toBe(5);
    const r = seeded(4);
    for (let i = 0; i < 200; i++) {
      const ms = botThinkMs(r);
      expect(ms).toBeGreaterThanOrEqual(500);
      expect(ms).toBeLessThanOrEqual(1400);
    }
  });

  it("equity vs random hands is sensible", () => {
    const r = seeded(7);
    expect(equityVsRandom(h("AS AH"), [], 1, 3000, r)).toBeGreaterThan(0.8);
    expect(equityVsRandom(h("7C 2D"), [], 1, 3000, r)).toBeLessThan(0.4);
    expect(equityVsRandom(h("AS AH"), h("AD AC KS"), 3, 500, r)).toBeGreaterThan(0.97);
  });

  it("300 full 6-bot hands: always legal, chips conserved, no exceptions", () => {
    let hands = 0;
    let actions = 0;
    let showdowns = 0;
    for (let game = 0; game < 30; game++) {
      const rand = seeded(1000 + game);
      let s = newTable({ heroName: "Bot0", bots: BOT_ROSTER, stack: 400 + game * 37, sb: 5, bb: 10 });
      s.seats[0].style = (["tag", "lag", "nit", "station"] as const)[game % 4];
      const total = totalChips(s);
      for (let k = 0; k < 10; k++) {
        if (s.seats.filter((x) => x.stack > 0).length < 2) break;
        s = startHand(s, rand);
        let guard = 0;
        while (!isHandOver(s)) {
          const seat = s.toAct!;
          const a = botDecide(s, seat, rand);
          const L = legal(s);
          if (a.kind === "check") expect(L.canCheck).toBe(true);
          if (a.kind === "raise") {
            expect(L.canRaise).toBe(true);
            expect(a.to).toBeGreaterThanOrEqual(L.minRaiseTo);
            expect(a.to).toBeLessThanOrEqual(L.maxRaiseTo);
          }
          s = act(s, a);
          actions++;
          expect(totalChips(s)).toBe(total);
          expect(s.seats.every((x) => x.stack >= 0 && Number.isInteger(x.stack))).toBe(true);
          expect(++guard).toBeLessThan(200);
        }
        if (s.log.some((e) => e.kind === "showdown")) showdowns++;
        expect(s.pot).toBe(0);
        expect(totalChips(s)).toBe(total);
        hands++;
      }
    }
    expect(hands).toBeGreaterThanOrEqual(280);
    expect(actions).toBeGreaterThan(hands * 4);
    expect(showdowns).toBeGreaterThan(10);
  });

  it("decides quickly", () => {
    let s = deal(table(), 0, 5);
    s = play(s, [
      [3, call],
      [4, call],
      [5, call],
      [0, call],
      [1, call],
      [2, check],
    ]);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) botDecide(s, s.toAct!, seeded(i));
    const per = (performance.now() - t0) / 20;
    expect(per).toBeLessThan(60); // generous for slow CI; typically a few ms
  });
});

group("coachHero", () => {
  /** Hero UTG at a 6-max table with the given hole cards. */
  function heroUTG(cards: string) {
    const s = deal(table(), 3); // button 3 -> SB 4, BB 5, hero UTG
    expect(positionOf(s, 0)).toBe("UTG");
    expect(s.toAct).toBe(0);
    return rigDeck(s, { 0: h(cards) });
  }

  it("AA raise UTG is fine; folding it is a mistake", () => {
    const s = heroUTG("AS AH");
    expect(coachHero(s, raise(25)).ok).toBe(true);
    expect(coachHero(s, fold).ok).toBe(false);
  });

  it("72o raise UTG is a mistake, folding it is fine", () => {
    const s = heroUTG("7S 2H");
    const n = coachHero(s, raise(25));
    expect(n.ok).toBe(false);
    expect(n.detail).toMatch(/72o/);
    expect(n.detail).toMatch(/%/);
    expect(coachHero(s, fold).ok).toBe(true);
  });

  it("limping is flagged", () => {
    const n = coachHero(heroUTG("KS QS"), call);
    expect(n.ok).toBe(false);
    expect(n.title).toMatch(/limp/i);
  });

  it("calling a small bet with a flush draw is ok; folding for free is a mistake", () => {
    let s = deal(table(1000, [1000, 1000, 1000, 0, 0, 0]), 0);
    s = rigDeck(s, { 0: h("AH 9H"), 1: h("QD QC"), 2: h("7S 2D") }, h("KH 6H 2C 4S 3D"));
    s = play(s, [
      [0, raise(30)],
      [1, fold],
      [2, call],
      [2, raise(20)], // flop: BB bets 20 into 60
    ]);
    expect(s.toAct).toBe(0);
    const n = coachHero(s, call);
    expect(n.ok).toBe(true);
    expect(n.detail).toMatch(/random/);
    expect(n.detail).toMatch(/needed/);
    expect(coachHero(s, fold).ok).toBe(false);
  });

  it("calling off with nothing at a bad price is a mistake", () => {
    let s = deal(table(1000, [1000, 1000, 1000, 0, 0, 0]), 0);
    s = rigDeck(s, { 0: h("3C 2D"), 1: h("QD QC"), 2: h("7S 8D") }, h("KH JH 9S 4S 6D"));
    s = play(s, [
      [0, call],
      [1, call],
      [2, check],
      [1, raise(100)],
      [2, fold],
    ]);
    const n = coachHero(s, call);
    expect(n.ok).toBe(false);
    expect(n.title.length).toBeLessThanOrEqual(40);
    expect(n.detail.length).toBeLessThanOrEqual(180);
  });

  it("is quick enough for the browser", () => {
    let s = deal(table(), 0, 8);
    s = play(s, [
      [3, call],
      [4, call],
      [5, call],
      [0, call],
      [1, call],
      [2, check],
      [1, raise(30)],
      [2, call],
      [3, call],
      [4, call],
      [5, call],
    ]);
    const t0 = performance.now();
    coachHero(s, call);
    expect(performance.now() - t0).toBeLessThan(400);
  });
});
