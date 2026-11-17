/**
 * Pre-flop opening (raise-first-in) ranges for 6-max cash, 100bb deep, raise-or-fold.
 *
 * Assumptions (shared with the response charts in preflop.ts): 6 players, 100bb effective,
 * online-style rake (about 5% with a cap, so flatting and limping are punished), opens to
 * 2.5bb from every seat except the small blind, which opens to 3bb. These are simplified
 * versions of widely published solver-approximated charts: the dominant action of each hand,
 * rounded to standard notation. Good defaults for learning, not exact solver output.
 *
 * Widths (share of all 1,326 combos): UTG ~18%, HJ ~23%, CO ~29%, BTN ~47%, SB ~43%.
 * Where solver charts mix (UTG 22-44, HJ A9o/QTo, CO K9o/A7o, BTN K7o/Q8o), the hand is
 * folded from the earlier seat: the conservative answer.
 */
import { rankOf, suitOf, type Card, type Suit } from "../blackjack/cards";

export const RANKS = "AKQJT98765432";
export type Position = "UTG" | "HJ" | "CO" | "BTN" | "SB";
export const POSITIONS: Position[] = ["UTG", "HJ", "CO", "BTN", "SB"];
export const POSITION_NAME: Record<Position, string> = {
  UTG: "Under the gun",
  HJ: "Hijack",
  CO: "Cutoff",
  BTN: "Button",
  SB: "Small blind",
};
/** players still to act after you when everyone before has folded */
export const BEHIND: Record<Position, number> = { UTG: 5, HJ: 4, CO: 3, BTN: 2, SB: 1 };

export const OPEN_NOTATION: Record<Position, string> = {
  UTG: "55+, A2s+, KTs+, Q9s+, J9s+, T9s, 98s, 87s, 76s, ATo+, KJo+, QJo",
  HJ: "22+, A2s+, K7s+, Q9s+, J9s+, T8s+, 98s, 87s, 76s, 65s, ATo+, KTo+, QJo, JTo",
  CO: "22+, A2s+, K5s+, Q8s+, J8s+, T7s+, 97s+, 86s+, 75s+, 64s+, 54s, A8o+, A5o, KTo+, QTo+, JTo",
  BTN: "22+, A2s+, K2s+, Q3s+, J5s+, T6s+, 96s+, 85s+, 74s+, 63s+, 53s+, 43s, A2o+, K8o+, Q9o+, J9o+, T8o+, 98o, 87o",
  SB: "22+, A2s+, K3s+, Q5s+, J6s+, T6s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o+, K9o+, Q9o+, J9o+, T9o, 98o",
};

const idx = (r: string) => RANKS.indexOf(r);

/**
 * Expand range notation into a set of hand codes. Accepts single codes ("98s"), plus
 * ("77+" = 77..AA, "K9s+" = K9s..KQs) and closed intervals in either order ("22-JJ",
 * "A2s-A5s", "KTo-K7o").
 */
export function parseRange(notation: string): Set<string> {
  const out = new Set<string>();
  for (const raw of notation.split(",").map((s) => s.trim()).filter(Boolean)) {
    const dash = /^(\w\w\w?)-(\w\w\w?)$/.exec(raw);
    if (dash) {
      const [x, y] = [dash[1], dash[2]];
      if (x[0] === x[1]) {
        const [i, j] = [idx(x[0]), idx(y[0])].sort((p, q) => p - q);
        for (let k = i; k <= j; k++) out.add(RANKS[k] + RANKS[k]);
      } else {
        const [i, j] = [idx(x[1]), idx(y[1])].sort((p, q) => p - q);
        for (let k = i; k <= j; k++) out.add(x[0] + RANKS[k] + (x[2] ?? ""));
      }
      continue;
    }
    const plus = raw.endsWith("+");
    const t = plus ? raw.slice(0, -1) : raw;
    const [a, b, kind] = [t[0], t[1], t[2] as "s" | "o" | undefined];
    if (a === b) {
      // pairs: "77+" means 77..AA
      for (let i = idx(a); i >= (plus ? 0 : idx(a)); i--) out.add(RANKS[i] + RANKS[i]);
    } else {
      // "K9s+" means K9s..KQs (second card climbs up to just below the first)
      for (let i = idx(b); i > (plus ? idx(a) : idx(b) - 1); i--) out.add(a + RANKS[i] + kind);
    }
  }
  return out;
}

export const OPEN_RANGES: Record<Position, Set<string>> = Object.fromEntries(
  POSITIONS.map((p) => [p, parseRange(OPEN_NOTATION[p])]),
) as Record<Position, Set<string>>;

/** Code for two hole cards: "AKs", "T9o", "77". */
export function handCode(a: Card, b: Card): string {
  let [r1, r2] = [rankOf(a), rankOf(b)];
  if (idx(r1) > idx(r2)) [r1, r2] = [r2, r1];
  if (r1 === r2) return r1 + r2;
  return r1 + r2 + (suitOf(a) === suitOf(b) ? "s" : "o");
}

/** The 13×13 grid in display order: pairs on the diagonal, suited above, offsuit below. */
export const GRID: string[][] = [...RANKS].map((ri, i) =>
  [...RANKS].map((rj, j) => (i === j ? ri + rj : i < j ? ri + rj + "s" : rj + ri + "o")),
);

/** All 169 hand codes. */
export const ALL_CODES: string[] = GRID.flat();

export const combosOf = (code: string) => (code.length === 2 ? 6 : code.endsWith("s") ? 4 : 12);
/** Share of all 1,326 starting hands that a range contains. */
export const rangePercent = (r: Set<string>) => ([...r].reduce((n, c) => n + combosOf(c), 0) / 1326) * 100;

const SUITS: Suit[] = ["S", "H", "D", "C"];

/** Every two-card combo of a hand code ("AKs" = 4, "AKo" = 12, "77" = 6). */
export function combosOfCode(code: string): [Card, Card][] {
  const [r1, r2] = [code[0], code[1]];
  const out: [Card, Card][] = [];
  if (r1 === r2) {
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) out.push([`${r1}${SUITS[i]}` as Card, `${r2}${SUITS[j]}` as Card]);
    return out;
  }
  for (const s1 of SUITS)
    for (const s2 of SUITS) {
      if ((code[2] === "s") !== (s1 === s2)) continue;
      out.push([`${r1}${s1}` as Card, `${r2}${s2}` as Card]);
    }
  return out;
}

/** Plain-English name of a hand code: "ace-king suited", "pocket sevens". */
export function codeName(code: string): string {
  const word: Record<string, string> = { A: "ace", K: "king", Q: "queen", J: "jack", T: "ten", "9": "nine", "8": "eight", "7": "seven", "6": "six", "5": "five", "4": "four", "3": "three", "2": "two" };
  const plural: Record<string, string> = { A: "aces", K: "kings", Q: "queens", J: "jacks", T: "tens", "9": "nines", "8": "eights", "7": "sevens", "6": "sixes", "5": "fives", "4": "fours", "3": "threes", "2": "twos" };
  if (code.length === 2) return `pocket ${plural[code[0]]}`;
  return `${word[code[0]]}-${word[code[1]]} ${code[2] === "s" ? "suited" : "offsuit"}`;
}
