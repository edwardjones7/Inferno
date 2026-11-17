/**
 * The chips you push in on your turn at the poker table, kept as the actual chips (in the
 * order they went in), so the stack on the felt only ever changes at the top: tapping a
 * chip adds that chip, taking one back removes it, and a preset adds a realistic handful.
 */

const DENOMS = [1000, 500, 100, 25, 5, 1] as const;
/** how a chip breaks into smaller ones when making change */
const CHANGE: Record<number, number[]> = {
  1000: [500, 500],
  500: [100, 100, 100, 100, 100],
  100: [25, 25, 25, 25],
  25: [5, 5, 5, 5, 5],
  5: [1, 1, 1, 1, 1],
};

/** Chips per column on the felt, and how many columns fit in front of you. */
export const COLUMN = 6;
export const MAX_COLUMNS = 4;
const MAX_CHIPS = COLUMN * MAX_COLUMNS;

export const sum = (chips: readonly number[]) => chips.reduce((n, v) => n + v, 0);

/**
 * A handful of mixed chips worth exactly `amount`, the way a player grabs them: the fewest
 * chips, then big chips broken into smaller ones until there are about `target` of them
 * (never more than `cap`). Largest at the bottom.
 */
export function mixedChips(amount: number, target = 7, cap = 12): number[] {
  let left = Math.max(0, Math.round(amount));
  const out: number[] = [];
  for (const v of DENOMS) {
    while (left >= v) {
      out.push(v);
      left -= v;
    }
  }
  while (out.length < target) {
    // break the largest chip that still fits under the cap
    const i = out.findIndex((v) => CHANGE[v] && out.length - 1 + CHANGE[v].length <= cap);
    if (i < 0) break;
    out.splice(i, 1, ...CHANGE[out[i]]);
  }
  return out.sort((a, b) => b - a);
}

/** Push one more chip, unless it would go over `max`. */
export function addChip(chips: readonly number[], v: number, max: number): number[] {
  if (sum(chips) + v > max) return [...chips];
  return compact([...chips, v]);
}

/**
 * Make the stack worth `target` (a preset like "pot"): keep the chips already pushed while
 * they fit, then add a mixed handful for the rest.
 */
export function stackTo(chips: readonly number[], target: number): number[] {
  const t = Math.max(0, Math.round(target));
  const kept: number[] = [];
  let total = 0;
  for (const v of chips) {
    if (total + v > t) break;
    kept.push(v);
    total += v;
  }
  return compact(t > total ? [...kept, ...mixedChips(t - total)] : kept);
}

/** Too many chips to fit on the felt (forty 1s): change them up into fewer, mixed chips. */
function compact(chips: number[]): number[] {
  return chips.length > MAX_CHIPS ? mixedChips(sum(chips), 12, MAX_CHIPS) : chips;
}

/** The stack as short columns, filled in push order (so adding a chip never moves the others). */
export function columns(chips: readonly number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < chips.length; i += COLUMN) out.push(chips.slice(i, i + COLUMN));
  return out;
}
