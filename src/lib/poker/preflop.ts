/**
 * Pre-flop response charts for 6-max cash, 100bb deep: what to do when someone has already
 * raised. Opening (raise-first-in) ranges live in ranges.ts.
 *
 * Source assumptions
 * - Format: 6-max No-Limit Hold'em cash game, 100bb effective stacks.
 * - Rake: online-style, about 5% capped. Rake punishes flatting and small pots, so the
 *   charts flat less (especially out of position) and 3-bet-or-fold more than rake-free
 *   solver output would.
 * - Sizes: opens 2.5bb (small blind 3bb). 3-bets about 3x in position (7.5bb) and about
 *   3.5-4x out of position (10-11bb from the blinds). 4-bets about 2.2-2.5x the 3-bet.
 * - Calibration: total big-blind defence (call + 3-bet) is about 32% vs UTG, 35% vs HJ, 45%
 *   vs CO and 62% vs BTN, in line with widely published 100bb 6-max solver outputs (e.g. GTO
 *   Wizard's cash charts put the BB at roughly 30-35% vs UTG and 55-65% vs BTN). Cold-call
 *   ranges (HJ/CO/BTN) are kept small, as rake-aware charts are.
 * - Basis: simplified from widely published solver-approximated 100bb 6-max charts. Every
 *   hand shows the dominant action. Hands that solvers genuinely mix between two actions
 *   are listed in `mixed`; the drills and the coach accept only the dominant action but say
 *   the spot is close. When unsure, the chart takes the conservative (tighter) answer.
 * - The small blind plays 3-bet or fold against every open (no flatting), the standard
 *   simplified strategy: a flat out of position with the big blind still to act loses money.
 *
 * None of this is exact solver output; it is a sound, mainstream baseline for learning.
 */
import { combosOf, OPEN_RANGES, parseRange, POSITION_NAME, POSITIONS, rangePercent, type Position } from "./ranges";

/** Every seat at a 6-max table, in pre-flop action order. */
export type Seat = Position | "BB";
export const SEATS: Seat[] = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
export const SEAT_NAME: Record<Seat, string> = { ...POSITION_NAME, BB: "Big blind" };
export const seatIndex = (s: Seat) => SEATS.indexOf(s);
export const isSeat = (v: unknown): v is Seat => typeof v === "string" && (SEATS as string[]).includes(v);
export const isPosition = (v: unknown): v is Position => typeof v === "string" && (POSITIONS as string[]).includes(v);

/** "raise" means 3-bet when facing an open and 4-bet when facing a 3-bet. */
export type ResponseAction = "raise" | "call" | "fold";

export interface ChartSpec {
  raise: string;
  call: string;
  /** hands where solvers mix between the shown action and another one */
  mixed?: string;
  note: string;
}

export interface ResponseChart {
  raise: Set<string>;
  call: Set<string>;
  mixed: Set<string>;
  spec: ChartSpec;
}

const build = (spec: ChartSpec): ResponseChart => ({
  raise: parseRange(spec.raise),
  call: parseRange(spec.call),
  mixed: parseRange(spec.mixed ?? ""),
  spec,
});

/* ------------------------------------------------------------------ facing an open */

/**
 * Keyed `${hero}v${opener}`. Value 3-bets are the top of the range; the bluffs are hands
 * with blockers (suited wheel aces block AA/AK) or good playability (suited connectors).
 */
export const VS_OPEN_SPECS: Record<string, ChartSpec> = {
  // ---- versus an under-the-gun open (~18%)
  HJvUTG: {
    raise: "QQ+, AKs, AKo, AQs, A5s, A4s",
    call: "88-JJ, AJs, ATs, KQs, KJs, QJs, JTs",
    mixed: "JJ, AQs, AQo, 77, T9s, KQs",
    note: "UTG's range is strong and four players are still to act, so continue tight. Flat only hands that play well in position.",
  },
  COvUTG: {
    raise: "QQ+, AKs, AKo, AQs, A5s, A4s",
    call: "77-JJ, AJs, ATs, KQs, KJs, QJs, JTs, T9s, AQo",
    mixed: "JJ, AQs, AQo, 77, T9s",
    note: "Still tight against UTG. AQo and the suited broadways flat in position; small pairs below 77 can't set-mine profitably with three players behind.",
  },
  BTNvUTG: {
    raise: "QQ+, AKs, AKo, AQs, A5s, A4s",
    call: "22-JJ, AJs, ATs, KQs, KJs, KTs, QJs, QTs, JTs, T9s, 98s, 87s, 76s, AQo",
    mixed: "22-44, JJ, AQs, 76s, KQo, AJo",
    note: "Position lets the button flat more: pairs to set-mine and suited hands that make strong draws. Offsuit hands like AJo and KQo are dominated by UTG and fold.",
  },
  SBvUTG: {
    raise: "TT+, AJs+, AKo, KQs, A5s, A4s",
    call: "",
    mixed: "TT, AJs, KQs, AQo, 99",
    note: "Small blind: 3-bet or fold. Against UTG that means a tight value range plus a few suited-ace bluffs.",
  },
  BBvUTG: {
    raise: "QQ+, AKs, AKo, AQs, A5s, A4s",
    call: "22-JJ, A2s, A3s, A6s-AJs, K2s-KQs, Q6s-QJs, J7s-JTs, T7s-T9s, 96s-98s, 85s-87s, 74s-76s, 63s-65s, 53s-54s, 43s, A9o-AQo, KTo-KQo, QTo-QJo, JTo, T9o",
    mixed: "JJ, AQs, KQs, K2s-K4s, A9o, KTo, QTo, T9o, 22-33, 63s",
    note: "You close the action and need only about 27% equity to call 1.5bb, so even against UTG's strong range the big blind defends about a third of its hands: pairs, most suited hands and the better offsuit broadways.",
  },
  // ---- versus a hijack open (~23%)
  COvHJ: {
    raise: "TT+, AJs+, KQs, AQo+, A5s, A4s",
    call: "77-99, ATs, KJs, QJs, JTs, T9s",
    mixed: "TT, AJs, KQs, AQo, 66, 98s",
    note: "Mostly 3-bet or fold with the button and blinds behind. A small flatting range of pairs and suited broadways.",
  },
  BTNvHJ: {
    raise: "TT+, AJs+, KQs, KJs, AQo+, A5s, A4s, A3s",
    call: "22-99, A9s-ATs, KTs, QJs, QTs, JTs, J9s, T9s, 98s, 87s, 76s, 65s, AJo, KQo",
    mixed: "TT, KJs, A3s, AJo, KQo, 22-44",
    note: "In position against a medium range: 3-bet value and blockers, flat pairs and suited hands that play well after the flop.",
  },
  SBvHJ: {
    raise: "99+, ATs+, KJs+, QJs, AJo+, A5s, A4s",
    call: "",
    mixed: "99, ATs, QJs, AJo, KQo",
    note: "Small blind: 3-bet or fold. Slightly wider than against UTG.",
  },
  BBvHJ: {
    raise: "TT+, AJs+, KQs, AKo, A5s, A4s",
    call: "22-99, A2s, A3s, A6s-ATs, K2s-KJs, Q5s-QJs, J6s-JTs, T6s-T9s, 95s-98s, 84s-87s, 74s-76s, 63s-65s, 53s-54s, 43s, A9o-AQo, KTo-KQo, QTo-QJo, J9o-JTo, T9o",
    mixed: "TT, AJs, KQs, AQo, K2s-K4s, A9o, J9o, 95s",
    note: "A bit wider than against UTG, about 35% in all: every suited king, most suited hands, and offsuit broadways down to A9o and T9o.",
  },
  // ---- versus a cutoff open (~29%)
  BTNvCO: {
    raise: "99+, ATs+, KJs+, QJs, AJo+, KQo, A5s, A4s, A3s, 76s, 65s",
    call: "22-88, A2s, A6s-A9s, K9s-KTs, Q9s-QTs, J9s-JTs, T8s-T9s, 98s, 87s, ATo, KJo, QJo",
    mixed: "99, ATs, KQo, AJo, 76s, 65s, A3s, 22-44",
    note: "The button 3-bets the cutoff often, about 10%: value from 99 and AJ, bluffs with suited aces and connectors. Flat the rest of the playable hands in position.",
  },
  SBvCO: {
    raise: "88+, A8s+, A5s, A4s, KTs+, QTs+, JTs, AJo+, KQo",
    call: "",
    mixed: "88, A8s, QTs, JTs, AJo, KQo, ATo, 77",
    note: "Small blind: 3-bet or fold, about 11% against a cutoff open.",
  },
  BBvCO: {
    raise: "TT+, ATs+, KJs+, QJs, AQo+, A5s, A4s",
    call: "22-99, A2s, A3s, A6s-A9s, K2s-KTs, Q2s-QTs, J4s-JTs, T5s-T9s, 95s-98s, 84s-87s, 73s-76s, 63s-65s, 52s-54s, 43s, A5o-AJo, K8o-KQo, Q8o-QJo, J8o-JTo, T9o, 98o",
    mixed: "TT, ATs, QJs, AQo, A5o-A6o, K8o, Q8o, J8o, 98o, 52s",
    note: "The cutoff opens wider, so the big blind defends about 45%: almost every suited hand, weak aces and most offsuit broadways.",
  },
  // ---- versus a button open (~47%)
  SBvBTN: {
    raise: "77+, A2s+, K9s+, QTs+, JTs, T9s, ATo+, KJo+",
    call: "",
    mixed: "77, 66, A2s, K9s, T9s, ATo, KJo, QJo",
    note: "Small blind against the button: 3-bet about 15% or fold. Flatting invites the big blind to squeeze and leaves you out of position.",
  },
  BBvBTN: {
    raise: "88+, ATs+, A2s-A5s, KTs+, QJs, AJo+, KQo, 65s, 54s",
    call: "22-77, A6s-A9s, K2s-K9s, Q2s-QTs, J2s-JTs, T3s-T9s, 93s-98s, 83s-87s, 73s-76s, 62s-64s, 52s-53s, 43s, A2o-ATo, K2o-KJo, Q7o-QJo, J7o-JTo, T7o-T9o, 97o-98o, 87o",
    mixed: "88, A2s, 65s, 54s, AJo, KQo, K2o-K4o, Q7o, J7o, T7o, 97o, 93s, 62s",
    note: "The widest defence: you close the action, need about 27%, and the button opens almost half its hands. Defend about 60% of your hands, 3-betting about 11%.",
  },
  // ---- versus a small-blind open (~43%, 3bb)
  BBvSB: {
    raise: "88+, ATs+, A5s, A4s, A3s, KTs+, QTs+, JTs, AJo+, KJo+, 76s, 65s",
    call: "22-77, A2s, A6s-A9s, K2s-K9s, Q2s-Q9s, J4s-J9s, T6s-T9s, 96s-98s, 85s-87s, 74s-75s, 63s-64s, 53s-54s, 43s, A2o-ATo, K5o-KTo, Q9o-QJo, J9o-JTo, T8o-T9o, 97o-98o, 87o",
    mixed: "88, ATs, KJo, 76s, 65s, K5o, 97o",
    note: "Against a 3bb small-blind open you need about 33%, but you have position for the whole hand: defend about half your hands.",
  },
};

/** Every (hero, opener) pair the charts cover: hero acts after the opener. */
export const VS_OPEN_SPOTS: { hero: Seat; opener: Position }[] = POSITIONS.flatMap((opener) =>
  SEATS.filter((h) => seatIndex(h) > seatIndex(opener)).map((hero) => ({ hero, opener })),
);

const VS_OPEN: Record<string, ResponseChart> = Object.fromEntries(Object.entries(VS_OPEN_SPECS).map(([k, v]) => [k, build(v)]));

/** Chart for `hero` facing an open from `opener`, or null when hero acts before the opener. */
export function vsOpenChart(hero: Seat, opener: Position): ResponseChart | null {
  return VS_OPEN[`${hero}v${opener}`] ?? null;
}

/* ------------------------------------------------------------------ facing a 3-bet */

/**
 * You opened and someone 3-bet. Keyed by your seat and whether you'll be out of position
 * (the 3-bettor sits behind you: HJ/CO/BTN) or in position (the 3-bet came from a blind).
 * Every hand here is inside the opener's own range.
 */
export const VS_3BET_SPECS: Record<string, ChartSpec> = {
  "UTG-oop": {
    raise: "KK+, AKs, A5s",
    call: "88-QQ, AKo, AQs, AJs, ATs, KQs, KJs, QJs, JTs, T9s",
    mixed: "QQ, AKo, A5s, 88, ATs, T9s",
    note: "UTG's range is strong, so it defends a fair share of it even out of position. 4-bet the nuts and a suited-ace bluff; QQ and AKo call.",
  },
  "UTG-ip": {
    raise: "KK+, AKs, A5s, A4s",
    call: "77-QQ, AKo, AQo, ATs-AQs, KJs-KQs, QJs, JTs, T9s",
    mixed: "QQ, AKo, AQo, 77, T9s",
    note: "Against a 3-bet from the blinds you'll have position after the flop, so you can call a little wider.",
  },
  "HJ-oop": {
    raise: "KK+, AKs, A5s, A4s",
    call: "77-QQ, AKo, ATs-AQs, KTs-KQs, QJs, JTs, T9s, 98s, 87s",
    mixed: "QQ, AKo, 77, KTs, 87s, AQo",
    note: "Out of position against a 3-bet from the cutoff or button: continue with pairs, strong suited hands and AK. Offsuit hands like AQo mostly fold.",
  },
  "HJ-ip": {
    raise: "KK+, AKs, A5s, A4s",
    call: "66-QQ, AKo, AQo, A9s-AQs, KTs-KQs, QTs-QJs, JTs, T9s, 98s, 87s",
    mixed: "QQ, AKo, 66, A9s, QTs",
    note: "In position against a blind 3-bet: a wider call, still mostly pairs and suited hands.",
  },
  "CO-oop": {
    raise: "QQ+, AKs, AKo, A5s, A4s",
    call: "55-JJ, AQo, A9s-AQs, KTs-KQs, QTs-QJs, J9s, JTs, T9s, 98s, 87s, 76s, 65s",
    mixed: "QQ, AKo, 55, A9s, AQo, J9s, 65s",
    note: "The button 3-bets the cutoff wide, so the cutoff 4-bets more for value (QQ+, AK) and defends more than an early seat would.",
  },
  "CO-ip": {
    raise: "QQ+, AKs, AKo, A5s, A4s",
    call: "44-JJ, AQo, KQo, A9s-AQs, K9s-KQs, Q9s-QJs, J9s-JTs, T8s-T9s, 98s, 87s, 76s, 65s",
    mixed: "QQ, AKo, 44, KQo, K9s, T8s",
    note: "In position against a blind 3-bet, the cutoff calls with most pairs and suited hands.",
  },
  "BTN-ip": {
    raise: "QQ+, AKs, AKo, A5s, A4s, A3s",
    call: "22-JJ, A2s, A6s-AQs, AJo-AQo, K8s-KQs, KJo-KQo, Q9s-QJs, J8s-JTs, T8s-T9s, 97s-98s, 86s-87s, 75s-76s, 64s-65s, 54s",
    mixed: "QQ, AKo, A3s, 22-33, KJo, AJo, K8s, 64s",
    note: "The button opens wide and has position, so it defends almost half its range against a blind 3-bet.",
  },
  "SB-oop": {
    raise: "QQ+, AKs, AKo, A5s, A4s",
    call: "22-JJ, A2s-A3s, A6s-AQs, AJo-AQo, KQo, K8s-KQs, Q9s-QJs, J9s-JTs, T8s-T9s, 98s, 87s, 76s, 65s",
    mixed: "QQ, AKo, 22-44, AJo, KQo, K8s",
    note: "The big blind 3-bets the small blind wide, so the small blind defends a lot even out of position.",
  },
};

const VS_3BET: Record<string, ResponseChart> = Object.fromEntries(Object.entries(VS_3BET_SPECS).map(([k, v]) => [k, build(v)]));

/** True when `threeBettor` is a blind, so the opener will have position after the flop. */
export const openerInPosition = (opener: Position, threeBettor: Seat) => opener !== "SB" && (threeBettor === "SB" || threeBettor === "BB");

export function vs3betKey(opener: Position, threeBettor: Seat): string {
  if (opener === "SB") return "SB-oop";
  return `${opener}-${openerInPosition(opener, threeBettor) ? "ip" : "oop"}`;
}

/** Chart for the opener facing a 3-bet, or null when the 3-bettor acts before the opener. */
export function vs3betChart(opener: Position, threeBettor: Seat): ResponseChart | null {
  if (seatIndex(threeBettor) <= seatIndex(opener)) return null;
  return VS_3BET[vs3betKey(opener, threeBettor)] ?? null;
}

/** Every (opener, 3-bettor) pair. */
export const VS_3BET_SPOTS: { hero: Position; villain: Seat }[] = POSITIONS.flatMap((hero) =>
  SEATS.filter((v) => seatIndex(v) > seatIndex(hero)).map((villain) => ({ hero, villain })),
);

/* ------------------------------------------------------------------ typical re-raise ranges */

/**
 * The 3-bet and 4-bet ranges to assume when the seats don't pin down a chart, derived from
 * the charts above so there is one source of truth: a ~10% button 3-bet against a cutoff
 * open (99+/AJ+/KQ for value, suited aces and connectors as bluffs), and the cutoff's 4-bet
 * against it (QQ+/AK for value, A5s/A4s as blocker bluffs).
 */
export const THREE_BET_NOTATION = VS_OPEN_SPECS.BTNvCO.raise;
export const FOUR_BET_NOTATION = VS_3BET_SPECS["CO-oop"].raise;
/** The same ranges as sets (the very chart sets, so identity checks hold). */
export const THREE_BET = VS_OPEN.BTNvCO.raise;
export const FOUR_BET = VS_3BET["CO-oop"].raise;

/* ------------------------------------------------------------------ rarer spots (coach and bots only) */

/**
 * Facing a 3-bet when you did NOT open: you cold-called or limped and got squeezed, or a
 * 3-bet came in before you acted. Simplified to premiums only; cold-calling 3-bets is a
 * small, advanced part of real strategies.
 */
export const COLD_VS_3BET = build({
  raise: "QQ+, AKs, AKo",
  call: "TT-JJ, AQs",
  mixed: "QQ, AKo, TT, AQs",
  note: "Facing a 3-bet without having opened: continue only with premiums.",
});

/** You 3-bet and got 4-bet (about 22-25bb). Jam the top, call QQ and AKo, fold the rest. */
export const VS_4BET = build({
  raise: "KK+, AKs",
  call: "QQ, AKo",
  mixed: "AKs, QQ, JJ",
  note: "Against a 4-bet at 100bb: jam AA and KK (AKs too), call QQ and AKo, and fold JJ and the bluffs.",
});

/** Credited ranges for lines the charts don't spell out. */
export const LINE_RANGES = {
  /** a 4-bet from someone who didn't open (cold 4-bet): value-heavy */
  cold4bet: parseRange("QQ+, AKs, AKo, A5s"),
  /** a 5-bet (usually all-in at 100bb) */
  fiveBet: parseRange("KK+, AKs"),
  /** called a 4-bet */
  call4bet: parseRange("QQ+, AKs, AKo"),
  /** limped (called the big blind): hands too weak to raise, minus the ones that fold */
  limp: parseRange("22-99, A2s-AJs, K2s-KJs, Q5s-QJs, J7s-JTs, T7s-T9s, 96s-98s, 85s-87s, 75s-76s, 64s-65s, 54s, A2o-AJo, K9o-KQo, QTo-QJo, JTo"),
  /** the big blind checked its option in a limped pot: everything but its raises */
  bbCheck: parseRange("22-66, A2s-A8s, K2s-KTs, Q2s-QJs, J2s-JTs, T2s-T9s, 92s+, 82s+, 72s+, 62s+, 52s+, 42s+, 32s, A2o-ATo, K2o-KJo, Q2o-QJo, J2o-JTo, T2o-T9o, 92o+, 82o+, 72o+, 62o+, 52o+, 42o+, 32o"),
  /** the big blind's raise over limpers (isolation): value */
  bbIso: parseRange("77+, A9s+, KTs+, QJs, AJo+, KQo"),
  /** a flat from a seat whose chart says 3-bet or fold (e.g. a small-blind call) */
  offChartFlat: parseRange("22-JJ, A9s-AQs, KTs+, QTs+, JTs, T9s, 98s, AJo-AQo, KQo"),
  /** fallback when a 3-bet doesn't fit a chart */
  generic3bet: parseRange("TT+, AQs+, AKo, KQs, A5s, A4s"),
} as const;

/* ------------------------------------------------------------------ lookups and explanations */

export function actionOf(chart: ResponseChart, code: string): ResponseAction {
  return chart.raise.has(code) ? "raise" : chart.call.has(code) ? "call" : "fold";
}

/** Share of all starting hands in a set, rounded (for prose). */
export const widthOf = (r: Set<string>) => Math.round(rangePercent(r));
export const combosIn = (r: Set<string>) => [...r].reduce((n, c) => n + combosOf(c), 0);

/** Equity the big blind needs to call an open (pot odds): 1.5bb into 4bb, or 2bb into 4bb vs the SB's 3bb. */
export const bbPrice = (opener: Position) => (opener === "SB" ? 2 / 6 : 1.5 / 5.5);

/** 3-bets that are for value against an opener from this seat; the rest of a 3-bet range is bluffs. */
const VALUE_3BET: Record<Position, Set<string>> = {
  UTG: parseRange("QQ+, AKs, AKo, AQs"),
  HJ: parseRange("TT+, AJs+, AKo, AQo, KQs"),
  CO: parseRange("99+, ATs+, KJs+, AJo+, KQo"),
  BTN: parseRange("88+, ATs+, KTs+, QJs, ATo+, KJo+"),
  SB: parseRange("88+, ATs+, KTs+, QTs+, AJo+, KJo+"),
};
const VALUE_4BET = parseRange("QQ+, AKs, AKo");

export const isValue3bet = (opener: Position, code: string) => VALUE_3BET[opener].has(code);

const seatWord = (s: Seat) => (s === "BB" ? "big blind" : s === "SB" ? "small blind" : SEAT_NAME[s].toLowerCase());

/** One or two sentences explaining the chart answer for `hero` facing an open from `opener`. */
export function explainVsOpen(hero: Seat, opener: Position, code: string): { action: ResponseAction; why: string; mixed: boolean } {
  const chart = vsOpenChart(hero, opener)!;
  const action = actionOf(chart, code);
  const mixed = chart.mixed.has(code);
  const ip = hero !== "SB" && hero !== "BB";
  let why: string;
  if (action === "raise") {
    why = isValue3bet(opener, code)
      ? `3-bet for value: ${code} is ahead of most of a ${opener} opening range and wants a bigger pot.`
      : code[0] === "A" && code.endsWith("s")
        ? `3-bet as a bluff: the ace blocks AA and AK, and a suited ace still has equity when called.`
        : `3-bet as a bluff: it blocks some strong hands and plays well when called, but is too weak to just flat.`;
  } else if (action === "call") {
    why =
      hero === "BB"
        ? `Defend: you close the action and need only ${Math.round(bbPrice(opener) * 100)}% equity, and ${code} plays well enough against a ${opener} range, but it's not strong enough to 3-bet.`
        : `Call: ${code} plays well in position against a ${opener} open but is not strong enough to 3-bet for value.`;
  } else if (hero === "SB") {
    why = `From the small blind it's 3-bet or fold. ${code} isn't strong enough to 3-bet against a ${opener} open, and flatting out of position with the big blind behind loses money.`;
  } else {
    why = `Fold: against a ${opener} open (about ${widthOf(OPEN_RANGES[opener])}% of hands) ${code} is dominated too often${ip ? "" : " and plays badly out of position"}.`;
  }
  if (mixed) why += " Solvers mix this hand; the main play is shown.";
  return { action, why, mixed };
}

/** Explanation for the opener `hero` facing a 3-bet from `villain`. */
export function explainVs3bet(hero: Position, villain: Seat, code: string): { action: ResponseAction; why: string; mixed: boolean } {
  const chart = vs3betChart(hero, villain)!;
  const action = actionOf(chart, code);
  const mixed = chart.mixed.has(code);
  const ip = openerInPosition(hero, villain);
  let why: string;
  if (action === "raise") {
    why = VALUE_4BET.has(code)
      ? `4-bet for value: ${code} is ahead of the ${seatWord(villain)}'s 3-bet range and happy to get the money in.`
      : `4-bet as a bluff: the ace blocks AA and AK, so they have fewer hands to continue with, and it has equity when called.`;
  } else if (action === "call") {
    why = `Call: strong enough to continue ${ip ? "in position" : "even out of position"}, but a 4-bet would fold out the hands it beats.`;
  } else {
    why = `Fold: ${code} is near the bottom of your ${hero} range. Against a 3-bet it's dominated too often${ip ? "" : " and you'd play the pot out of position"}.`;
  }
  if (mixed) why += " Solvers mix this hand; the main play is shown.";
  return { action, why, mixed };
}
