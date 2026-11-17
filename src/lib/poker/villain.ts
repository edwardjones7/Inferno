/**
 * What the live coach assumes each opponent holds, built from how they played the hand.
 *
 * Assumptions (state them when changing anything here): 6-max No-Limit Hold'em, 100bb deep,
 * opens to about 2.5bb, 3-bets to about 3x in position and 4x out of position, opponents
 * who play a sound, roughly balanced strategy. These are simplified ranges a strong player
 * would recognise, not solver output.
 *
 * Pre-flop, each player's range comes from their last voluntary action (open, 3-bet, call…).
 * Post-flop, every action re-weights that range, one street at a time:
 * - bet or raise: hands that bet for value (see `isValue`) keep full weight; everything else
 *   is scaled so it makes up the bluff share a balanced bettor has at that size
 *   (size ÷ (1 + 2 × size) on the river, less on earlier streets where draws already
 *   supply the semi-bluffs, and less again for raises). Bluffs are drawn from hands with
 *   no pair; weak pairs mostly check, so they keep only a small weight;
 * - call: pairs and draws keep full weight, no-pair hands mostly fold (floats are rare);
 * - check: the strongest hands are partly removed (they usually bet).
 */
import type { Card } from "../blackjack/cards";
import { DECK, evaluate } from "./eval";
import { positionOf, type TablePosition } from "./game";
import type { PokerState, Street } from "./game-types";
import { BB_DEFEND, combosOfCode, handClass, parseRangeWithDashes, type HandClass } from "./postflop";
import { FOUR_BET_NOTATION, LINE_RANGES, THREE_BET_NOTATION, vs3betChart, vsOpenChart, type Seat } from "./preflop";
import { GRID, OPEN_RANGES, type Position } from "./ranges";

/** Typical 3-bet range when the seats don't pick a chart (preflop.ts, ~10%). */
export const THREE_BET = parseRangeWithDashes(THREE_BET_NOTATION);
/** Typical 4-bet range: QQ+/AK for value, A5s/A4s as blocker bluffs (preflop.ts). */
export const FOUR_BET = parseRangeWithDashes(FOUR_BET_NOTATION);
/** Calling an open from a seat other than the big blind (the strongest hands 3-bet instead). */
export const COLD_CALL = parseRangeWithDashes("22-JJ, AJs-AQs, KTs+, QTs+, JTs, T9s, 98s, 87s, 76s, 65s, AQo, KQo");
/** The opener calling a 3-bet. */
export const CALL_3BET = parseRangeWithDashes("77-QQ, ATs-AKs, KJs+, QJs, JTs, T9s, AQo-AKo");
/** Calling a 4-bet (AA 5-bets). */
export const CALL_4BET = parseRangeWithDashes("JJ-KK, AQs-AKs, AKo");

const ALL_CODES = new Set(GRID.flat());

/* ------------------------------------------------------------------ reading the log */

export interface SeatAction {
  street: Street;
  kind: "bet" | "raise" | "call" | "check";
  /** pre-flop: 1 = open, 2 = 3-bet… for raises; raises faced for calls */
  level: number;
  /** bet or raise increment as a fraction of the pot before it */
  frac: number;
}

/** Every voluntary action in the hand, per seat, with sizes reconstructed from the log. */
export function actionsBySeat(s: PokerState): Map<number, SeatAction[]> {
  const out = new Map<number, SeatAction[]>();
  let street: Street = "preflop";
  let pot = 0;
  let level = 0;
  let committed = new Map<number, number>();
  for (const e of s.log) {
    if (e.seat === undefined) continue;
    if (e.street !== street) {
      street = e.street;
      committed = new Map();
      level = 0;
    }
    const rest = e.text.slice(s.seats[e.seat].name.length);
    const num = Number(/(\d+)(?: \(all-in\))?$/.exec(rest)?.[1] ?? 0);
    if (e.kind === "blind") {
      committed.set(e.seat, num);
      pot += num;
      continue;
    }
    if (e.kind !== "action") continue;
    const list = out.get(e.seat) ?? [];
    out.set(e.seat, list);
    const mine = committed.get(e.seat) ?? 0;
    if (rest.startsWith(" bets ") || rest.startsWith(" raises to ")) {
      const added = num - mine;
      const facing = Math.max(0, ...committed.values()) - mine;
      level++;
      list.push({ street, kind: rest.startsWith(" bets ") ? "bet" : "raise", level, frac: (added - facing) / Math.max(1, pot + facing) });
      committed.set(e.seat, num);
      pot += added;
    } else if (rest.startsWith(" calls ")) {
      list.push({ street, kind: "call", level, frac: 0 });
      committed.set(e.seat, mine + num);
      pot += num;
    } else if (rest.startsWith(" checks")) list.push({ street, kind: "check", level, frac: 0 });
  }
  return out;
}

/** Seats that raised pre-flop, in order (opener first), and whether someone limped before the open. */
export function preflopRaisers(s: PokerState): { raisers: number[]; limpedFirst: boolean } {
  const raisers: number[] = [];
  let limpedFirst = false;
  for (const e of s.log) {
    if (e.kind !== "action" || e.street !== "preflop" || e.seat === undefined) continue;
    const rest = e.text.slice(s.seats[e.seat].name.length);
    if (rest.startsWith(" raises to ") || rest.startsWith(" bets ")) raisers.push(e.seat);
    else if (rest.startsWith(" calls ") && raisers.length === 0) limpedFirst = true;
  }
  return { raisers, limpedFirst };
}

/**
 * Pre-flop range implied by a seat's last pre-flop action, with a short label. When the
 * seats are known (an unlimped pot), 3-bets, flats, BB defence and responses to a 3-bet come
 * from the per-seat charts in preflop.ts; otherwise from the typical ranges.
 */
export function preflopRange(s: PokerState, seatId: number, acts = actionsBySeat(s)): { range: Set<string>; label: string } {
  const pre = (acts.get(seatId) ?? []).filter((a) => a.street === "preflop");
  const last = pre[pre.length - 1];
  const pos: TablePosition = positionOf(s, seatId);
  const { raisers, limpedFirst } = preflopRaisers(s);
  const openerPos = raisers.length && !limpedFirst ? positionOf(s, raisers[0]) : null;
  const opener: Position | null = openerPos && openerPos !== "BB" ? openerPos : null;
  const vsOpen = opener ? vsOpenChart(pos as Seat, opener) : null;
  const vs3bet = opener && raisers.length >= 2 && seatId === raisers[0] ? vs3betChart(opener, positionOf(s, raisers[1]) as Seat) : null;
  if (!last || last.kind === "check") return { range: ALL_CODES, label: "any two cards" };
  if (last.kind === "raise" || last.kind === "bet") {
    if (last.level >= 4) return { range: LINE_RANGES.fiveBet, label: "a 5-bet range" };
    if (last.level === 3) return vs3bet ? { range: vs3bet.raise, label: `a ${pos} 4-bet range` } : { range: FOUR_BET, label: "a 4-bet range" };
    if (last.level === 2) return vsOpen?.raise.size ? { range: vsOpen.raise, label: `a ${pos} 3-bet vs ${opener}` } : { range: THREE_BET, label: "a 3-bet range" };
    const p: Position = pos === "BB" ? "CO" : pos;
    return { range: OPEN_RANGES[p], label: `a ${pos} opening range` };
  }
  if (last.level === 0) return { range: ALL_CODES, label: "a limping range" };
  if (last.level === 1) {
    if (vsOpen?.call.size) return { range: vsOpen.call, label: pos === "BB" ? `a BB defence vs ${opener}` : `a ${pos} flat vs ${opener}` };
    return pos === "BB" ? { range: BB_DEFEND, label: "a big-blind defence" } : { range: COLD_CALL, label: "a flat-calling range" };
  }
  if (last.level === 2) return vs3bet ? { range: vs3bet.call, label: `a ${pos} call vs a 3-bet` } : { range: CALL_3BET, label: "a range that calls 3-bets" };
  return { range: CALL_4BET, label: "a range that calls 4-bets" };
}

/* ------------------------------------------------------------------ post-flop weighting */

const madeTop = (c: HandClass) => c === "strong" || c === "overpair" || c === "toppair";

/** Hands that bet (or raise) for value or as a strong semi-bluff on this street. */
export function isValue(cls: HandClass, street: Street, raise: boolean): boolean {
  if (raise) return cls === "strong" || (street !== "river" && (cls === "overpair" || cls === "draw"));
  if (street === "flop") return cls !== "air";
  if (street === "turn") return madeTop(cls) || cls === "draw";
  return madeTop(cls);
}

/** Share of a balanced betting range that is bluffs, for a bet of `frac` × pot. */
export function bluffShare(frac: number, street: Street, raise: boolean): number {
  const f = Math.max(0.1, Math.min(frac, 3));
  return (f / (1 + 2 * f)) * (street === "river" ? 1 : 0.75) * (raise ? 0.6 : 1);
}

/** Weight left on a non-value pair after it bets half pot or less (less for bigger bets): the occasional thin bet or turned bluff. */
const SHOWDOWN_BET = 0.15;

/** Weight left on air after a small (≤45% pot) flop bet: those are high-frequency c-bets. */
const SMALL_CBET_AIR = 0.6;

const BOARD_LEN: Partial<Record<Street, number>> = { flop: 3, turn: 4, river: 5 };

export interface Holding {
  combos: [Card, Card][];
  /** cumulative weights, for sampling */
  cum: Float64Array;
  total: number;
  label: string;
}

/** The weighted range of `seatId`, with hero's cards and the board removed. */
export function holdingOf(s: PokerState, seatId: number, dead: readonly Card[], acts = actionsBySeat(s)): Holding {
  const { range, label } = preflopRange(s, seatId, acts);
  const deadSet = new Set(dead);
  const combos: [Card, Card][] = [];
  for (const code of range) for (const c of combosOfCode(code)) if (!deadSet.has(c[0]) && !deadSet.has(c[1])) combos.push(c);
  const w = new Float64Array(combos.length).fill(1);
  for (const a of acts.get(seatId) ?? []) {
    const n = BOARD_LEN[a.street];
    if (!n || s.board.length < n) continue;
    const board = s.board.slice(0, n);
    const cls = combos.map((c) => handClass(c, board));
    if (a.kind === "bet" || a.kind === "raise") {
      // Bluffs come from hands with no showdown value; pairs too weak to bet for value
      // mostly check (they win at showdown), so they keep only a small weight.
      const raise = a.kind === "raise";
      const thinW = SHOWDOWN_BET * Math.min(1, 0.5 / Math.max(0.1, a.frac));
      const value = cls.map((c) => isValue(c, a.street, raise));
      let v = 0;
      let air = 0;
      let thin = 0;
      cls.forEach((c, i) => {
        if (value[i]) v += w[i];
        else if (c === "air") air += w[i];
        else thin += w[i] * thinW;
      });
      // air makes up share b of everything that bets (value + thin bets + bluffs)
      const b = bluffShare(a.frac, a.street, raise);
      let q = v + thin > 0 && air > 0 ? Math.min(1, (b * (v + thin)) / ((1 - b) * air)) : 1;
      // small flop c-bets are made with most of a range, air included
      if (a.street === "flop" && !raise && a.frac <= 0.45) q = Math.max(q, SMALL_CBET_AIR);
      cls.forEach((c, i) => {
        if (!value[i]) w[i] *= c === "air" || air === 0 ? q : thinW;
      });
    } else if (a.kind === "call") {
      cls.forEach((c, i) => {
        if (c === "air") w[i] *= a.street === "river" ? 0.1 : 0.3;
      });
    } else {
      cls.forEach((c, i) => {
        if (c === "strong") w[i] *= 0.5;
      });
    }
  }
  const cum = new Float64Array(combos.length);
  let t = 0;
  for (let i = 0; i < combos.length; i++) cum[i] = t += w[i];
  return { combos, cum, total: t, label };
}

function sample(h: Holding, rand: () => number): [Card, Card] {
  const r = rand() * h.total;
  let lo = 0;
  let hi = h.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (h.cum[mid] > r) hi = mid;
    else lo = mid + 1;
  }
  return h.combos[lo];
}

/**
 * Hero's share of the pot against opponents holding the given weighted ranges, with the
 * rest of the board dealt at random. Monte Carlo with the given PRNG (ties split).
 */
export function equityVsHoldings(hole: readonly Card[], board: readonly Card[], opps: Holding[], iterations: number, rand: () => number): number {
  const live = opps.filter((o) => o.total > 0);
  if (!live.length) return 1;
  const known = new Set<Card>([...hole, ...board]);
  const rest = DECK.filter((c) => !known.has(c));
  let won = 0;
  let n = 0;
  const used = new Set<Card>();
  const hands: [Card, Card][] = [];
  const heroCards: Card[] = [...hole, ...board];
  const oppCards: Card[] = [];
  for (let it = 0; it < iterations; it++) {
    used.clear();
    hands.length = 0;
    let ok = true;
    for (const o of live) {
      let pick: [Card, Card] | null = null;
      for (let tries = 0; tries < 30 && !pick; tries++) {
        const c = sample(o, rand);
        if (!used.has(c[0]) && !used.has(c[1])) pick = c;
      }
      if (!pick) {
        ok = false;
        break;
      }
      used.add(pick[0]).add(pick[1]);
      hands.push(pick);
    }
    if (!ok) continue;
    heroCards.length = hole.length + board.length;
    oppCards.length = 2;
    for (const c of board) oppCards.push(c);
    while (heroCards.length < hole.length + 5) {
      const c = rest[Math.floor(rand() * rest.length)];
      if (!used.has(c)) {
        used.add(c);
        heroCards.push(c);
        oppCards.push(c);
      }
    }
    const hero = evaluate(heroCards);
    let best = -1;
    let ties = 0;
    for (const v of hands) {
      oppCards[0] = v[0];
      oppCards[1] = v[1];
      const sc = evaluate(oppCards);
      if (sc > best) {
        best = sc;
        ties = sc === hero ? 1 : 0;
      } else if (sc === best && sc === hero) ties++;
    }
    n++;
    if (hero > best) won += 1;
    else if (hero === best) won += 1 / (ties + 1);
  }
  return n ? won / n : 0.5;
}
