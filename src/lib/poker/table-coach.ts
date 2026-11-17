/**
 * Live coaching for the hero at the practice table. `coachHero` is called with the state
 * BEFORE the hero's action and grades it: pre-flop opens against the charts in ranges.ts,
 * calls/folds against pot odds using equity versus random hands (an approximation: real
 * betting ranges are stronger than random, especially behind big bets). Post-flop bets and
 * checks are graded with the textbook c-bet / sizing heuristics in postflop.ts.
 *
 * `cost` on a note is a rough estimate, in big blinds, of what a mistake gave up: pot-odds
 * maths for calls and folds (with the equity above), the one-street toy model (`betEV`)
 * for bets and checks. It is only attached when `ok === false`.
 */
import { seeded, seedFor } from "./equity";
import { equityVsRandom } from "./bots";
import { legal, opponentsOf, positionOf, raisesThisStreet } from "./game";
import type { CoachNote, PlayerAction, PokerState } from "./game-types";
import { cbetAnswer, costBetween, flopInfo, foldBonusFor, handClass, SIZE_FRAC, sizingAnswer } from "./postflop";
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
const note = (ok: boolean | null, title: string, detail: string, cost?: number): CoachNote => {
  const n: CoachNote = { ok, title: title.slice(0, 40), detail: detail.slice(0, 180) };
  if (ok === false && cost && cost > 0) n.cost = Math.round(cost * 10) / 10;
  return n;
};

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
    // calling wins pot + call with probability eq and costs the call; folding is 0
    const evCallBb = (eq * (state.pot + L.toCall) - L.toCall) / state.bb;
    const bigBet = state.street !== "preflop" && L.toCall > 0.6 * (state.pot - L.toCall);
    const caveat = bigBet ? " Big bets usually mean stronger than random." : "";
    const need = `${vs}; you needed ${pct(price)}.`;
    if (action.kind === "fold") {
      if (diff > 0.05) return note(false, "Fold looks too tight", `${need}${caveat || " The price was good enough to continue."}`, evCallBb);
      if (diff < -0.05) return note(true, "Good fold", `${need} Not enough equity for the price.`);
      return note(null, "Close spot", `${need} Folding is reasonable.`);
    }
    if (isRaise) {
      if (diff > 0.05) return note(true, "Raise with equity", `${need} Raising builds the pot with the better hand.${caveat}`);
      return note(null, "Bluff-raise", `${need} It only works if they fold often.`);
    }
    if (diff > 0.05) return note(true, "Good call", `${need}${caveat}`);
    if (diff < -0.05) return note(false, "Calling below the price", `${need} Folding saves chips in the long run.`, -evCallBb);
    return note(null, "Close spot", `${need} Calling is fine.`);
  }

  // nothing to call: checking or betting
  if (state.street !== "preflop" && state.board.length >= 3) return coachUnopened(state, seatId, action, eq, opponents, vs);
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

/* ------------------------------------------------------------------ post-flop, unopened pots */

/** Seat that made the last pre-flop raise (the player with the initiative), or null. */
function preflopAggressor(s: PokerState): number | null {
  const ev = [...s.log].reverse().find((e) => e.kind === "action" && e.street === "preflop" && e.seat !== undefined && / raises to /.test(e.text));
  return ev?.seat ?? null;
}

interface Plan {
  bet: boolean;
  /** recommended bet as a fraction of the pot (0 = check) */
  size: number;
  /** textbook-clear: deviating is a mistake rather than a style choice */
  firm: boolean;
  why: string;
}

const sizeWord = (f: number) => (f <= 0.4 ? "a third of the pot" : f <= 0.8 ? "about two thirds of the pot" : "pot or more");

/**
 * What the textbook does when nobody has bet yet after the flop:
 * - flop c-bet, heads-up, as the pre-flop raiser: `cbetAnswer` (range-bet small on A/K-high
 *   dry boards; elsewhere bet value, top pair and draws, check medium pairs and air);
 * - otherwise bet strong hands (big on wet boards and the river, small on dry flops), bet
 *   top pair and draws heads-up, check medium pairs, and don't bluff into two or more players.
 */
function planFor(s: PokerState, seatId: number, opponents: number): Plan {
  const hole = s.seats[seatId].hole;
  const info = flopInfo(s.board);
  const cls = handClass(hole, s.board);
  const river = s.board.length >= 5;
  const wet = info.texture === "wet" || info.texture === "semiwet" || info.texture === "monotone";
  if (s.street === "flop" && opponents === 1 && preflopAggressor(s) === seatId) {
    const bet = cbetAnswer(info, cls) === "bet";
    const sz = sizingAnswer(hole, s.board).size;
    const size = info.favors === "raiser" ? 0.33 : sz === "check" ? 0.66 : SIZE_FRAC[sz];
    const why =
      info.favors === "raiser"
        ? "You raised pre-flop and this A/K-high dry flop favours you: c-bet small with your whole range."
        : bet
          ? `C-bet ${sizeWord(size)}: your hand wants value or protection, or has a draw.`
          : "This flop hits the caller's range: check medium pairs and air instead of c-betting.";
    return { bet, size: bet ? size : 0, firm: info.favors !== "neutral", why };
  }
  switch (cls) {
    case "strong":
    case "overpair": {
      const size = river ? (cls === "strong" ? 1 : 0.66) : wet || s.street === "turn" ? 0.66 : 0.33;
      return { bet: true, size, firm: wet || river, why: `Strong hand: bet ${sizeWord(size)}${wet ? " and charge the draws" : river ? " for value" : ""}.` };
    }
    case "toppair":
      return { bet: opponents === 1 && !river, size: 0.5, firm: false, why: "Top pair: a medium bet for value and protection is standard heads-up." };
    case "medium":
      return { bet: false, size: 0, firm: wet || river, why: "Medium pair: check. It wins some showdowns but can't take a raise, and worse rarely calls." };
    case "draw":
      return {
        bet: opponents === 1,
        size: 0.66,
        firm: false,
        why: opponents === 1 ? "Draw heads-up: a semi-bluff wins the pot now or builds it for when you hit." : "Draw multiway: take the free card.",
      };
    default:
      return {
        bet: false,
        size: 0,
        firm: opponents >= 2,
        why: opponents >= 2 ? "No pair, no draw, two or more opponents: someone has something. Check." : "No pair, no draw: checking is fine; bluff where they fold a lot.",
      };
  }
}

function coachUnopened(s: PokerState, seatId: number, action: PlayerAction, eq: number, opponents: number, vs: string): CoachNote {
  const me = s.seats[seatId];
  const plan = planFor(s, seatId, opponents);
  const strength = Math.pow(eq, 1 / opponents);
  const potBb = s.pot / s.bb;
  const bonus = s.board.length === 3 ? foldBonusFor(flopInfo(s.board)) : 0;
  const cost = (best: number, chosen: number) => costBetween(strength, best, chosen, potBb, bonus);
  if (action.kind === "check") {
    if (!plan.bet) return note(true, "Good check", `${vs}. ${plan.why}`);
    if (plan.firm) return note(false, plan.size <= 0.4 ? "Missed c-bet" : "Bet this hand", `${vs}. ${plan.why}`, cost(plan.size, 0));
    return note(null, "Checking is OK", `${vs}. ${plan.why}`);
  }
  if (action.kind !== "raise") return note(null, "Check", `${vs}.`);
  const frac = (action.to - me.committed) / Math.max(1, s.pot);
  if (!plan.bet) {
    if (plan.firm) return note(false, "Check this one", `${vs}. ${plan.why}`, cost(0, frac));
    return note(null, "Bluff", `${vs}. ${plan.why}`);
  }
  const tooBig = plan.size <= 0.4 && frac > 0.85;
  const tooSmall = plan.size >= 0.6 && frac < 0.4;
  if (tooBig || tooSmall) {
    const title = tooBig ? "Size down" : "Size up";
    const detail = `Bet ${sizeWord(plan.size)} here; you bet ${Math.round(frac * 100)}%. ${plan.why}`;
    return plan.firm ? note(false, title, detail, cost(plan.size, frac)) : note(null, title, detail);
  }
  const cbet = s.street === "flop" && opponents === 1 && preflopAggressor(s) === seatId;
  return note(true, cbet ? "Good c-bet" : "Good bet", `${vs}. ${plan.why}`);
}
