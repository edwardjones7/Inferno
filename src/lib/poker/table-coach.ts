/**
 * Live coaching for the hero at the practice table. `coachHero` is called with the state
 * BEFORE the hero's action and grades it.
 *
 * Assumptions: 6-max, 100bb, ~2.5bb opens, opponents playing a sound strategy. See
 * villain.ts for the ranges and how each opponent's actions narrow them.
 *
 * - Pre-flop, folded to you: the opening charts in ranges.ts (raise or fold; the small
 *   blind may also limp). Behind limpers: iso-raise playable hands, fold weak ones.
 * - Facing a raise heads-up at ~100bb (an open, a 3-bet after you opened, a 4-bet after you
 *   3-bet): the per-seat response charts in preflop.ts.
 * - Other raises (multiway, limped pots, short stacks, all-ins): equity against the raiser's
 *   range, compared with the price adjusted for how much of that equity you can realise
 *   (position, suitedness, players left to act). Hands in the standard re-raise range
 *   should re-raise rather than call.
 * - Facing a post-flop bet: equity against the bettor's range as narrowed by their actions,
 *   compared with the price.
 * - Nobody has bet post-flop: the textbook c-bet / sizing heuristics in postflop.ts, with
 *   mixed spots (checking strong hands, out-of-position c-bets, leading) left as "fine".
 *
 * `cost` on a note is a rough estimate, in big blinds, of what a mistake gave up: pot-odds
 * maths for calls and folds (with the equity above), the one-street toy model (`betEV`) for
 * bets and checks. It is only attached when `ok === false`.
 */
import { seeded, seedFor } from "./equity";
import { legal, positionOf, raisesThisStreet, type TablePosition } from "./game";
import type { CoachNote, PlayerAction, PokerState, Street } from "./game-types";
import {
  cbetAnswer,
  costBetween,
  flopInfo,
  foldBonusFor,
  handClass,
  nearNuts,
  SIZE_FRAC,
  sizingAnswer,
  type HandClass,
} from "./postflop";
import { handCode, OPEN_RANGES, parseRange, POSITION_NAME, rangePercent, type Position } from "./ranges";
import { actionOf, isValue3bet, vs3betChart, VS_4BET, vsOpenChart, type ResponseAction, type ResponseChart, type Seat } from "./preflop";
import { actionsBySeat, equityVsHoldings, FOUR_BET, holdingOf, preflopRaisers, THREE_BET } from "./villain";

/** Hands that re-raise for value rather than call, by the number of raises faced. */
const VALUE_RERAISE = [parseRange("QQ+, AKs, AKo"), parseRange("QQ+, AKs, AKo"), parseRange("KK+, AKs")];
const RERAISE_RANGE = [THREE_BET, FOUR_BET, parseRange("KK+, AKs, AKo")];
const RERAISE_WORD = ["3-bet", "4-bet", "shove"];
/** Too strong to limp behind: iso-raise these for value. */
const ISO_VALUE = parseRange("88+, ATs+, KJs+, QJs, AJo+, KQo");

const pct = (x: number) => `${Math.round(x * 100)}%`;
const note = (ok: boolean | null, title: string, detail: string, cost?: number): CoachNote => {
  const n: CoachNote = { ok, title: title.slice(0, 40), detail: detail.slice(0, 180) };
  if (ok === false && cost && cost > 0) n.cost = Math.round(cost * 10) / 10;
  return n;
};

/* ------------------------------------------------------------------ table geometry */

const POST_ORDER: TablePosition[] = ["SB", "BB", "UTG", "HJ", "CO", "BTN"];
/** True when seat `a` acts after seat `b` on the flop, turn and river. */
const actsAfter = (s: PokerState, a: number, b: number) => POST_ORDER.indexOf(positionOf(s, a)) > POST_ORDER.indexOf(positionOf(s, b));
const live = (s: PokerState, id: number) => s.seats[id].hole.length > 0 && !s.seats[id].folded;

/** Opponents who have matched the current bet (everyone live when nobody has bet). */
function opponentsInPot(s: PokerState, seatId: number): number[] {
  return s.seats.filter((x) => x.id !== seatId && live(s, x.id) && x.committed >= s.currentBet).map((x) => x.id);
}

/** Live opponents who still have to respond to the current bet. */
const yetToAct = (s: PokerState, seatId: number) => s.seats.filter((x) => x.id !== seatId && live(s, x.id) && !x.allIn && x.committed < s.currentBet).length;

/** Seat that made the last bet or raise on `street`, or null. */
function aggressorOn(s: PokerState, street: Street): number | null {
  const ev = [...s.log].reverse().find((e) => e.kind === "action" && e.street === street && e.seat !== undefined && / (raises to|bets) /.test(e.text));
  return ev?.seat ?? null;
}
const PREV: Partial<Record<Street, Street>> = { flop: "preflop", turn: "flop", river: "turn" };

/* ------------------------------------------------------------------ equity */

function heroEquity(s: PokerState, seatId: number, opps: number[]): { eq: number; label: string } {
  const me = s.seats[seatId];
  const acts = actionsBySeat(s);
  const dead = [...me.hole, ...s.board];
  const holdings = opps.map((id) => holdingOf(s, id, dead, acts));
  const rand = seeded(seedFor(dead) ^ (opps.length * 2654435761) ^ s.log.length);
  // multiway pots need less precision and cost more per sample
  const eq = equityVsHoldings(me.hole, s.board, holdings, opps.length >= 3 ? 600 : 1500, rand);
  const label =
    opps.length > 1
      ? `${opps.length} opponents' ranges`
      : s.street === "preflop"
        ? holdings[0].label
        : s.currentBet > 0
          ? "their betting range"
          : "their range";
  return { eq, label };
}

/**
 * Share of pre-flop equity a caller turns into winnings after the flop (rough, but the
 * direction is well established): in position ~88%, out of position ~75% for an average
 * hand. Weak hands realise much less (they're dominated and can't continue on most flops),
 * strong ones more, so it moves 1:1 with equity around 45%. Suited and connected hands
 * realise more, gapped low offsuit hands less; each extra opponent or player left to act
 * behind (who can squeeze) costs a little more. Calibrated so the big blind defends about
 * 60% of hands against a button open and far fewer against UTG, as solver charts do.
 */
function realisation(s: PokerState, seatId: number, opps: number[], code: string, eq: number): { r: number; ip: boolean } {
  const ip = opps.every((o) => actsAfter(s, seatId, o));
  let r = (ip ? 0.88 : 0.75) + (eq - 0.45);
  if (code.length === 3) {
    const v = (c: string) => "23456789TJQKA".indexOf(c) + 2;
    const [hi, lo] = [v(code[0]), v(code[1])];
    if (code[2] === "s") r += 0.08;
    if (hi - lo === 1) r += 0.03;
    else if (code[2] === "o" && hi < 10 && hi - lo >= 4) r -= 0.1;
  }
  r -= 0.05 * Math.max(0, opps.length - 1) + 0.04 * yetToAct(s, seatId);
  return { r: Math.max(0.4, Math.min(1.1, r)), ip };
}

/* ------------------------------------------------------------------ entry point */

export function coachHero(state: PokerState, action: PlayerAction): CoachNote {
  const seatId = state.toAct;
  if (seatId === null) return note(null, "Not your turn", "There's no decision to grade right now.");
  const me = state.seats[seatId];
  const L = legal(state);
  const code = handCode(me.hole[0], me.hole[1]);
  const pos = positionOf(state, seatId);
  const isRaise = action.kind === "raise";
  const raises = raisesThisStreet(state);

  if (state.street === "preflop" && raises === 0) {
    const limpers = state.seats.filter((x) => x.id !== seatId && x.hole.length > 0 && !x.folded && x.lastAction?.startsWith("Call")).length;
    if (pos === "BB" && L.canCheck) {
      if (action.kind === "check") return note(null, "Free flop", "Nobody raised, so checking your option is fine; raise strong hands for value.");
      if (isRaise) return note(true, "Raising your option", `Raising ${code} from the big blind punishes the limp${limpers > 1 ? "ers" : ""}.`);
    }
    if (pos !== "BB") return limpers ? coachBehindLimpers(action, pos, code, limpers) : coachOpen(action, pos, code);
  }

  if (action.kind === "fold" && L.canCheck) return note(false, "Never fold for free", "Checking costs nothing here, so folding just gives up your equity.");

  const opps = opponentsInPot(state, seatId);
  const { eq, label } = heroEquity(state, seatId, opps);
  const vs = `≈${pct(eq)} vs ${label}`;

  if (L.toCall > 0 && state.street === "preflop") return coachVsRaise(state, seatId, action, code, eq, vs, opps, Math.max(1, raises));
  if (L.toCall > 0) return coachVsBet(state, seatId, action, eq, vs);

  // nothing to call: checking or betting
  if (state.street !== "preflop" && state.board.length >= 3) return coachUnopened(state, seatId, action, eq, opps.length, vs);
  if (action.kind === "check") return note(null, "Check", `${vs}. Checking keeps the pot small.`);
  return note(null, isRaise ? "Bet" : "Check", `${vs}.`);
}

/* ------------------------------------------------------------------ pre-flop */

function coachOpen(action: PlayerAction, pos: Position, code: string): CoachNote {
  const range = OPEN_RANGES[pos];
  const inRange = range.has(code);
  const where = `${POSITION_NAME[pos]} opens about ${Math.round(rangePercent(range))}% of hands`;
  if (action.kind === "call") {
    if (pos === "SB") return note(null, "Small-blind limp", `Limping the small blind is a valid strategy, but raise-or-fold is simpler and what these charts teach. ${where}.`);
    return note(false, "Limping is a leak", `Open-raise or fold when it's folded to you; limping ${code} invites a raise and plays the pot without initiative.`);
  }
  if (action.kind === "raise" && inRange) return note(true, "Standard open", `${code} is in the ${pos} opening range. ${where}.`);
  if (action.kind === "raise") return note(false, `${code} is too loose from ${pos}`, `${code} isn't in the ${pos} range; ${where}. Fold it here.`);
  if (action.kind === "fold" && inRange) return note(false, `${code} is an open from ${pos}`, `${code} is in the ${pos} opening range; ${where}. Raise it rather than folding.`);
  return note(true, "Good fold", `${code} isn't in the ${pos} opening range; ${where}.`);
}

function coachBehindLimpers(action: PlayerAction, pos: Position, code: string, limpers: number): CoachNote {
  const strong = ISO_VALUE.has(code);
  const playable = OPEN_RANGES[pos].has(code);
  const them = limpers > 1 ? "limpers" : "limper";
  if (action.kind === "raise")
    return playable
      ? note(true, "Iso-raise", `Raising ${code} over the ${them} takes the initiative against a weak range. Size about 3bb plus 1bb per limper.`)
      : note(null, "Loose iso-raise", `${code} is outside the ${pos} opening range; isolating with it only works if the ${them} fold a lot.`);
  if (action.kind === "call") {
    if (pos === "SB") return note(null, "Completing", "Completing the small blind behind limpers is fine with playable hands at this price. Raise your strong ones.");
    if (strong) return note(false, "Raise, don't limp behind", `${code} is strong enough to iso-raise. Limping behind lets the blinds in cheaply and plays a big hand for a small pot.`);
    if (playable) return note(null, "Overlimp", `Limping behind with ${code} is OK, mostly in position with small pairs and suited hands. Iso-raising is also fine.`);
    return note(false, "Too weak to play", `${code} isn't in the ${pos} range; fold it rather than limping behind.`);
  }
  if (strong) return note(false, `Don't fold ${code}`, `${code} is strong enough to iso-raise the ${them}.`);
  if (playable) return note(null, "Folding is OK", `${code} is playable in the ${pos}; iso-raising the ${them} is the more profitable choice.`);
  return note(true, "Good fold", `${code} isn't in the ${pos} range.`);
}

/* ------------------------------------------------------------------ pre-flop, charted spots */

/** Shortest effective stack (in big blinds) at which the 100bb charts still apply. */
const CHART_MIN_BB = 60;

interface ChartSpot {
  chart: ResponseChart;
  /** "3-bet", "4-bet" or "5-bet": what "raise" means here */
  word: string;
  /** "vs a CO open", "vs a BTN 3-bet", "vs a 4-bet" */
  ctx: string;
  /** the opener, when hero faces an open (value vs bluff wording) */
  opener: Position | null;
}

/**
 * The preflop.ts chart for this decision, or null when none applies: only heads-up spots
 * (nobody else in for the bet), unlimped pots, ~100bb stacks and decisions that don't put
 * hero all-in. Covers facing an open, the opener facing a 3-bet, and the 3-bettor facing a 4-bet.
 */
function chartSpot(s: PokerState, seatId: number, opps: number[], raises: number): ChartSpot | null {
  const me = s.seats[seatId];
  const L = legal(s);
  if (opps.length !== 1 || L.toCall >= me.stack) return null;
  const effBb = Math.min(me.stack + me.committed, s.seats[opps[0]].stack + s.seats[opps[0]].committed) / s.bb;
  if (effBb < CHART_MIN_BB) return null;
  const { raisers, limpedFirst } = preflopRaisers(s);
  if (limpedFirst || raisers.length !== raises) return null;
  const openerPos = positionOf(s, raisers[0]);
  if (openerPos === "BB") return null;
  const pos = positionOf(s, seatId) as Seat;
  if (raises === 1) {
    const chart = vsOpenChart(pos, openerPos);
    return chart ? { chart, word: "3-bet", ctx: `vs a ${openerPos} open`, opener: openerPos } : null;
  }
  if (raises === 2 && raisers[0] === seatId) {
    const tb = positionOf(s, raisers[1]) as Seat;
    const chart = vs3betChart(openerPos, tb);
    return chart ? { chart, word: "4-bet", ctx: `vs a ${tb} 3-bet`, opener: null } : null;
  }
  if (raises === 3 && raisers[1] === seatId) return { chart: VS_4BET, word: "5-bet", ctx: "vs a 4-bet", opener: null };
  return null;
}

/** Grade a pre-flop response against the chart. `evCall` (bb, realisation-adjusted) only sizes the cost. */
function coachVsChart(s: PokerState, seatId: number, action: PlayerAction, code: string, spot: ChartSpot, vs: string, evCall: number, ip: boolean): CoachNote {
  const pos = positionOf(s, seatId);
  const want = actionOf(spot.chart, code);
  const did: ResponseAction = action.kind === "raise" ? "raise" : action.kind === "call" ? "call" : "fold";
  const say = (a: ResponseAction) => (a === "raise" ? spot.word : a);
  const value = spot.opener ? isValue3bet(spot.opener, code) : VALUE_RERAISE[0].has(code);
  const sb3betOrFold = pos === "SB" && spot.word === "3-bet";
  const reason =
    want === "raise"
      ? value
        ? "For value: it's ahead of their range."
        : "As a bluff: it blocks strong hands and plays well when called."
      : want === "call"
        ? pos === "BB" && spot.word === "3-bet"
          ? "Good price closing the action, even out of position; not a value 3-bet."
          : `Good enough to continue ${ip ? "in position" : "out of position"}, not to raise.`
        : sb3betOrFold
          ? "Small blind: 3-bet or fold."
          : `Dominated too often by their range${ip ? "" : ", and out of position"}.`;
  const head = `${code} ${spot.ctx}: the chart says ${say(want)}. ${reason}`;
  if (did === want) {
    const title = want === "raise" ? `Good ${spot.word}` : want === "call" ? (pos === "BB" && spot.word === "3-bet" ? "Good defend" : "Good call") : "Good fold";
    return note(true, title, `${head} ${vs}.`);
  }
  if (spot.chart.mixed.has(code)) return note(null, "Mixed spot", `${head} Solvers play it both ways. ${vs}.`);
  // A small-blind flat is a strategy error, not a hand-strength one, when the hand is playable
  // (the chart 3-bets it, or the big blind would defend it): flag it softly. Junk is a mistake.
  if (sb3betOrFold && did === "call" && spot.opener && (spot.chart.raise.has(code) || vsOpenChart("BB", spot.opener)?.call.has(code)))
    return note(spot.chart.raise.has(code) && value ? false : null, "3-bet or fold from the SB", `${head} Flatting out of position with the big blind behind loses money.`);
  if (want === "raise") {
    if (did === "call") {
      return note(null, value ? `${spot.word[0].toUpperCase()}${spot.word.slice(1)} for value` : "Calling is OK", `${head} ${value ? "Calling lets worse hands in cheaply." : "Calling instead of the bluff is reasonable."}`);
    }
    return value ? note(false, `Don't fold ${code}`, head, evCall) : note(null, "Folding is OK", `${head} It's a bluff, so folding gives up little.`);
  }
  if (want === "call") {
    if (did === "fold") return note(false, pos === "BB" ? "Defend this hand" : "Too tight", `${head} ${vs}.`, evCall);
    return note(null, `Light ${spot.word}`, `${head} Raising instead is a style choice, not a clear mistake.`);
  }
  if (did === "call") return note(false, "Too weak to call", `${head} ${vs}.`, -evCall);
  return note(false, `${code} is too loose to ${spot.word}`, `${head} Save ${spot.word}s for value hands and the best bluffs.`);
}

function coachVsRaise(s: PokerState, seatId: number, action: PlayerAction, code: string, eq: number, vs: string, opps: number[], raises: number): CoachNote {
  const L = legal(s);
  const spot = chartSpot(s, seatId, opps, raises);
  if (spot) {
    const { r, ip } = realisation(s, seatId, opps, code, eq);
    return coachVsChart(s, seatId, action, code, spot, vs, (eq * r * (s.pot + L.toCall) - L.toCall) / s.bb, ip);
  }
  const lvl = Math.min(raises, 3) - 1;
  const word = RERAISE_WORD[lvl];
  const { r, ip } = realisation(s, seatId, opps, code, eq);
  const allIn = L.toCall >= s.seats[seatId].stack;
  const realise = allIn ? 1 : r;
  const price = L.toCall / (s.pot + L.toCall);
  const need = price / realise;
  const diff = eq - need;
  const evCallBb = (eq * realise * (s.pot + L.toCall) - L.toCall) / s.bb;
  const where = allIn ? "" : ip ? " in position" : " out of position";
  const priced = `${vs}; the price is ${pct(price)}, and${where} you need ≈${pct(need)}.`;
  const premium = VALUE_RERAISE[lvl].has(code);

  if (action.kind === "raise") {
    if (RERAISE_RANGE[lvl].has(code)) return note(true, `Good ${word}`, `${code} is a standard ${word} here. ${vs}.`);
    if (diff > -0.05) return note(null, `Mixed ${word}`, `${code} is more often a call or fold than a ${word}, but it's a reasonable mix. ${vs}.`);
    return note(false, `${code} is too loose to ${word}`, `${code} isn't strong enough to continue, and the usual ${word} bluffs have better blockers (A5s, A4s). ${vs}.`);
  }
  if (action.kind === "call") {
    if (premium) return note(null, `${word[0].toUpperCase() + word.slice(1)} for value`, `${code} is a standard ${word}: calling lets worse hands in cheaply. ${vs}.`);
    if (diff > 0.05 && lvl === 0 && positionOf(s, seatId) === "SB" && !allIn)
      return note(null, "3-bet or fold from the SB", `${vs}. Playable, but flatting the small blind invites a squeeze and plays out of position: 3-bet it or fold.`);
    if (diff > 0.05) return note(true, "Good call", priced);
    if (diff < -0.05) return note(false, "Too weak to call", `${priced} Fold.`, -evCallBb);
    return note(null, "Close spot", `${priced} Calling or folding are both fine.`);
  }
  if (premium) return note(false, `Don't fold ${code}`, `${code} is a ${word} for value here. ${vs}.`, evCallBb);
  if (diff > 0.05) return note(false, "Fold looks too tight", `${priced} Continue with it.`, evCallBb);
  if (diff < -0.05) return note(true, "Good fold", priced);
  return note(null, "Close spot", `${priced} Folding is fine.`);
}

/* ------------------------------------------------------------------ post-flop, facing a bet */

function coachVsBet(s: PokerState, seatId: number, action: PlayerAction, eq: number, vs: string): CoachNote {
  const L = legal(s);
  const me = s.seats[seatId];
  const cls = handClass(me.hole, s.board);
  const price = L.toCall / (s.pot + L.toCall);
  const diff = eq - price;
  // River ranges are the least certain part of the model (how often people bluff varies
  // a lot), so bluff-catching decisions need a wider margin before we call them mistakes.
  const band = s.street === "river" ? 0.08 : 0.05;
  // calling wins pot + call with probability eq and costs the call; folding is 0
  const evCallBb = (eq * (s.pot + L.toCall) - L.toCall) / s.bb;
  const priced = `${vs}; you need ${pct(price)}.`;
  if (action.kind === "fold") {
    if (diff > band) return note(false, "Fold looks too tight", `${priced} The price is good enough to continue.`, evCallBb);
    if (diff < -band) return note(true, "Good fold", `${priced} Not enough equity for the price.`);
    return note(null, "Close spot", `${priced} Folding is reasonable.`);
  }
  if (action.kind === "raise") {
    if (eq > 0.6) return note(true, "Raise for value", `${vs}. You're ahead of their range: raise to build the pot.`);
    if (cls === "draw" && s.street !== "river") return note(null, "Semi-bluff raise", `${priced} A draw makes a good raise: fold equity now, outs when called.`);
    return note(null, "Bluff-raise", `${priced} It only works if they fold often.`);
  }
  if (diff > band) return note(true, "Good call", priced);
  if (diff < -band) return note(false, "Calling below the price", `${priced} Folding saves chips in the long run.`, -evCallBb);
  return note(null, "Close spot", `${priced} Calling is fine.`);
}

/* ------------------------------------------------------------------ post-flop, unopened pots */

interface Plan {
  bet: boolean;
  /** recommended bet as a fraction of the pot (0 = check) */
  size: number;
  /** textbook-clear: deviating is a mistake rather than a style choice */
  firm: boolean;
  why: string;
  /** checking to the player who bet last street is the default (leading is a mix) */
  lead?: boolean;
  /** the size is textbook-clear even when betting at all is a choice (overrides `firm` for sizing) */
  sizeFirm?: boolean;
}

const sizeWord = (f: number) => (f <= 0.4 ? "a third of the pot" : f <= 0.8 ? "about two thirds of the pot" : "pot or more");

/**
 * What the textbook does when nobody has bet yet:
 * - out of position to the player who bet last street: check to them;
 * - flop c-bet, heads-up, as the pre-flop raiser: `cbetAnswer` (range-bet small on A/K-high
 *   dry boards; elsewhere bet value, top pair and draws, check medium pairs and air);
 * - otherwise bet strong hands (big on wet boards and the river), bet top pair and draws,
 *   check medium pairs, and don't bluff into two or more players.
 */
function planFor(s: PokerState, seatId: number, opponents: number): Plan {
  const hole = s.seats[seatId].hole;
  const info = flopInfo(s.board);
  const cls = handClass(hole, s.board);
  const river = s.board.length >= 5;
  const wet = info.texture === "wet" || info.texture === "semiwet" || info.texture === "monotone";
  const prev = PREV[s.street];
  const agg = prev ? aggressorOn(s, prev) : null;

  if (agg !== null && agg !== seatId && live(s, agg) && actsAfter(s, agg, seatId))
    return {
      bet: false,
      size: 0,
      firm: false,
      lead: true,
      why:
        s.street === "flop"
          ? "Out of position to the pre-flop raiser, check to them: they bet often, so you can check-raise or check-call."
          : "Check to the player who bet last street: they keep betting often enough to give you the best of both.",
    };

  if (s.street === "flop" && opponents === 1 && agg === seatId) {
    const villain = s.seats.find((x) => x.id !== seatId && live(s, x.id))!.id;
    const ip = actsAfter(s, seatId, villain);
    const bet = cbetAnswer(info, cls) === "bet";
    const sz = sizingAnswer(hole, s.board).size;
    const size = info.favors === "raiser" ? 0.33 : sz === "check" ? 0.66 : SIZE_FRAC[sz];
    const why =
      info.favors === "raiser"
        ? ip
          ? "You raised pre-flop and this A/K-high dry flop favours you: c-bet small with your whole range."
          : "This A/K-high dry flop favours you. Out of position a small c-bet is good, but checking some hands is fine."
        : bet
          ? `C-bet ${sizeWord(size)}: your hand wants value or protection, or has a draw.`
          : "This flop hits the caller's range: check medium pairs and air instead of c-betting.";
    const firm = info.favors === "raiser" ? ip : info.favors === "caller" ? !bet : false;
    return { bet, size: bet ? size : 0, firm, sizeFirm: firm || (bet && info.favors === "caller"), why };
  }

  switch (cls) {
    case "strong":
    case "overpair": {
      if (river) {
        const nuts = cls === "strong" && nearNuts(hole, s.board);
        return {
          bet: true,
          size: nuts ? 1 : 0.66,
          firm: nuts,
          why: nuts ? "Near the nuts on the river: bet big. Their bluff-catchers have to call." : "A strong hand on the river: bet for value, but not so big that only better hands call.",
        };
      }
      const size = wet || s.street === "turn" ? 0.66 : 0.33;
      return { bet: true, size, firm: wet, why: `Strong hand: bet ${sizeWord(size)}${wet ? " and charge the draws" : ""}.` };
    }
    case "toppair":
      return river
        ? { bet: false, size: 0, firm: false, why: "Top pair on the river: bet thin if worse pairs will call, otherwise check and take it to showdown." }
        : { bet: true, size: 0.5, firm: false, why: "Top pair: a medium bet for value and protection is standard." };
    case "medium":
      return {
        bet: false,
        size: 0,
        firm: river || opponents >= 2,
        why: river
          ? "Medium pair on the river: check. Worse hands won't call a bet and better ones won't fold."
          : "Medium pair: usually check. It wins some showdowns but can't take a raise; a small protection bet heads-up is a mix.",
      };
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

const BET_TITLE: Record<HandClass, string> = {
  strong: "Value bet",
  overpair: "Value bet",
  toppair: "Thin value bet",
  medium: "Betting a medium pair",
  draw: "Semi-bluff",
  air: "Bluff",
};

function coachUnopened(s: PokerState, seatId: number, action: PlayerAction, eq: number, opponents: number, vs: string): CoachNote {
  const me = s.seats[seatId];
  const plan = planFor(s, seatId, opponents);
  const strength = Math.pow(eq, 1 / Math.max(1, opponents));
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
    return note(null, plan.lead ? "Leading out" : BET_TITLE[handClass(me.hole, s.board)], `${vs}. ${plan.why}`);
  }
  const tooBig = plan.size <= 0.4 && frac > 0.85;
  const tooSmall = plan.size >= 0.6 && frac < 0.4;
  if (tooBig || tooSmall) {
    const title = tooBig ? "Size down" : "Size up";
    const detail = `Bet ${sizeWord(plan.size)} here; you bet ${Math.round(frac * 100)}%. ${plan.why}`;
    return (plan.sizeFirm ?? plan.firm) ? note(false, title, detail, cost(plan.size, frac)) : note(null, title, detail);
  }
  const cbet = s.street === "flop" && opponents === 1 && aggressorOn(s, "preflop") === seatId;
  return note(true, cbet ? "Good c-bet" : "Good bet", `${vs}. ${plan.why}`);
}
