/**
 * Words and drill links for the leak model's findings (model.ts): what the player keeps
 * doing, in plain language, and where to practise it.
 */
import type { DecisionRow } from "../decisions";
import type { Leak } from "./model";

type Pair = { tight: string; loose: string };

const POKER: Record<string, Pair> = {
  open: { tight: "Opening too few hands", loose: "Opening too many hands" },
  iso: { tight: "Limping or folding behind limpers", loose: "Playing weak hands behind limpers" },
  "bb-option": { tight: "Checking strong hands in a limped big blind", loose: "Raising your big-blind option too light" },
  "vs-open": { tight: "Folding too much against opens", loose: "Calling opens too wide" },
  "vs-3bet": { tight: "Folding too much to 3-bets", loose: "Continuing too wide against 3-bets" },
  "vs-4bet": { tight: "Folding too much to 4-bets", loose: "Continuing too wide against 4-bets" },
  cold: { tight: "Too tight against two raises", loose: "Too loose against two raises" },
  "vs-bet": { tight: "Folding too much to bets", loose: "Calling bets without the price" },
  cbet: { tight: "Missing c-bets and barrels", loose: "Betting too often or too big as the raiser" },
  lead: { tight: "Giving up out of position", loose: "Leading into the pre-flop raiser" },
  "first-in": { tight: "Missing value bets when checked to", loose: "Betting too often when checked to" },
};

const BLACKJACK: Record<string, Pair> = {
  hard: { tight: "Standing on hard totals you should hit or double", loose: "Hitting or doubling hard totals you should stand on" },
  soft: { tight: "Too passive with soft hands", loose: "Too aggressive with soft hands" },
  pair: { tight: "Not splitting pairs you should", loose: "Splitting pairs you shouldn't" },
  insurance: { tight: "Declining insurance", loose: "Taking insurance" },
};

export function leakTitle(l: Pick<Leak, "game" | "family" | "dir">): string {
  const pair = (l.game === "poker" ? POKER : BLACKJACK)[l.family];
  if (!pair) return `${l.family}: ${l.dir < 0 ? "too passive" : "too aggressive"}`;
  return l.dir < 0 ? pair.tight : pair.loose;
}

const POS_NAME: Record<string, string> = { UTG: "under the gun", HJ: "the hijack", CO: "the cutoff", BTN: "the button", SB: "the small blind", BB: "the big blind" };

/** Where it happens: "from the cutoff", "mostly from the button and the big blind", "on soft 18". */
export function leakWhere(l: Pick<Leak, "game" | "group" | "worst">): string | null {
  const groups = l.group ? [l.group] : (l.worst ?? []);
  if (!groups.length) return null;
  const names = groups.map((g) => (l.game === "blackjack" ? g.replace("-", " ") : (POS_NAME[g] ?? g)));
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  const word = l.game === "blackjack" ? "on" : "from";
  return `${l.group ? word : `mostly ${word}`} ${list}`;
}

/** The blackjack chart cell this leak misses most (for a focused drill). */
function worstBjCell(l: Leak, rows: readonly DecisionRow[]): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const b = r.bj;
    if (!b || b.family !== l.family || b.dir !== l.dir) continue;
    if (l.group && !b.key.startsWith(`${l.group}-`)) continue;
    counts.set(b.key, (counts.get(b.key) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [k, n] of counts) if (!best || n > counts.get(best)!) best = k;
  return best && /^(hard|soft|pair)-\d{1,2}-\d{1,2}$/.test(best) ? best : null;
}

/** The poker opponent position this leak happens against most (for the response drills). */
function commonVs(l: Leak, rows: readonly DecisionRow[], pos: string | undefined): string | undefined {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const s = r.poker;
    if (!s || s.family !== l.family || s.dir !== l.dir || !s.vs || (pos && s.pos !== pos)) continue;
    counts.set(s.vs, (counts.get(s.vs) ?? 0) + 1);
  }
  let best: string | undefined;
  for (const [k, n] of counts) if (!best || n > counts.get(best)!) best = k;
  return best;
}

const POKER_DRILL: Record<string, string> = {
  open: "preflop",
  iso: "preflop",
  "bb-option": "preflop",
  "vs-open": "vsopen",
  cold: "vsopen",
  "vs-3bet": "vs3bet",
  "vs-4bet": "vs3bet",
  "vs-bet": "potodds",
  cbet: "cbet",
  lead: "cbet",
  "first-in": "sizing",
};

/** A drill aimed at this leak, using the player's own spots to pick position and chart cell. */
export function leakDrillHref(l: Leak, rows: readonly DecisionRow[]): string {
  if (l.game === "blackjack") {
    const cell = worstBjCell(l, rows);
    return cell ? `/train/blackjack/?spot=${cell}` : "/train/blackjack/";
  }
  const drill = POKER_DRILL[l.family] ?? "preflop";
  const pos = l.group ?? l.worst?.[0];
  const q = new URLSearchParams({ drill });
  if (pos && (drill === "preflop" || drill === "vsopen" || drill === "vs3bet")) {
    if (drill === "preflop" && pos === "BB") return `/train/poker/?${q}`;
    q.set("pos", pos);
    if (drill !== "preflop") {
      const vs = commonVs(l, rows, pos);
      if (vs) q.set("vs", vs);
    }
  }
  return `/train/poker/?${q}`;
}
