/**
 * Per-spot accuracy for the reference charts: how often the player has seen each chart
 * cell and how often they got it wrong, across drills and live play. Pure functions over
 * the stored Progress so the charts and tests share one definition.
 */
import type { Progress } from "./store";

export interface KeyRecord {
  seen: number;
  missed: number;
}

export type AccuracyState = "unseen" | "solid" | "shaky" | "leak";

export const ACCURACY_LABEL: Record<AccuracyState, string> = {
  unseen: "Not seen yet",
  solid: "Mostly right",
  shaky: "Shaky",
  leak: "Leak",
};

type Records = Map<string, KeyRecord>;

function add(map: Records, key: string, ok: boolean) {
  const r = map.get(key) ?? { seen: 0, missed: 0 };
  r.seen++;
  if (!ok) r.missed++;
  map.set(key, r);
}

/** Blackjack chart cells ("hard-16-10") from drill answers and graded live decisions. */
export function blackjackRecords(p: Pick<Progress, "drills" | "bjRounds">): Records {
  const map: Records = new Map();
  for (const d of p.drills) if (d.game === "blackjack" && d.key !== "insurance") add(map, d.key, d.ok);
  for (const r of p.bjRounds) for (const d of r.decisions) if (d.spot !== "insurance") add(map, d.spot, d.ok);
  return map;
}

/** Poker pre-flop opening answers, keyed "pre-BTN-AKs". */
export function pokerRecords(p: Pick<Progress, "drills">): Records {
  const map: Records = new Map();
  for (const d of p.drills) if (d.game === "poker" && d.key.startsWith("pre-")) add(map, d.key, d.ok);
  return map;
}

/** Sum the records of several keys (a chart row like "17+" covers hard 17 to 21). */
export function combine(map: Records, keys: readonly string[]): KeyRecord {
  const out = { seen: 0, missed: 0 };
  for (const k of keys) {
    const r = map.get(k);
    if (r) {
      out.seen += r.seen;
      out.missed += r.missed;
    }
  }
  return out;
}

/** Bucket a record: under 15% misses is solid, 40% or more is a leak, anything between is shaky. */
export function accuracyState(r: KeyRecord | undefined): AccuracyState {
  if (!r || r.seen === 0) return "unseen";
  const miss = r.missed / r.seen;
  if (miss >= 0.4) return "leak";
  if (miss >= 0.15) return "shaky";
  return "solid";
}
