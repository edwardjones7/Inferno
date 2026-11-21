/**
 * Rule-based baselines the leak model is compared against. Both report leaks as
 * "game|family|dir" keys, the level the evaluation scores.
 *
 * - anyMiss: what the coach does today. Every deviation from the chart is flagged, so any
 *   situation with at least one miss in a direction counts as a leak.
 * - rateRule: the rule a developer would write next. Flag a cell (family or position level)
 *   when it has at least `minK` misses and the miss rate is more than `ratio` times the
 *   population's pooled rate there. No shrinkage, no model of normal variation.
 */
import type { DecisionRow } from "../decisions";
import { countCells, parseCellId } from "./model";

export const keyOf = (game: string, family: string, dir: number) => `${game}|${family}|${dir}`;

export function anyMiss(rows: readonly DecisionRow[]): Set<string> {
  const out = new Set<string>();
  for (const c of countCells(rows).values()) if (c.group === undefined && c.k > 0) out.add(keyOf(c.game, c.family, c.dir));
  return out;
}

/** Pooled miss rate per cell across a population (the rate rule's notion of normal). */
export function pooledRates(players: readonly (readonly DecisionRow[])[]): Record<string, number> {
  const t: Record<string, { n: number; k: number }> = {};
  for (const rows of players)
    for (const c of countCells(rows).values()) {
      const x = (t[c.id] ??= { n: 0, k: 0 });
      x.n += c.n;
      x.k += c.k;
    }
  return Object.fromEntries(Object.entries(t).map(([id, x]) => [id, (x.k + 0.5) / (x.n + 1)]));
}

export interface RateRule {
  minK: number;
  ratio: number;
}

export function rateRule(rows: readonly DecisionRow[], pooled: Record<string, number>, rule: RateRule): Set<string> {
  const out = new Set<string>();
  for (const c of countCells(rows).values()) {
    if (c.k < rule.minK) continue;
    const { game, family, dir } = parseCellId(c.id);
    const base = pooled[c.id] ?? pooled[`${game}|${family}|*|${dir}`] ?? 0.05;
    if (c.k / c.n > rule.ratio * base) out.add(keyOf(c.game, c.family, c.dir));
  }
  return out;
}
