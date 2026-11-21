/**
 * The leak model (model.ts), its maths (beta.ts), the synthetic players (synth.ts) and the
 * decision pool built from the real coach (pool.ts).
 */
import { describe, expect, it } from "vitest";
import type { DecisionRow } from "../decisions";
import { seeded } from "../poker/equity";
import { anyMiss, keyOf, rateRule } from "./baselines";
import { betaCdf, betaSf, lnGamma, normalCdf } from "./beta";
import { leakDrillHref, leakTitle, leakWhere, missAction } from "./describe";
import { countCells, DEFAULT_TILT, findLeaks, fitCell, gradedOf, leakProbability, probWorse, skillOf, tiltSplit, type CellPrior, type Leak, type Priors } from "./model";
import { buildBlackjackPool, buildPokerPool } from "./pool";
import shipped from "./priors.json";
import { LEAK_LIBRARY, playerRows, population, type Profile } from "./synth";

describe("beta maths", () => {
  it("ln Γ matches factorials", () => {
    expect(Math.exp(lnGamma(5))).toBeCloseTo(24, 8);
    expect(Math.exp(lnGamma(0.5))).toBeCloseTo(Math.sqrt(Math.PI), 8);
  });

  it("incomplete beta matches closed forms", () => {
    // Beta(1,1) is uniform; Beta(2,1) has CDF x²; Beta(1,3) has CDF 1-(1-x)³
    expect(betaCdf(0.3, 1, 1)).toBeCloseTo(0.3, 10);
    expect(betaCdf(0.7, 2, 1)).toBeCloseTo(0.49, 10);
    expect(betaCdf(0.2, 1, 3)).toBeCloseTo(1 - 0.8 ** 3, 10);
    expect(betaSf(0.5, 30, 30)).toBeCloseTo(0.5, 8);
    // reference values from scipy.stats.beta
    expect(betaCdf(0.12, 50, 400)).toBeCloseTo(0.7340214143, 8);
    expect(betaCdf(0.05, 0.5, 9.5)).toBeCloseTo(0.6701231991, 8);
    expect(betaSf(0.2, 3.2, 40)).toBeCloseTo(0.0071867829, 8);
  });

  it("normal CDF", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
});

const PRIOR: CellPrior = { mu0: 0.04, m0: 100, mu1: 0.4, m1: 8, pi: 0.05, cost: 1 };

describe("leak probability", () => {
  it("stays at the prior with no data and rises with a repeated pattern", () => {
    expect(leakProbability(0, 0, PRIOR)).toBeCloseTo(0.05);
    expect(leakProbability(1, 30, PRIOR)).toBeLessThan(0.05);
    expect(leakProbability(12, 30, PRIOR)).toBeGreaterThan(0.99);
  });

  it("needs more than a couple of unlucky misses in a small sample", () => {
    expect(leakProbability(2, 6, PRIOR)).toBeLessThan(0.6);
    expect(leakProbability(2, 6, PRIOR)).toBeGreaterThan(leakProbability(1, 6, PRIOR));
  });

  it("EM recovers a planted mixture", () => {
    const rand = seeded(3);
    const data = Array.from({ length: 400 }, (_, i) => {
      const leak = i % 10 === 0;
      const rate = leak ? 0.45 : 0.03;
      const n = 40;
      let k = 0;
      for (let j = 0; j < n; j++) if (rand() < rate) k++;
      return { n, k };
    });
    const fit = fitCell(data);
    expect(fit.mu0).toBeGreaterThan(0.015);
    expect(fit.mu0).toBeLessThan(0.05);
    expect(fit.mu1).toBeGreaterThan(0.3);
    expect(fit.pi).toBeGreaterThan(0.06);
    expect(fit.pi).toBeLessThan(0.15);
  });

  it("probWorse compares two rates", () => {
    expect(probWorse(30, 100, 5, 100, 0.03)).toBeGreaterThan(0.99);
    expect(probWorse(5, 100, 5, 100, 0.03)).toBeLessThan(0.3);
  });
});

/* ------------------------------------------------------------------ rows */

let seq = 0;
function pokerRow(family: string, pos: string, best: "fold" | "call" | "raise" | "check", dir: -1 | 0 | 1, extra: Partial<DecisionRow> = {}): DecisionRow {
  const chosen = dir === 0 ? best : dir === -1 ? "fold" : "raise";
  return {
    at: seq,
    sid: "s",
    game: "poker",
    mode: "table",
    hid: `h${seq++}`,
    i: 0,
    ok: dir === 0,
    net: 0,
    cost: dir === 0 ? undefined : 2,
    poker: { family: family as never, street: "preflop", pos: pos as never, hand: "AKo", chosen, best, dir, graded: "chart", effBb: 100, opps: 1, ip: false, potBb: 10, toCallBb: 5 },
    ...extra,
  };
}

describe("opportunities", () => {
  it("a fold can't be too tight; a raise can't be too loose unless the coach sized it", () => {
    expect(gradedOf(pokerRow("vs-3bet", "CO", "fold", 0))).toMatchObject({ canTight: false, canLoose: true });
    expect(gradedOf(pokerRow("vs-3bet", "CO", "raise", 0))).toMatchObject({ canTight: true, canLoose: false });
  });

  it("spots without a single answer are not opportunities", () => {
    const r = pokerRow("vs-bet", "BB", "call", 0);
    delete r.poker!.best;
    expect(gradedOf(r)).toBeNull();
  });

  it("counts at family and position level", () => {
    const rows = [pokerRow("vs-3bet", "CO", "call", -1), pokerRow("vs-3bet", "CO", "call", 0), pokerRow("vs-3bet", "BTN", "call", 0)];
    const c = countCells(rows);
    expect(c.get("poker|vs-3bet|*|-1")).toMatchObject({ n: 3, k: 1 });
    expect(c.get("poker|vs-3bet|CO|-1")).toMatchObject({ n: 2, k: 1 });
    expect(c.get("poker|vs-3bet|*|1")).toMatchObject({ n: 3, k: 0 });
  });
});

const priors = shipped as unknown as Priors;

describe("findLeaks with the shipped priors", () => {
  const filler = (n: number) => Array.from({ length: n }, (_, i) => pokerRow(["open", "vs-open", "cbet", "vs-bet"][i % 4], ["UTG", "BTN", "BB", "CO"][i % 4], "call", 0));

  it("finds a repeated overfold and names the position", () => {
    const rows = [...filler(300), ...Array.from({ length: 24 }, (_, i) => pokerRow("vs-3bet", "CO", "call", i % 2 === 0 ? -1 : 0))];
    const r = findLeaks(rows, priors);
    const leak = r.leaks.find((l) => l.family === "vs-3bet" && l.dir === -1);
    expect(leak).toBeDefined();
    expect(leak!.group === "CO" || leak!.worst?.includes("CO")).toBe(true);
    expect(leak!.costPer100).toBeGreaterThan(0);
  });

  it("reports nothing for a clean player", () => {
    expect(findLeaks(filler(400), priors).leaks).toEqual([]);
  });

  it("a single slip is not a leak (the coach would flag it today)", () => {
    const rows = [...filler(200), pokerRow("vs-3bet", "CO", "call", -1), pokerRow("vs-3bet", "CO", "call", 0)];
    expect(findLeaks(rows, priors).leaks).toEqual([]);
    expect(anyMiss(rows).has(keyOf("poker", "vs-3bet", -1))).toBe(true);
  });

  it("the rate rule needs its minimum number of misses", () => {
    const rows = [pokerRow("vs-3bet", "CO", "call", -1), pokerRow("vs-3bet", "CO", "call", 0)];
    expect(rateRule(rows, {}, { minK: 3, ratio: 2 }).size).toBe(0);
  });
});

describe("player skill", () => {
  it("is typical for a clean player and higher for one who slips everywhere", () => {
    const p: Priors = { ...priors, scale: { strength: 20 } };
    const rand = seeded(9);
    const sloppy: DecisionRow[] = [];
    const clean: DecisionRow[] = [];
    for (let i = 0; i < 2000; i++) {
      const fam = ["open", "vs-open", "cbet", "vs-bet"][i % 4];
      sloppy.push(pokerRow(fam, "BTN", "call", rand() < 0.15 ? 1 : 0));
      clean.push(pokerRow(fam, "BTN", "call", rand() < 0.02 ? 1 : 0));
    }
    expect(skillOf(countCells(sloppy), p).poker).toBeGreaterThan(skillOf(countCells(clean), p).poker);
    expect(skillOf(countCells(clean), { ...priors, scale: undefined }).poker).toBe(1);
  });
});

describe("tilt", () => {
  it("splits decisions into the hands right after a big loss and the rest", () => {
    const rows: DecisionRow[] = [];
    let h = 0;
    const hand = (net: number, ok: boolean) => rows.push({ at: h, sid: "s", game: "poker", mode: "table", hid: `t${h++}`, i: 0, ok, net });
    hand(-50, true); // a big loss
    for (let i = 0; i < DEFAULT_TILT.window; i++) hand(0, false); // all missed while tilted
    for (let i = 0; i < 10; i++) hand(0, true); // back to normal
    const s = tiltSplit(rows, DEFAULT_TILT).poker;
    expect(s).toEqual({ k: DEFAULT_TILT.window, n: DEFAULT_TILT.window, baseK: 0, baseN: 11 });
  });
});

/* ------------------------------------------------------------------ pool + synth */

describe("decision pool and synthetic players", () => {
  // small but real: the live coach grades every option
  const pool = { poker: buildPokerPool(40, 5), blackjack: buildBlackjackPool(200, 6) };

  it("grades every available action in each recorded spot", () => {
    const d = pool.poker.flatMap((h) => h.poker!);
    expect(d.length).toBeGreaterThan(30);
    for (const x of d) {
      expect(Object.keys(x.options).length).toBeGreaterThanOrEqual(2);
      if (x.spot.best) expect(x.options[x.spot.best]?.dir).toBe(0);
    }
    const b = pool.blackjack.flatMap((h) => h.bj!);
    for (const x of b) expect(x.options[x.best as keyof typeof x.options]?.ok).toBe(true);
  }, 60_000);

  it("a player with no noise and no leaks plays the coach's line", () => {
    const profile: Profile = { id: "z", noise: 0, leaks: [], tilt: 0, pokerHands: 60, bjRounds: 60 };
    const rows = playerRows(profile, pool, 1);
    expect(rows.filter((r) => (r.poker?.best || r.bj) && r.ok === false)).toEqual([]);
  });

  it("an injected leak shows up as misses in its direction", () => {
    const spec = LEAK_LIBRARY.find((l) => l.id === "stiff-hitter")!;
    const profile: Profile = { id: "z", noise: 0, leaks: [{ spec, rate: 0.8 }], tilt: 0, pokerHands: 0, bjRounds: 300 };
    const c = countCells(playerRows(profile, pool, 2)).get("blackjack|hard|*|1")!;
    expect(c.k / c.n).toBeGreaterThan(0.2);
  });

  it("populations are reproducible", () => {
    const a = population(3, pool, 11);
    const b = population(3, pool, 11);
    expect(a.map((p) => p.rows.length)).toEqual(b.map((p) => p.rows.length));
    expect(a[0].profile).toEqual(b[0].profile);
  });
});

describe("leak descriptions", () => {
  const FAMILIES = ["open", "iso", "bb-option", "vs-open", "vs-3bet", "vs-4bet", "cold", "vs-bet", "cbet", "lead", "first-in"];
  const leak = (over: Partial<Leak>): Leak => ({ id: "x", game: "poker", family: "vs-3bet", dir: -1, n: 20, k: 8, p: 0.99, rate: 0.4, normal: 0.03, costPer100: 2, perMiss: 1, ...over });

  it("every situation the coach records has words in both directions", () => {
    for (const family of FAMILIES)
      for (const dir of [-1, 1] as const) expect(leakTitle({ game: "poker", family, dir })).not.toContain(":");
    for (const family of ["hard", "soft", "pair", "insurance"]) expect(leakTitle({ game: "blackjack", family, dir: 1 })).not.toContain(":");
  });

  it("names the action when one explains the misses, so limping isn't called opening too few or too many", () => {
    const limps = [pokerRow("open", "BTN", "raise", -1), pokerRow("open", "BTN", "fold", 1), pokerRow("open", "BTN", "fold", 1)];
    for (const r of limps) r.poker!.chosen = "call";
    const tight = leak({ family: "open", dir: -1, group: "BTN" });
    const loose = leak({ family: "open", dir: 1, group: "BTN" });
    expect(leakTitle(tight, missAction(tight, limps))).toBe("Limping hands you should raise");
    expect(leakTitle(loose, missAction(loose, limps))).toBe("Limping hands you should fold");
    // real folds keep the general wording
    const folds = [pokerRow("open", "BTN", "raise", -1)];
    expect(leakTitle(tight, missAction(tight, folds))).toBe("Opening too few hands");
  });

  it("says where it happens", () => {
    expect(leakWhere(leak({ group: "CO" }))).toBe("from the cutoff");
    expect(leakWhere(leak({ worst: ["BTN", "BB"] }))).toBe("mostly from the button and the big blind");
    expect(leakWhere(leak({ game: "blackjack", group: "soft-18" }))).toBe("on soft 18");
    expect(leakWhere(leak({ game: "blackjack", worst: ["soft-17", "soft-18"] }))).toBe("mostly on soft 17 and soft 18");
  });

  it("links poker leaks to the matching drill with the player's seat and opponent", () => {
    const rows = [pokerRow("vs-3bet", "CO", "call", -1, {})];
    rows[0].poker!.vs = "BTN";
    expect(leakDrillHref(leak({ group: "CO" }), rows)).toBe("/train/poker/?drill=vs3bet&pos=CO&vs=BTN");
    expect(leakDrillHref(leak({ family: "open", dir: 1, group: "UTG" }), [])).toBe("/train/poker/?drill=preflop&pos=UTG");
    expect(leakDrillHref(leak({ family: "cbet" }), [])).toBe("/train/poker/?drill=cbet");
  });

  it("links blackjack leaks to the chart cell missed most", () => {
    const bj = (key: string): DecisionRow => ({ at: 0, sid: "s", game: "blackjack", mode: "bj", hid: key, i: 0, ok: false, net: 0, bj: { family: "soft", key, chosen: "stand", best: "hit", dir: -1, bet: 100 } });
    const rows = [bj("soft-18-9"), bj("soft-18-9"), bj("soft-18-10")];
    expect(leakDrillHref(leak({ game: "blackjack", family: "soft", group: "soft-18" }), rows)).toBe("/train/blackjack/?spot=soft-18-9");
  });
});
