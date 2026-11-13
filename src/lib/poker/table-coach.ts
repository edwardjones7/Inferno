/**
 * Live coaching for the hero at the practice table. `coachHero` is called with the state
 * BEFORE the hero's action and grades it: pre-flop opens against the charts in ranges.ts,
 * calls/folds against pot odds using equity versus random hands (an approximation: real
 * betting ranges are stronger than random, especially behind big bets).
 */
import { seeded, seedFor } from "./equity";
import { equityVsRandom } from "./bots";
import { legal, opponentsOf, positionOf, raisesThisStreet } from "./game";
import type { CoachNote, PlayerAction, PokerState } from "./game-types";
import { handCode, OPEN_RANGES, parseRange, POSITION_NAME, rangePercent, type Position } from "./ranges";

const THREE_BET_RANGE = parseRange("TT+, AQs+, AKo, KQs, A5s, A4s");
const FOUR_BET_RANGE = parseRange("QQ+, AKs, AKo");

/** Pre-flop: the range we credit the last raiser with (null = no raise yet). */
function raiserRange(s: PokerState): { range: Set<string>; label: string } | null {
  const raises = raisesThisStreet(s);
  if (raises === 0) return null;
  if (raises >= 3) return { range: FOUR_BET_RANGE, label: "a 4-bet range (QQ+, AK)" };
  if (raises === 2) return { range: THREE_BET_RANGE, label: "a 3-bet range (TT+, AQ+)" };
  const ev = [...s.log].reverse().find((e) => e.kind === "action" && e.street === "preflop" && e.seat !== undefined && / raises to /.test(e.text));
  const pos = ev ? positionOf(s, ev.seat!) : "CO";
  const p: Position = pos === "BB" ? "CO" : pos;
  return { range: OPEN_RANGES[p], label: `a ${p} opening range` };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const note = (ok: boolean | null, title: string, detail: string): CoachNote => ({ ok, title: title.slice(0, 40), detail: detail.slice(0, 180) });

/** Deterministic equity for the hero's spot so the same decision always gets the same note. */
function heroEquity(s: PokerState, seatId: number, opponents: number, range?: Set<string>): number {
  const me = s.seats[seatId];
  const rand = seeded(seedFor([...me.hole, ...s.board]) ^ (opponents * 2654435761));
  return equityVsRandom(me.hole, s.board, opponents, 1500, rand, range);
}

export function coachHero(state: PokerState, action: PlayerAction): CoachNote {
  const seatId = state.toAct;
  if (seatId === null) return note(null, "Not your turn", "There's no decision to grade right now.");
  const me = state.seats[seatId];
  const L = legal(state);
  const [a, b] = me.hole;
  const code = handCode(a, b);
  const pos = positionOf(state, seatId);
  const isRaise = action.kind === "raise";
  const isCall = action.kind === "call" && !L.canCheck;

  if (state.street === "preflop" && raisesThisStreet(state) === 0) {
    const limpers = state.seats.some((x) => x.id !== seatId && x.hole.length > 0 && x.lastAction?.startsWith("Call"));
    if (pos === "BB" && L.canCheck) {
      if (action.kind === "check") return note(null, "Free flop", "Nobody raised, so checking your option is fine; raise strong hands for value.");
      if (isRaise) return note(true, "Raising your option", `Raising ${code} from the big blind punishes the limp${limpers ? "ers" : ""}.`);
    }
    if (!limpers && pos !== "BB") {
      const p: Position = pos;
      const range = OPEN_RANGES[p];
      const inRange = range.has(code);
      const where = `${POSITION_NAME[p]} opens about ${Math.round(rangePercent(range))}% of hands`;
      if (isCall) return note(false, "Limping is a leak", `Open-raise or fold when it's folded to you; limping ${code} invites a raise and plays the pot without initiative.`);
      if (isRaise && inRange) return note(true, "Standard open", `${code} is in the ${p} opening range. ${where}.`);
      if (isRaise) return note(false, `${code} is too loose from ${p}`, `${code} isn't in the ${p} range; ${where}. Fold it here.`);
      if (action.kind === "fold" && inRange) return note(false, `${code} is an open from ${p}`, `${code} is in the ${p} opening range; ${where}. Raise it rather than folding.`);
      if (action.kind === "fold") return note(true, "Good fold", `${code} isn't in the ${p} opening range; ${where}.`);
    }
  }

  if (action.kind === "fold" && L.canCheck) return note(false, "Never fold for free", "Checking costs nothing here, so folding just gives up your equity.");

  // pre-flop the blinds and players yet to act usually fold, so count only those in the pot for the bet
  const opponents =
    state.street === "preflop"
      ? Math.max(1, state.seats.filter((x) => x.id !== seatId && x.hole.length > 0 && !x.folded && x.committed >= state.currentBet).length)
      : Math.max(1, opponentsOf(state, seatId));
  const rr = state.street === "preflop" ? raiserRange(state) : null;
  const eq = heroEquity(state, seatId, opponents, rr?.range);
  const vs = rr
    ? `≈${pct(eq)} vs ${opponents === 1 ? rr.label : `${opponents} players on ${rr.label}`}`
    : `≈${pct(eq)} vs ${opponents === 1 ? "a random hand" : `${opponents} random hands`}`;

  if (L.toCall > 0) {
    const price = L.toCall / (state.pot + L.toCall);
    const diff = eq - price;
    const bigBet = state.street !== "preflop" && L.toCall > 0.6 * (state.pot - L.toCall);
    const caveat = bigBet ? " Big bets usually mean stronger than random." : "";
    const need = `${vs}; you needed ${pct(price)}.`;
    if (action.kind === "fold") {
      if (diff > 0.05) return note(false, "Fold looks too tight", `${need}${caveat || " The price was good enough to continue."}`);
      if (diff < -0.05) return note(true, "Good fold", `${need} Not enough equity for the price.`);
      return note(null, "Close spot", `${need} Folding is reasonable.`);
    }
    if (isRaise) {
      if (diff > 0.05) return note(true, "Raise with equity", `${need} Raising builds the pot with the better hand.${caveat}`);
      return note(null, "Bluff-raise", `${need} It only works if they fold often.`);
    }
    if (diff > 0.05) return note(true, "Good call", `${need}${caveat}`);
    if (diff < -0.05) return note(false, "Calling below the price", `${need} Folding saves chips in the long run.`);
    return note(null, "Close spot", `${need} Calling is fine.`);
  }

  // nothing to call: checking or betting
  const strength = Math.pow(eq, 1 / opponents);
  if (action.kind === "check") {
    if (strength > 0.8) return note(null, "Consider betting for value", `${vs}. A strong hand like this usually wants to build the pot.`);
    return note(null, "Check", `${vs}. Checking keeps the pot small.`);
  }
  if (isRaise) {
    if (strength > 0.65) return note(true, "Value bet", `${vs}. Betting gets paid by worse hands.`);
    if (strength < 0.4) return note(null, "Bluff", `${vs}. Fine as a bluff occasionally; don't overdo it.`);
    return note(null, "Bet", `${vs}.`);
  }
  return note(null, "Check", `${vs}.`);
}
