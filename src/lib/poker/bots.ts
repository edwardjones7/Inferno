/**
 * Bot opponents for the practice table. Pre-flop play follows the opening charts in
 * ranges.ts, bent by each bot's style; post-flop play combines a quick Monte-Carlo
 * equity estimate against random hands with pot odds. Every decision is checked against
 * `legal()` before it is returned.
 */
import { rankOf, suitOf, type Card } from "../blackjack/cards";
import { DECK, evaluate, RANK_VALUE } from "./eval";
import { legal, opponentsOf, positionOf, raisesThisStreet, type TablePosition } from "./game";
import type { BotStyle, LegalOptions, PlayerAction, PokerState } from "./game-types";
import { handCode, OPEN_RANGES, type Position } from "./ranges";

export const BOT_ROSTER: { name: string; style: BotStyle }[] = [
  { name: "Ember", style: "tag" },
  { name: "Ash", style: "nit" },
  { name: "Blaze", style: "lag" },
  { name: "Cinder", style: "station" },
  { name: "Scorch", style: "tag" },
];

/** "Thinking" delay for the UI, 500–1400 ms. */
export const botThinkMs = (rand: () => number) => 500 + Math.floor(rand() * 901);

/**
 * Share of the pot `hole` wins against `opponents` uniformly random hands, with the rest
 * of the board dealt at random (ties split). Monte Carlo with the given PRNG. With `range`,
 * every opponent's hand is drawn from that set of hand codes instead (rejection sampling).
 */
export function equityVsRandom(
  hole: readonly Card[],
  board: readonly Card[],
  opponents: number,
  iterations: number,
  rand: () => number,
  range?: Set<string>,
): number {
  const opp = Math.max(1, Math.min(opponents, 9));
  const used = new Set<Card>([...hole, ...board]);
  const rest = DECK.filter((c) => !used.has(c));
  const need = 5 - board.length;
  const take = need + 2 * opp;
  const heroCards: Card[] = [...hole, ...board];
  const oppCards: Card[] = new Array(2 + board.length + need) as Card[];
  for (let k = 0; k < board.length; k++) oppCards[2 + k] = board[k];
  let won = 0;
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < take; i++) {
      const j = i + Math.floor(rand() * (rest.length - i));
      const t = rest[i];
      rest[i] = rest[j];
      rest[j] = t;
    }
    heroCards.length = hole.length + board.length;
    for (let k = 0; k < need; k++) {
      heroCards.push(rest[k]);
      oppCards[2 + board.length + k] = rest[k];
    }
    const hero = evaluate(heroCards);
    let best = -1;
    let ties = 0;
    if (range && range.size) {
      for (let o = 0; o < opp; o++) {
        const p = need + 2 * o;
        for (let tries = 0; tries < 300 && !range.has(handCode(rest[p], rest[p + 1])); tries++) {
          for (const q of [p, p + 1]) {
            const j = take + Math.floor(rand() * (rest.length - take));
            const t = rest[q];
            rest[q] = rest[j];
            rest[j] = t;
          }
        }
      }
    }
    for (let o = 0; o < opp; o++) {
      oppCards[0] = rest[need + 2 * o];
      oppCards[1] = rest[need + 2 * o + 1];
      const v = evaluate(oppCards);
      if (v > best) {
        best = v;
        ties = v === hero ? 1 : 0;
      } else if (v === best && v === hero) ties++;
      if (best > hero) break;
    }
    if (hero > best) won += 1;
    else if (hero === best) won += 1 / (ties + 1);
  }
  return won / iterations;
}

/** Chen formula: a quick pre-flop hand score (AA = 20, 72o ≈ -1). */
export function chenScore(a: Card, b: Card): number {
  const va = RANK_VALUE[rankOf(a)];
  const vb = RANK_VALUE[rankOf(b)];
  const hi = Math.max(va, vb);
  const lo = Math.min(va, vb);
  const base = (v: number) => (v === 14 ? 10 : v === 13 ? 8 : v === 12 ? 7 : v === 11 ? 6 : v / 2);
  if (hi === lo) return Math.max(5, base(hi) * 2);
  let s = base(hi);
  if (suitOf(a) === suitOf(b)) s += 2;
  const gap = hi - lo - 1;
  s -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi < 12) s += 1;
  return Math.ceil(s);
}

/** Flush draw or open-ended straight draw (4 to a flush / 4 consecutive ranks) using a hole card. */
export function hasDraw(hole: readonly Card[], board: readonly Card[]): boolean {
  if (board.length < 3 || board.length >= 5) return false;
  const all = [...hole, ...board];
  for (const suit of ["S", "H", "D", "C"]) {
    if (all.filter((c) => suitOf(c) === suit).length === 4 && hole.some((c) => suitOf(c) === suit)) return true;
  }
  const vals = new Set(all.map((c) => RANK_VALUE[rankOf(c)]));
  if (vals.has(14)) vals.add(1);
  const holeVals = hole.map((c) => RANK_VALUE[rankOf(c)]);
  for (let lo = 1; lo <= 11; lo++) {
    const run = [lo, lo + 1, lo + 2, lo + 3];
    if (run.every((v) => vals.has(v)) && run.some((v) => holeVals.includes(v) || (v === 1 && holeVals.includes(14)))) {
      // open-ended unless capped by the ace / wheel
      if (lo >= 2 && lo + 3 <= 13) return true;
    }
  }
  return false;
}

// ---- action helpers --------------------------------------------------------------------

const passive = (L: LegalOptions): PlayerAction => (L.canCheck ? { kind: "check" } : { kind: "fold" });

/** Clamp a raise target into the legal window; shove when little would be left behind. */
function raiseTo(L: LegalOptions, to: number, pot: number): PlayerAction {
  if (!L.canRaise) return L.canCheck ? { kind: "check" } : { kind: "call" };
  let t = Math.round(to);
  t = Math.max(L.minRaiseTo, Math.min(L.maxRaiseTo, t));
  if (L.maxRaiseTo - t < pot * 0.3) t = L.maxRaiseTo;
  return { kind: "raise", to: t };
}

/** Final guard: never hand back an illegal action. */
function sanitize(L: LegalOptions, a: PlayerAction): PlayerAction {
  switch (a.kind) {
    case "fold":
      return L.canCheck ? { kind: "check" } : a;
    case "check":
      return L.canCheck ? a : { kind: "fold" };
    case "call":
      return L.canCheck ? { kind: "check" } : a;
    case "raise":
      if (!L.canRaise) return L.canCheck ? { kind: "check" } : { kind: "call" };
      return { kind: "raise", to: Math.max(L.minRaiseTo, Math.min(L.maxRaiseTo, Math.floor(a.to))) };
  }
}

const LOOSER: Record<Position, Position> = { UTG: "HJ", HJ: "CO", CO: "BTN", BTN: "BTN", SB: "BTN" };
const TIGHTER: Record<Position, Position> = { UTG: "UTG", HJ: "UTG", CO: "HJ", BTN: "CO", SB: "CO" };

function opens(style: BotStyle, pos: TablePosition, code: string, chen: number): boolean {
  if (pos === "BB") return false;
  const p = pos as Position;
  switch (style) {
    case "nit":
      return OPEN_RANGES[TIGHTER[p]].has(code) && chen >= (p === "UTG" ? 8 : 6);
    case "lag":
      return OPEN_RANGES[LOOSER[p]].has(code) || (p === "BTN" && chen >= 3);
    case "station":
      return OPEN_RANGES[p].has(code) && chen >= 6;
    default:
      return OPEN_RANGES[p].has(code);
  }
}

const VALUE_3BET = new Set(["AA", "KK", "QQ", "AKs", "AKo"]);
const BLUFF_3BET = new Set(["A5s", "A4s", "A3s", "KJs", "QJs", "JTs", "T9s", "76s", "65s"]);
const PREMIUM = new Set(["AA", "KK", "AKs", "AKo"]);
const STRONG = new Set(["QQ", "JJ", "AQs", "TT", "AQo"]);

function preflop(s: PokerState, seatId: number, L: LegalOptions, style: BotStyle, rand: () => number): PlayerAction {
  const me = s.seats[seatId];
  const [a, b] = me.hole;
  const code = handCode(a, b);
  const chen = chenScore(a, b);
  const pos = positionOf(s, seatId);
  const raises = raisesThisStreet(s);
  const bb = s.bb;
  const stackBB = (me.stack + me.committed) / bb;

  if (raises === 0) {
    const limpers = s.seats.filter((x) => x.id !== seatId && !x.folded && x.hole.length && x.committed >= s.currentBet && x.lastAction?.startsWith("Call")).length;
    if (L.canCheck) {
      // big blind option (or SB completed)
      if (chen >= 10 || (style === "lag" && chen >= 8 && rand() < 0.5)) return raiseTo(L, s.currentBet * 3.5 + limpers * bb, s.pot);
      return { kind: "check" };
    }
    if (opens(style, pos, code, chen) && (limpers === 0 || chen >= 7 || style === "lag")) {
      const size = (pos === "SB" ? 3 : 2.5) * bb + limpers * bb;
      return raiseTo(L, size, s.pot);
    }
    // limp / complete
    const limpWith = style === "station" ? chen >= 5 : style === "lag" ? pos === "SB" && chen >= 5 : pos === "SB" && chen >= 7 && rand() < 0.3;
    if (limpWith || (limpers > 0 && chen >= 7 && style !== "nit")) return { kind: "call" };
    return passive(L);
  }

  const toCall = L.toCall;
  const priceBB = toCall / bb;
  // cheaper calls with more money in the middle widen the range a little
  const priceBonus = Math.max(-3, Math.min(2, 2 - priceBB / 3));
  const deep = stackBB > 25;

  if (raises === 1) {
    const threeBetSize = s.currentBet * (pos === "SB" || pos === "BB" ? 3.5 : 3) + (s.pot - s.currentBet - me.committed) * 0.5;
    if (VALUE_3BET.has(code) && !(style === "station" && rand() < 0.5)) return raiseTo(L, threeBetSize, s.pot);
    if ((style === "tag" && BLUFF_3BET.has(code) && rand() < 0.25) || (style === "lag" && (BLUFF_3BET.has(code) || chen >= 9) && rand() < 0.5))
      return raiseTo(L, threeBetSize, s.pot);
    const callBar: Record<BotStyle, number> = { nit: 9, tag: 7, lag: 6, station: 5 };
    let bar = callBar[style] - priceBonus;
    if (pos === "BB") bar -= 1;
    if (!deep && chen < 10) bar += 2;
    const pairSetMine = code.length === 2 && deep && priceBB <= stackBB / 12 && style !== "nit";
    if (chen >= bar || pairSetMine || (style === "nit" && STRONG.has(code))) return { kind: "call" };
    return passive(L);
  }

  // facing a 3-bet or more
  if (PREMIUM.has(code)) {
    if (style === "station" && rand() < 0.6) return { kind: "call" };
    if (code === "AKo" && style === "nit" && rand() < 0.5) return { kind: "call" };
    const to = raises >= 3 || L.maxRaiseTo < s.currentBet * 3 ? L.maxRaiseTo : s.currentBet * 2.3;
    return rand() < 0.75 ? raiseTo(L, to, s.pot) : { kind: "call" };
  }
  if (STRONG.has(code)) {
    const p: Record<BotStyle, number> = { nit: 0.4, tag: 0.6, lag: 0.75, station: 0.95 };
    const cheap = toCall <= me.stack * 0.35 || stackBB < 30;
    if (raises <= 2 && cheap && rand() < p[style]) return { kind: "call" };
    if (raises >= 3 && (code === "QQ" || style === "station") && rand() < p[style] * 0.6) return { kind: "call" };
    return passive(L);
  }
  if (style === "station" && chen >= 8 && raises <= 2) return { kind: "call" };
  if (style === "lag" && raises === 2 && BLUFF_3BET.has(code) && rand() < 0.08) return raiseTo(L, L.maxRaiseTo, s.pot);
  return passive(L);
}

function postflop(s: PokerState, seatId: number, L: LegalOptions, style: BotStyle, rand: () => number): PlayerAction {
  const me = s.seats[seatId];
  const opp = Math.max(1, opponentsOf(s, seatId));
  const eq = equityVsRandom(me.hole, s.board, opp, 400, rand);
  // per-opponent strength, roughly comparable across table sizes
  const strength = Math.pow(eq, 1 / opp);
  const draw = hasDraw(me.hole, s.board);
  const pot = s.pot;
  const potBet = (frac: number) => s.currentBet + frac * (pot + L.toCall);
  const jitter = (rand() - 0.5) * 0.06;
  const bluffRate: Record<BotStyle, number> = { nit: 0.03, tag: 0.1, lag: 0.22, station: 0.05 };

  if (L.canCheck) {
    const sz = 0.33 + rand() * 0.67;
    if (strength + jitter > 0.82) return rand() < (style === "nit" ? 0.95 : 0.85) ? raiseTo(L, potBet(Math.max(0.5, sz)), pot) : { kind: "check" };
    if (strength + jitter > 0.66) return rand() < (style === "station" ? 0.35 : 0.6) ? raiseTo(L, potBet(Math.min(0.66, sz)), pot) : { kind: "check" };
    if (draw && rand() < (style === "lag" ? 0.55 : style === "nit" ? 0.15 : 0.35)) return raiseTo(L, potBet(0.5), pot);
    if (s.street !== "river" || style === "lag") {
      if (rand() < bluffRate[style] * (opp === 1 ? 1.5 : 0.6)) return raiseTo(L, potBet(0.4 + rand() * 0.3), pot);
    }
    return { kind: "check" };
  }

  const price = L.toCall / (pot + L.toCall);
  const betFrac = Math.min(1.5, L.toCall / Math.max(1, pot - L.toCall));
  // a bettor's range beats a random hand: discount equity more against bigger bets
  const discount: Record<BotStyle, number> = { nit: 0.38, tag: 0.3, lag: 0.25, station: 0.1 };
  const eff = eq * (1 - discount[style] * Math.min(1, betFrac)) + jitter + (draw ? 0.05 : 0) + (style === "station" ? 0.06 : 0);

  if (strength > 0.88 && L.canRaise && rand() < (style === "station" ? 0.3 : 0.6)) return raiseTo(L, potBet(0.6 + rand() * 0.4), pot);
  if (draw && L.canRaise && s.street === "flop" && rand() < (style === "lag" ? 0.25 : style === "tag" ? 0.1 : 0.03)) return raiseTo(L, potBet(0.75), pot);
  if (eff >= price) return { kind: "call" };
  if (style === "lag" && L.canRaise && opp === 1 && s.street !== "river" && rand() < 0.05) return raiseTo(L, potBet(0.8), pot);
  return { kind: "fold" };
}

export function botDecide(state: PokerState, seatId: number, rand: () => number): PlayerAction {
  if (state.toAct !== seatId) throw new Error(`Seat ${seatId} is not due to act`);
  const L = legal(state);
  const style: BotStyle = state.seats[seatId].style ?? "tag";
  const a = state.street === "preflop" ? preflop(state, seatId, L, style, rand) : postflop(state, seatId, L, style, rand);
  return sanitize(L, a);
}
