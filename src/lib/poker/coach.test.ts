/**
 * Strategy tests for the live coach (table-coach.ts) and the opponent ranges behind it
 * (villain.ts). Assumptions: 6-max, 100bb (1000 chips at 5/10), 2.5bb opens, 3-bets to 8bb.
 * Expected verdicts are what standard 6-max charts and strong players agree on; spots that
 * are genuinely mixed are asserted as "not a mistake" rather than one exact answer.
 */
import { describe as group, expect, it } from "vitest";
import type { Card } from "../blackjack/cards";
import { BOT_ROSTER } from "./bots";
import { seeded } from "./equity";
import { act, newTable, positionOf, rigDeck, startHand } from "./game";
import type { CoachNote, PlayerAction, PokerState } from "./game-types";
import { BB_DEFEND, nearNuts, sizingAnswer } from "./postflop";
import { combosOf, GRID, OPEN_RANGES } from "./ranges";
import { coachHero } from "./table-coach";
import { actionsBySeat, bluffShare, equityVsHoldings, FOUR_BET, holdingOf, isValue, preflopRange, THREE_BET } from "./villain";

const h = (s: string) => s.split(" ") as Card[];
const F = { kind: "fold" } as const;
const C = { kind: "call" } as const;
const K = { kind: "check" } as const;
const R = (to: number) => ({ kind: "raise", to }) as const;

/** `startHand` moves the button one seat on, so this puts the hero (seat 0) in `pos`. */
const BUTTON_FOR: Record<string, number> = { BTN: 5, SB: 4, BB: 3, UTG: 2, HJ: 1, CO: 0 };

/**
 * Hero in `pos` with `hero` cards; `acts` are applied in table order until it's the hero's
 * turn. Seat ids clockwise from the hero: BB hero → UTG 1, HJ 2, CO 3, BTN 4, SB 5.
 */
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

const cardsFor = (code: string) => h(`${code[0]}S ${code[1]}${code[2] === "s" ? "S" : "H"}`).join(" ");

/** Share of all starting hands (by combos) the coach treats as playable (call is good or close). */
function playable(pos: string, acts: PlayerAction[]): number {
  let n = 0;
  for (const code of GRID.flat()) {
    const note = coachHero(spot(pos, cardsFor(code), acts), C);
    if (note.ok !== false) n += combosOf(code) / 1326;
  }
  return n;
}

const verdict = (n: CoachNote) => n.ok;

/* ------------------------------------------------------------------ pre-flop */

const BB_VS_BTN = [F, F, F, R(25), F];
const BB_VS_UTG = [R(25), F, F, F, F];
const HJ_VS_UTG = [R(25)];
const BTN_VS_CO = [F, F, R(25)];
const SB_VS_BTN = [F, F, F, R(25)];
const CO_VS_3BET = [F, F, R(25), R(80), F, F];

group("coach: facing a raise pre-flop", () => {
  it.each([
    ["7S 2D", false],
    ["9S 4D", false],
    ["KS 2D", true],
    ["QS 8D", "fine"],
    ["AS 2D", true],
    ["KS 5S", true],
    ["TS 6S", true],
  ] as [string, boolean | "fine"][])("big blind vs a button open: call %s → %s", (cards, ok) => {
    const v = verdict(coachHero(spot("BB", cards, BB_VS_BTN), C));
    // "fine": a standard defend that the coach may call close, but never a mistake
    if (ok === "fine") expect(v).not.toBe(false);
    else expect(v).toBe(ok);
  });

  it.each(["KS 9D", "QS JD", "2S 2D", "JS 7S"])("hijack vs UTG: cold-calling %s is a mistake", (cards) => {
    expect(coachHero(spot("HJ", cards, HJ_VS_UTG), C).ok).toBe(false);
  });

  it("hijack vs UTG: AJs is a fine call, 77 and AQo are at least close", () => {
    expect(coachHero(spot("HJ", "AS JS", HJ_VS_UTG), C).ok).not.toBe(false);
    expect(coachHero(spot("HJ", "7S 7D", HJ_VS_UTG), C).ok).not.toBe(false);
    expect(coachHero(spot("HJ", "AS QD", HJ_VS_UTG), C).ok).not.toBe(false);
  });

  it("button vs cutoff: pairs and good suited hands call, weak offsuit hands don't", () => {
    expect(coachHero(spot("BTN", "5S 5D", BTN_VS_CO), C).ok).toBe(true);
    expect(coachHero(spot("BTN", "KS 9S", BTN_VS_CO), C).ok).not.toBe(false);
    expect(coachHero(spot("BTN", "QS 7D", BTN_VS_CO), C).ok).toBe(false);
    expect(coachHero(spot("BTN", "JS 8D", BTN_VS_CO), C).ok).toBe(false);
  });

  it("small blind vs the button: flatting playable hands gets 3-bet-or-fold advice, junk is a fold", () => {
    const n = coachHero(spot("SB", "AS 9D", SB_VS_BTN), C);
    expect(n.ok).toBeNull();
    expect(n.title).toMatch(/3-bet or fold/);
    expect(coachHero(spot("SB", "8S 3D", SB_VS_BTN), C).ok).toBe(false);
  });

  it("opener facing a 3-bet: JJ and AQo continue, weak offsuit hands fold", () => {
    expect(coachHero(spot("CO", "JS JD", CO_VS_3BET), C).ok).toBe(true);
    expect(coachHero(spot("CO", "AS QD", CO_VS_3BET), C).ok).not.toBe(false);
    expect(coachHero(spot("CO", "KS 9D", CO_VS_3BET), C).ok).toBe(false);
    expect(coachHero(spot("CO", "KS 9D", CO_VS_3BET), F).ok).toBe(true);
  });

  it("premium hands re-raise rather than call, and never fold", () => {
    const call = coachHero(spot("HJ", "AS AD", HJ_VS_UTG), C);
    expect(call.ok).toBeNull();
    expect(call.title).toMatch(/3-bet/);
    expect(coachHero(spot("HJ", "AS AD", HJ_VS_UTG), F).ok).toBe(false);
    expect(coachHero(spot("HJ", "AS KD", HJ_VS_UTG), R(80)).ok).toBe(true);
    expect(coachHero(spot("CO", "QS QD", CO_VS_3BET), R(200)).ok).toBe(true);
  });

  it("3-betting junk is a mistake; A5s is a standard 3-bet bluff", () => {
    expect(coachHero(spot("HJ", "KS 9D", HJ_VS_UTG), R(80)).ok).toBe(false);
    expect(coachHero(spot("BTN", "AS 5S", BTN_VS_CO), R(80)).ok).toBe(true);
  });

  it("explains the price and position", () => {
    const n = coachHero(spot("BB", "QS 8D", BB_VS_BTN), C);
    expect(n.detail).toMatch(/BTN opening range/);
    expect(n.detail).toMatch(/out of position/);
    expect(n.detail.length).toBeLessThanOrEqual(180);
  });
});

group("coach: pre-flop calibration against standard charts", () => {
  // Solver charts at 100bb: the big blind defends ~60–65% vs a button open, ~35–40% vs UTG;
  // the hijack continues with ~10% of hands vs UTG; the button ~20–30% vs a cutoff open.
  // "Playable" here counts close spots too, so the bands sit a little above those numbers.
  it("big blind vs button defends 55–80% of hands", () => {
    const p = playable("BB", BB_VS_BTN);
    expect(p).toBeGreaterThan(0.55);
    expect(p).toBeLessThan(0.8);
  }, 60_000);

  it("big blind vs UTG defends 30–50%", () => {
    const p = playable("BB", BB_VS_UTG);
    expect(p).toBeGreaterThan(0.3);
    expect(p).toBeLessThan(0.5);
  }, 60_000);

  it("hijack vs UTG continues with under 15%", () => {
    expect(playable("HJ", HJ_VS_UTG)).toBeLessThan(0.15);
  }, 60_000);

  it("button vs cutoff continues with 20–40%", () => {
    const p = playable("BTN", BTN_VS_CO);
    expect(p).toBeGreaterThan(0.2);
    expect(p).toBeLessThan(0.4);
  }, 60_000);
});

group("coach: pre-flop, unopened and limped", () => {
  it("limping the small blind is allowed, limping elsewhere is a leak", () => {
    expect(coachHero(spot("SB", "KS 4D", [F, F, F, F]), C).ok).toBeNull();
    expect(coachHero(spot("UTG", "KS QS", []), C).ok).toBe(false);
  });

  it("behind a limper: iso-raise strong hands, limp-behind speculative ones, fold junk", () => {
    const limp = [C, F]; // CO hero: UTG limps, HJ folds
    expect(coachHero(spot("CO", "AS QD", limp), R(50)).ok).toBe(true);
    expect(coachHero(spot("CO", "AS QD", limp), C).ok).toBe(false);
    expect(coachHero(spot("CO", "7S 6S", limp), C).ok).toBeNull();
    expect(coachHero(spot("CO", "KS 4D", limp), C).ok).toBe(false);
    expect(coachHero(spot("CO", "KS 4D", limp), F).ok).toBe(true);
  });
});

/* ------------------------------------------------------------------ post-flop */

/** Big blind defends vs the button (seat 4, holding 44), BTN c-bets 20 into 55, BB calls, turn checks through, river bet. */
const river = (hero: string, bet: number) =>
  spot("BB", hero, [...BB_VS_BTN, C, K, R(20), C, K, K, K, R(bet)], "KC 9H 2D 5S 3C", { 4: "4S 4C" });
/** Same pre-flop, BB checks the flop and the button bets `bet` into 55. */
const flopBet = (hero: string, bet: number) => spot("BB", hero, [...BB_VS_BTN, C, K, R(bet)], "KH 9H 2C 5S 3D", { 4: "4S 4C" });

group("coach: facing a bet post-flop", () => {
  it("bluff-catching middle pair vs a river pot bet is close, not a mistake (the old random-hand coach called the fold a 16.8bb error)", () => {
    expect(coachHero(river("9S 8S", 95), F).ok).not.toBe(false);
    expect(coachHero(river("9S 8S", 95), C).ok).not.toBe(false);
  });

  it("top pair good kicker calls a river pot bet", () => {
    expect(coachHero(river("KS QD", 95), C).ok).toBe(true);
    expect(coachHero(river("KS QD", 95), F).ok).toBe(false);
  });

  it("describes the opponent's betting range, not random hands", () => {
    expect(coachHero(river("9S 8S", 95), C).detail).toMatch(/betting range/);
  });

  it("flop: nut flush draw continues, pure air folds", () => {
    expect(coachHero(flopBet("AH 6H", 37), C).ok).toBe(true);
    expect(coachHero(flopBet("AH 6H", 37), F).ok).toBe(false);
    expect(coachHero(flopBet("7S 6D", 18), F).ok).toBe(true);
  });
});

group("coach: unopened pots post-flop", () => {
  it("out of position to the pre-flop raiser: checking is right, leading is a mix (not 'Bluff')", () => {
    const s = spot("BB", "KS QD", [...BB_VS_BTN, C], "KC 7H 2D 3S 4C", { 4: "4S 4C" });
    expect(coachHero(s, K).ok).toBe(true);
    const lead = coachHero(s, R(30));
    expect(lead.ok).toBeNull();
    expect(lead.title).toBe("Leading out");
  });

  it("out-of-position c-bet on a dry high board: betting is good, checking isn't a mistake", () => {
    // UTG opens, the button calls, blinds fold
    const s = spot("UTG", "QS JD", [R(25), F, F, C, F, F], "KC 7H 2D 3S 4C", { 3: "4S 4C" });
    expect(coachHero(s, K).ok).toBeNull();
    expect(coachHero(s, R(20)).ok).toBe(true);
  });
});

/* ------------------------------------------------------------------ villain ranges */

group("villain ranges", () => {
  it("reads pre-flop ranges from the action", () => {
    const s = spot("CO", "AS KD", CO_VS_3BET);
    expect(preflopRange(s, 1).range).toBe(THREE_BET); // the button 3-bet
    const t = spot("BB", "AS KD", BB_VS_BTN);
    expect(preflopRange(t, 4).range).toBe(OPEN_RANGES.BTN);
    const u = spot("BB", "AS KD", [R(25), F, F, F, F, C, K, R(20)], "KC 7H 2D 3S 4C");
    expect(u.street).toBe("flop");
    expect(preflopRange(u, 0).range).toBe(BB_DEFEND);
    expect(preflopRange(u, 1).range).toBe(OPEN_RANGES.UTG);
  });

  it("reconstructs bet sizes as a fraction of the pot", () => {
    const s = river("9S 8S", 95);
    const btn = actionsBySeat(s).get(4)!;
    const bets = btn.filter((a) => a.kind === "bet");
    expect(bets.map((a) => a.street)).toEqual(["flop", "river"]);
    expect(bets[0].frac).toBeCloseTo(20 / 55, 2);
    expect(bets[1].frac).toBeCloseTo(95 / 95, 2);
  });

  it("a balanced pot-size river bet is about one third bluffs", () => {
    expect(bluffShare(1, "river", false)).toBeCloseTo(1 / 3, 5);
    expect(bluffShare(0.5, "river", false)).toBeCloseTo(0.25, 5);
    expect(bluffShare(1, "flop", false)).toBeLessThan(bluffShare(1, "river", false));
    expect(bluffShare(1, "river", true)).toBeLessThan(bluffShare(1, "river", false));
  });

  it("value thresholds tighten street by street and for raises", () => {
    expect(isValue("medium", "flop", false)).toBe(true);
    expect(isValue("medium", "turn", false)).toBe(false);
    expect(isValue("draw", "turn", false)).toBe(true);
    expect(isValue("toppair", "river", false)).toBe(true);
    expect(isValue("toppair", "river", true)).toBe(false);
    expect(isValue("strong", "river", true)).toBe(true);
  });

  it("a river bettor's range is weighted toward value with a bluff share near the target", () => {
    const s = river("9S 8S", 95);
    const hold = holdingOf(s, 4, [...s.seats[0].hole, ...s.board]);
    let air = 0;
    for (let i = 0; i < hold.combos.length; i++) {
      const w = hold.cum[i] - (i ? hold.cum[i - 1] : 0);
      const c = hold.combos[i];
      const paired = c.some((x) => s.board.some((b) => b[0] === x[0])) || c[0][0] === c[1][0];
      const straight = c.some((x) => x[0] === "4") && c.some((x) => x[0] === "A" || x[0] === "6");
      if (!paired && !straight) air += w;
    }
    const share = air / hold.total;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.4);
  });

  it("equity against explicit ranges matches known matchups", () => {
    const kk = { combos: [h("KD KC") as [Card, Card]], cum: new Float64Array([1]), total: 1, label: "KK" };
    const e = equityVsHoldings(h("AS AH"), [], [kk], 4000, seeded(3));
    expect(e).toBeGreaterThan(0.78);
    expect(e).toBeLessThan(0.86);
  });

  it("4-bet range has value and blocker bluffs", () => {
    for (const c of ["AA", "KK", "QQ", "AKs", "AKo", "A5s"]) expect(FOUR_BET.has(c)).toBe(true);
    expect(FOUR_BET.has("JJ")).toBe(false);
  });
});

/* ------------------------------------------------------------------ river sizing */

group("river value sizing", () => {
  it("overbets only near the nuts", () => {
    // nut straight on a rainbow board: pot or more
    expect(nearNuts(h("QS JD"), h("KC TH 9D 2S 3C"))).toBe(true);
    expect(sizingAnswer(h("QS JD"), h("KC TH 9D 2S 3C")).size).toBe("100");
    // a set on a four-flush board isn't near the nuts
    expect(nearNuts(h("7S 7D"), h("7H 2H 9H KH 3C"))).toBe(false);
    const sz = sizingAnswer(h("7S 7D"), h("7H 2H 9H KH 3C"));
    expect(sz.size).toBe("66");
    expect(sz.clear).toBe(false);
  });
});
