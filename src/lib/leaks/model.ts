/**
 * Leak detection: which mistakes does THIS player keep repeating, and how sure are we?
 *
 * Every graded decision is an opportunity to miss in a direction: too tight / passive (-1)
 * or too loose / aggressive (+1). A miss is a play the coach marks as a mistake; deviations
 * it rates fine or close (a light 3-bet, a mixed spot) don't count. Opportunities are grouped into cells:
 *   family level:   game | situation family      | dir   e.g. poker|vs-3bet|*|-1
 *   position level: game | family | pos or total  | dir   e.g. poker|vs-3bet|CO|-1, blackjack|soft|soft-18|-1
 *
 * Model (per cell): a two-component beta-binomial mixture. Across a population, a player's
 * miss rate θ in a cell comes either from the "normal" component Beta(μ0·m0, (1-μ0)·m0)
 * (everyone slips sometimes) or from the "leak" component Beta(μ1·m1, (1-μ1)·m1), with
 * prior weight π. Those parameters are fitted with EM on a population of players
 * (`fitPriors`), so the model knows what normal looks like in each spot. For one player
 * with k misses in n opportunities, the posterior probability of a leak is
 *
 *   P(leak | k, n) = π·BB(k | n, leak) / (π·BB(k | n, leak) + (1-π)·BB(k | n, normal))
 *
 * where BB is the beta-binomial likelihood. Small samples stay close to π, so a couple of
 * unlucky misses don't raise a false alarm, while a sharp pattern is caught quickly.
 * Cells above `threshold` are leaks; they're ranked by what they cost per 100 hands.
 *
 * Tilt: miss rate in the hands right after a big loss vs the player's other hands.
 *
 * Pure functions over the decision log (decisions.ts): runs on the device, offline.
 */
import type { DecisionRow } from "../decisions";
import { betaMean, lnGamma, normalCdf } from "./beta";

export type Dir = -1 | 1;

export interface CellPrior {
  /** normal component: mean miss rate and strength (pseudo-observations) */
  mu0: number;
  m0: number;
  /** leak component */
  mu1: number;
  m1: number;
  /** prior share of players with this leak */
  pi: number;
  /**
   * Average cost of one miss here, big blinds (poker) or bets (blackjack), from the coach's
   * own estimates. Absent where the coach doesn't price these mistakes: no number beats a
   * made-up one.
   */
  cost?: number;
  /** players with data in this cell when fitted */
  players?: number;
}

export interface TiltParams {
  /** a poker hand losing at least this many big blinds starts a tilt window */
  lossBb: number;
  /** a blackjack round losing at least this many opening bets starts a tilt window */
  lossBets: number;
  /** hands after the loss that count as "on tilt" */
  window: number;
  /** minimum graded decisions inside tilt windows before judging */
  minN: number;
  /** how much worse (absolute miss rate) counts as tilt */
  margin: number;
  threshold: number;
}

/** A big loss: 20bb at poker, two opening bets at blackjack; tilt is judged over the next 6 hands. */
export const DEFAULT_TILT: TiltParams = { lossBb: 20, lossBets: 2, window: 6, minN: 15, margin: 0.03, threshold: 0.9 };

export interface Priors {
  version: 1;
  /** posterior leak probability above which a cell is reported */
  threshold: number;
  /** used for cells the population never reached */
  fallback: Record<"poker" | "blackjack", CellPrior>;
  cells: Record<string, CellPrior>;
  tilt: TiltParams;
  /**
   * Per-player skill: judge each spot against how error-prone this player is overall, so a
   * generally sloppy player isn't told every spot is a leak. `strength` is how many expected
   * misses of evidence it takes to move halfway from the population (absent = off).
   */
  scale?: { strength: number };
  /** how the priors were produced (shown in reports, not used by the model) */
  meta?: Record<string, unknown>;
}

export interface CellCount {
  id: string;
  game: "poker" | "blackjack";
  family: string;
  /** position (poker) or hand total (blackjack); undefined at family level */
  group?: string;
  dir: Dir;
  /** opportunities to miss this way */
  n: number;
  /** misses this way */
  k: number;
  costSum: number;
  costN: number;
}

export interface Leak {
  id: string;
  game: "poker" | "blackjack";
  family: string;
  group?: string;
  dir: Dir;
  n: number;
  k: number;
  /** posterior probability that this is a real leak */
  p: number;
  /** this player's estimated miss rate (posterior mean) and the normal rate */
  rate: number;
  normal: number;
  /** estimated loss per 100 hands (poker: big blinds; blackjack: opening bets); absent when the coach doesn't price these misses */
  costPer100?: number;
  /** what one of these misses costs on average, in the same units */
  perMiss?: number;
  /** for a family-wide leak, the positions / totals with the most misses beyond normal (up to 2) */
  worst?: string[];
}

export interface Tilt {
  game: "poker" | "blackjack";
  /** misses / graded decisions right after a big loss */
  k: number;
  n: number;
  /** the same, everywhere else */
  baseK: number;
  baseN: number;
  /** P(miss rate after a loss is worse by more than the margin) */
  p: number;
}

export interface LeakReport {
  leaks: Leak[];
  tilt: Tilt[];
  /** how often this player slips overall, relative to the population (1 = typical) */
  skill: Record<"poker" | "blackjack", number>;
  /** every scored cell (for debugging and the evaluation harness) */
  scored: (CellCount & { p: number })[];
  hands: Record<"poker" | "blackjack", number>;
}

/* ------------------------------------------------------------------ opportunities */

const BJ_RANK: Record<string, number> = { surrender: 0, stand: 1, hit: 2, double: 3, split: 3 };

interface Graded {
  game: "poker" | "blackjack";
  family: string;
  group?: string;
  canTight: boolean;
  canLoose: boolean;
  dir?: -1 | 0 | 1;
  /** the coach's verdict: only plays it calls mistakes (false) count as misses */
  ok: boolean | null;
  cost?: number;
}

/** A row as an opportunity to miss, or null when the coach had no single answer. */
export function gradedOf(r: DecisionRow): Graded | null {
  if (r.poker) {
    const s = r.poker;
    if (!s.best) return null;
    return {
      game: "poker",
      family: s.family,
      group: s.pos,
      canTight: s.best !== "fold",
      // a raise can still be too loose when the coach recommends a size
      canLoose: s.best !== "raise" || s.bestSize !== undefined,
      dir: s.dir,
      ok: r.ok,
      cost: r.cost,
    };
  }
  if (r.bj) {
    const b = r.bj;
    const insurance = b.best === "decline";
    const rank = BJ_RANK[b.best] ?? 1;
    return {
      game: "blackjack",
      family: b.family,
      group: insurance ? undefined : b.key.split("-").slice(0, 2).join("-"),
      canTight: !insurance && rank > 0,
      canLoose: insurance || rank < 3,
      dir: b.dir,
      ok: r.ok,
      cost: r.cost,
    };
  }
  return null;
}

export const cellId = (game: string, family: string, group: string | undefined, dir: Dir) => `${game}|${family}|${group ?? "*"}|${dir}`;

export function parseCellId(id: string): { game: "poker" | "blackjack"; family: string; group?: string; dir: Dir } {
  const [game, family, group, dir] = id.split("|");
  return { game: game as "poker" | "blackjack", family, group: group === "*" ? undefined : group, dir: Number(dir) as Dir };
}

/** Count opportunities and misses per cell, at family and position level. */
export function countCells(rows: readonly DecisionRow[]): Map<string, CellCount> {
  const cells = new Map<string, CellCount>();
  const bump = (g: Graded, group: string | undefined, dir: Dir) => {
    const id = cellId(g.game, g.family, group, dir);
    let c = cells.get(id);
    if (!c) {
      c = { id, game: g.game, family: g.family, group, dir, n: 0, k: 0, costSum: 0, costN: 0 };
      cells.set(id, c);
    }
    c.n++;
    // a miss is a play the coach calls a mistake; deviations it rates fine or close don't count
    if (g.dir === dir && g.ok === false) {
      c.k++;
      if (g.cost !== undefined) {
        c.costSum += g.cost;
        c.costN++;
      }
    }
  };
  for (const r of rows) {
    const g = gradedOf(r);
    if (!g) continue;
    for (const dir of [-1, 1] as Dir[]) {
      if (dir === -1 ? !g.canTight : !g.canLoose) continue;
      bump(g, undefined, dir);
      if (g.group) bump(g, g.group, dir);
    }
  }
  return cells;
}

/** Hands (poker) and rounds (blackjack) in the log. */
export function handsOf(rows: readonly DecisionRow[]): Record<"poker" | "blackjack", number> {
  const seen = { poker: new Set<string>(), blackjack: new Set<string>() };
  for (const r of rows) seen[r.game].add(r.hid);
  return { poker: seen.poker.size, blackjack: seen.blackjack.size };
}

/* ------------------------------------------------------------------ the mixture */

/** ln B(a, b) */
const lnBeta = (a: number, b: number) => lnGamma(a) + lnGamma(b) - lnGamma(a + b);

/** ln P(k | n) under a beta-binomial, without the binomial coefficient (it cancels). */
function lnBB(k: number, n: number, mu: number, m: number): number {
  const a = Math.max(1e-6, mu * m);
  const b = Math.max(1e-6, (1 - mu) * m);
  return lnBeta(k + a, n - k + b) - lnBeta(a, b);
}

/** Posterior probability that k misses in n opportunities come from the leak component. */
export function leakProbability(k: number, n: number, prior: CellPrior): number {
  if (n <= 0) return prior.pi;
  const l1 = Math.log(prior.pi) + lnBB(k, n, prior.mu1, prior.m1);
  const l0 = Math.log(1 - prior.pi) + lnBB(k, n, prior.mu0, prior.m0);
  const top = Math.max(l0, l1);
  return Math.exp(l1 - top) / (Math.exp(l0 - top) + Math.exp(l1 - top));
}

/** Posterior mean miss rate, mixing both components by their posterior weights. */
export function posteriorRate(k: number, n: number, prior: CellPrior, p = leakProbability(k, n, prior)): number {
  const m0 = betaMean(prior.mu0 * prior.m0 + k, (1 - prior.mu0) * prior.m0 + n - k);
  const m1 = betaMean(prior.mu1 * prior.m1 + k, (1 - prior.mu1) * prior.m1 + n - k);
  return p * m1 + (1 - p) * m0;
}

export function priorFor(priors: Priors, id: string): CellPrior {
  const hit = priors.cells[id];
  if (hit) return hit;
  const { game, family, dir } = parseCellId(id);
  return priors.cells[cellId(game, family, undefined, dir)] ?? priors.fallback[game];
}

/* ------------------------------------------------------------------ player skill */

/**
 * How error-prone this player is per game, relative to the population: the weighted median
 * over situation families of (misses + ½) / (expected misses + ½), shrunk toward 1 by
 * `strength`. The median keeps one or two real leaks from inflating it.
 */
export function skillOf(cells: ReadonlyMap<string, CellCount>, priors: Priors): Record<"poker" | "blackjack", number> {
  const out = { poker: 1, blackjack: 1 };
  const strength = priors.scale?.strength;
  if (!strength) return out;
  for (const game of ["poker", "blackjack"] as const) {
    const xs: { lr: number; w: number }[] = [];
    for (const c of cells.values()) {
      if (c.game !== game || c.group !== undefined) continue;
      const e = c.n * priorFor(priors, c.id).mu0;
      if (e > 0) xs.push({ lr: Math.log((c.k + 0.5) / (e + 0.5)), w: e });
    }
    if (!xs.length) continue;
    xs.sort((a, b) => a.lr - b.lr);
    const total = xs.reduce((s, x) => s + x.w, 0);
    let acc = 0;
    let median = xs[xs.length - 1].lr;
    for (const x of xs) {
      acc += x.w;
      if (acc >= total / 2) {
        median = x.lr;
        break;
      }
    }
    out[game] = Math.min(4, Math.max(0.5, Math.exp((median * total) / (total + strength))));
  }
  return out;
}

/** A cell's prior for a player who slips `r` times as often as typical. */
export function scaledPrior(prior: CellPrior, r: number): CellPrior {
  if (r === 1) return prior;
  const mu0 = Math.min(0.6, prior.mu0 * r);
  return { ...prior, mu0, mu1: Math.max(prior.mu1, Math.min(0.97, mu0 + 0.1)) };
}

/* ------------------------------------------------------------------ the report */

export function findLeaks(rows: readonly DecisionRow[], priors: Priors): LeakReport {
  const cells = countCells(rows);
  const hands = handsOf(rows);
  const skill = skillOf(cells, priors);
  const mine = (c: CellCount) => scaledPrior(priorFor(priors, c.id), skill[c.game]);
  const scored = [...cells.values()].map((c) => ({ ...c, p: leakProbability(c.k, c.n, mine(c)) }));
  const flagged = scored.filter((c) => c.k > 0 && c.p > priors.threshold);

  const toLeak = (c: CellCount & { p: number }): Leak => {
    const prior = priorFor(priors, c.id);
    const rate = posteriorRate(c.k, c.n, mine(c), c.p);
    // what it costs is measured against a typical player, not against this player's own average
    const normal = prior.mu0;
    // the player's own priced misses when most of them are priced, else what the population's cost
    const own = c.costN >= 3 && c.costN * 2 >= c.k ? c.costSum / c.costN : undefined;
    const { game, family, dir } = parseCellId(c.id);
    const perMiss = own ?? prior.cost ?? priors.cells[cellId(game, family, undefined, dir)]?.cost;
    const leak: Leak = { id: c.id, game: c.game, family: c.family, group: c.group, dir: c.dir, n: c.n, k: c.k, p: c.p, rate, normal };
    if (perMiss !== undefined) {
      const extraMisses = Math.max(0, rate - normal) * c.n;
      leak.perMiss = Math.round(perMiss * 100) / 100;
      leak.costPer100 = hands[c.game] > 0 ? Math.round(((extraMisses * perMiss * 100) / hands[c.game]) * 100) / 100 : 0;
    }
    return leak;
  };

  // a family-wide leak absorbs its flagged positions; otherwise positions stand alone
  const leaks: Leak[] = [];
  const families = flagged.filter((c) => c.group === undefined);
  for (const f of families) {
    const leak = toLeak(f);
    // the positions / totals behind it: those with the most misses beyond normal
    const normal = priorFor(priors, f.id).mu0 * skill[f.game];
    const worst = scored
      .filter((c) => c.group !== undefined && c.game === f.game && c.family === f.family && c.dir === f.dir)
      .map((c) => ({ g: c.group!, excess: c.k - c.n * normal }))
      .filter((x) => x.excess >= 1.5)
      .sort((a, b) => b.excess - a.excess)
      .slice(0, 2);
    if (worst.length) leak.worst = worst.map((x) => x.g);
    leaks.push(leak);
  }
  for (const c of flagged) {
    if (c.group === undefined) continue;
    if (families.some((f) => f.game === c.game && f.family === c.family && f.dir === c.dir)) continue;
    leaks.push(toLeak(c));
  }
  // costliest first; unpriced leaks after the priced ones, most certain first
  leaks.sort((a, b) => (b.costPer100 ?? -1) - (a.costPer100 ?? -1) || b.p - a.p);
  return { leaks, tilt: tiltOf(rows, priors.tilt), skill, scored, hands };
}

/* ------------------------------------------------------------------ tilt */

/** Split graded decisions into "right after a big loss" and the rest, per game. */
export function tiltSplit(rows: readonly DecisionRow[], t: TiltParams) {
  const out = { poker: { k: 0, n: 0, baseK: 0, baseN: 0 }, blackjack: { k: 0, n: 0, baseK: 0, baseN: 0 } };
  // rows are appended in play order; follow each game's hands within each session
  const state: Record<string, { hid: string; net: number; left: number }> = {};
  for (const r of rows) {
    const key = `${r.game}|${r.sid}`;
    let st = state[key];
    if (!st) st = state[key] = { hid: r.hid, net: r.net, left: 0 };
    else if (st.hid !== r.hid) {
      // the previous hand is over: a big loss opens a window over the next `window` hands
      const loss = r.game === "poker" ? -st.net >= t.lossBb : -st.net >= t.lossBets;
      st.left = loss ? t.window : Math.max(0, st.left - 1);
      st.hid = r.hid;
      st.net = r.net;
    }
    if (r.ok === null) continue;
    const g = out[r.game];
    if (st.left > 0) {
      g.n++;
      if (r.ok === false) g.k++;
    } else {
      g.baseN++;
      if (r.ok === false) g.baseK++;
    }
  }
  return out;
}

function tiltOf(rows: readonly DecisionRow[], t: TiltParams): Tilt[] {
  const split = tiltSplit(rows, t);
  const res: Tilt[] = [];
  for (const game of ["poker", "blackjack"] as const) {
    const s = split[game];
    if (s.n < t.minN || s.baseN < t.minN) continue;
    const p = probWorse(s.k, s.n, s.baseK, s.baseN, t.margin);
    if (p > t.threshold) res.push({ game, ...s, p });
  }
  return res;
}

/** P(θa − θb > margin) with θa ~ Beta(1+ka, 1+na−ka), θb ~ Beta(1+kb, 1+nb−kb) (normal approximation). */
export function probWorse(ka: number, na: number, kb: number, nb: number, margin: number): number {
  const a = [1 + ka, 1 + na - ka];
  const b = [1 + kb, 1 + nb - kb];
  const ma = a[0] / (a[0] + a[1]);
  const mb = b[0] / (b[0] + b[1]);
  const va = (a[0] * a[1]) / ((a[0] + a[1]) ** 2 * (a[0] + a[1] + 1));
  const vb = (b[0] * b[1]) / ((b[0] + b[1]) ** 2 * (b[0] + b[1] + 1));
  return normalCdf((ma - mb - margin) / Math.sqrt(va + vb));
}

/* ------------------------------------------------------------------ fitting (EM) */

export interface FitOptions {
  /** strength of the leak component (lower = wider: leaks vary a lot in severity) */
  m1: number;
  /** minimum gap between the leak and normal means */
  minGap: number;
  /** players needed in a cell to fit it; sparser cells fall back to their family */
  minPlayers: number;
  iterations: number;
}

export const DEFAULT_FIT: FitOptions = { m1: 4, minGap: 0.1, minPlayers: 8, iterations: 60 };

/**
 * Fit one cell's mixture from per-player (n, k) with EM. The leak component's strength is
 * fixed (`m1`); the normal component's strength comes from the between-player spread of
 * the players it claims (method of moments).
 */
export function fitCell(data: readonly { n: number; k: number }[], opt: FitOptions = DEFAULT_FIT): Omit<CellPrior, "cost"> {
  const useful = data.filter((d) => d.n > 0);
  const N = useful.reduce((s, d) => s + d.n, 0);
  const K = useful.reduce((s, d) => s + d.k, 0);
  const pooled = (K + 0.5) / (N + 1);
  let mu0 = Math.max(0.002, pooled * 0.7);
  let mu1 = Math.min(0.95, Math.max(mu0 + opt.minGap, pooled * 3));
  let m0 = 60;
  let pi = 0.15;
  for (let it = 0; it < opt.iterations; it++) {
    const prior = { mu0, m0, mu1, m1: opt.m1, pi };
    const r = useful.map((d) => leakProbability(d.k, d.n, prior));
    const w1 = r.reduce((s, x) => s + x, 0);
    const w0 = useful.length - w1;
    const kn = (w: (i: number) => number) => {
      let k = 0;
      let n = 0;
      useful.forEach((d, i) => {
        k += w(i) * d.k;
        n += w(i) * d.n;
      });
      return (k + 0.5) / (n + 1);
    };
    mu0 = Math.min(0.9, Math.max(0.002, kn((i) => 1 - r[i])));
    mu1 = Math.min(0.97, Math.max(mu0 + opt.minGap, kn((i) => r[i])));
    pi = Math.min(0.5, Math.max(0.01, w1 / Math.max(1, useful.length)));
    // between-player variance of the normal players' rates, beyond binomial noise
    if (w0 > 2) {
      let num = 0;
      let noise = 0;
      let wsum = 0;
      useful.forEach((d, i) => {
        const w = 1 - r[i];
        const x = d.k / d.n;
        num += w * (x - mu0) ** 2;
        noise += (w * mu0 * (1 - mu0)) / d.n;
        wsum += w;
      });
      const tau2 = (num - noise) / wsum;
      m0 = tau2 > 1e-6 ? Math.min(500, Math.max(10, (mu0 * (1 - mu0)) / tau2 - 1)) : 500;
    }
  }
  return { mu0, m0, mu1, m1: opt.m1, pi, players: useful.length };
}

/** Fit priors for every cell from a population of players' decision logs. */
/**
 * Average priced miss cost per cell across a population: only cells with at least 5 priced
 * misses where at least half the misses were priced (opening mistakes, for one, never are).
 */
export function cellCosts(players: readonly (readonly DecisionRow[])[]): Record<string, number> {
  const t = new Map<string, { sum: number; n: number; k: number }>();
  for (const rows of players)
    for (const c of countCells(rows).values()) {
      const x = t.get(c.id) ?? { sum: 0, n: 0, k: 0 };
      x.sum += c.costSum;
      x.n += c.costN;
      x.k += c.k;
      t.set(c.id, x);
    }
  const out: Record<string, number> = {};
  for (const [id, x] of t) if (x.n >= 5 && x.n * 2 >= x.k) out[id] = round4(x.sum / x.n);
  return out;
}

export function fitPriors(players: readonly (readonly DecisionRow[])[], base: Pick<Priors, "threshold" | "tilt">, opt: FitOptions = DEFAULT_FIT): Priors {
  const perCell = new Map<string, { n: number; k: number }[]>();
  for (const rows of players) {
    for (const c of countCells(rows).values()) {
      if (!perCell.has(c.id)) perCell.set(c.id, []);
      perCell.get(c.id)!.push({ n: c.n, k: c.k });
    }
  }
  const costs = cellCosts(players);
  const cells: Record<string, CellPrior> = {};
  // family level first: position-level cells with too few players fall back to them
  const ids = [...perCell.keys()].sort((a, b) => Number(!a.includes("|*|")) - Number(!b.includes("|*|")));
  for (const id of ids) {
    const data = perCell.get(id)!;
    if (data.filter((d) => d.n > 0).length < opt.minPlayers) continue;
    cells[id] = { ...fitCell(data, opt) };
    for (const k of ["mu0", "m0", "mu1", "pi"] as const) cells[id][k] = round4(cells[id][k]);
    if (costs[id] !== undefined) cells[id].cost = costs[id];
  }
  const fallback = (): CellPrior => ({ mu0: 0.05, m0: 40, mu1: 0.35, m1: opt.m1, pi: 0.1 });
  return { version: 1, threshold: base.threshold, tilt: base.tilt, fallback: { poker: fallback(), blackjack: fallback() }, cells };
}

const round4 = (x: number) => Math.round(x * 10000) / 10000;
