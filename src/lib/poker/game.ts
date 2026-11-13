/**
 * No-Limit Hold'em engine for the 6-max practice table. Pure and deterministic: every
 * function returns a new state, and all randomness comes from the `rand` passed in.
 * Chips are integers; `sum(stacks) + pot` is constant during a hand, and after the hand
 * is awarded `pot` is 0 (the breakdown stays in `pots` / `winners`).
 */
import type { Card } from "../blackjack/cards";
import { DECK, describe } from "./eval";
import type { BotStyle, HandEvent, LegalOptions, PlayerAction, PokerState, Pot, Seat, Street, Winner } from "./game-types";

export type TablePosition = "UTG" | "HJ" | "CO" | "BTN" | "SB" | "BB";

export interface NewTableOptions {
  heroName: string;
  bots: { name: string; style: BotStyle }[];
  stack: number;
  sb: number;
  bb: number;
}

const clone = (s: PokerState): PokerState => structuredClone(s);

// ---- seat predicates -------------------------------------------------------------------

/** dealt into the current hand */
const dealt = (x: Seat) => x.hole.length > 0;
/** still contesting the pot */
const live = (x: Seat) => dealt(x) && !x.folded;
/** can still make decisions */
const canMove = (x: Seat) => live(x) && !x.allIn;

/** First seat after `from` (clockwise, wrapping, `from` itself checked last) matching `pred`. */
function nextSeat(s: PokerState, from: number, pred: (x: Seat, i: number) => boolean): number | null {
  const n = s.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (pred(s.seats[i], i)) return i;
  }
  return null;
}

const othersCanMove = (s: PokerState, i: number) => s.seats.some((x, j) => j !== i && canMove(x));

function needsToAct(s: PokerState, i: number): boolean {
  const x = s.seats[i];
  if (!canMove(x)) return false;
  return x.committed < s.currentBet || (!x.acted && othersCanMove(s, i));
}

function log(s: PokerState, kind: HandEvent["kind"], text: string, seat?: number, street: Street = s.street) {
  s.log.push(seat === undefined ? { kind, street, text } : { kind, seat, street, text });
}

/** Move `amount` chips from a seat's stack into the pot (caller guarantees amount <= stack). */
function put(s: PokerState, x: Seat, amount: number) {
  x.stack -= amount;
  x.committed += amount;
  x.totalCommitted += amount;
  s.pot += amount;
  if (x.stack === 0) x.allIn = true;
}

// ---- table setup -----------------------------------------------------------------------

export function newTable(opts: NewTableOptions): PokerState {
  const { heroName, bots, stack, sb, bb } = opts;
  if (!Number.isInteger(stack) || !Number.isInteger(sb) || !Number.isInteger(bb) || sb <= 0 || bb < sb || stack <= 0)
    throw new Error("Stack and blinds must be positive integers with sb <= bb");
  const mk = (id: number, name: string, isHero: boolean, style: BotStyle | null): Seat => ({
    id,
    name,
    isHero,
    style,
    stack,
    hole: [],
    folded: false,
    allIn: false,
    committed: 0,
    totalCommitted: 0,
    acted: false,
    lastAction: null,
  });
  const seats = [mk(0, heroName, true, null), ...bots.map((b, i) => mk(i + 1, b.name, false, b.style))];
  return {
    handNo: 0,
    sb,
    bb,
    // the first startHand moves the button one seat on, so the hero starts on the button
    button: seats.length - 1,
    seats,
    board: [],
    deck: [],
    street: "done",
    toAct: null,
    currentBet: 0,
    lastRaiseSize: bb,
    pot: 0,
    pots: [],
    winners: [],
    log: [],
  };
}

function shuffle(rand: () => number): Card[] {
  const d = [...DECK];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** Seats of the small and big blind for the current hand (heads-up: the button posts the SB). */
export function blindSeats(s: PokerState): { sb: number; bb: number } {
  const anyDealt = s.seats.some(dealt);
  const inHand = (x: Seat) => (anyDealt ? dealt(x) : x.stack > 0);
  const count = s.seats.filter(inHand).length;
  const sb = count === 2 ? s.button : (nextSeat(s, s.button, inHand) ?? s.button);
  const bb = nextSeat(s, sb, inHand) ?? sb;
  return { sb, bb };
}

export function startHand(state: PokerState, rand: () => number): PokerState {
  const s = clone(state);
  const withChips = s.seats.filter((x) => x.stack > 0).length;
  if (withChips < 2) throw new Error("Need at least two players with chips to start a hand");

  s.handNo += 1;
  s.button = nextSeat(s, s.button, (x) => x.stack > 0)!;
  for (const x of s.seats) {
    x.hole = [];
    x.folded = x.stack === 0; // busted seats sit out
    x.allIn = false;
    x.committed = 0;
    x.totalCommitted = 0;
    x.acted = false;
    x.lastAction = x.stack === 0 ? "Sitting out" : null;
  }
  s.board = [];
  s.pots = [];
  s.winners = [];
  s.log = [];
  s.street = "preflop";
  s.toAct = null;
  s.currentBet = 0;
  s.lastRaiseSize = s.bb;
  s.pot = 0;
  s.deck = shuffle(rand);

  const active = (x: Seat) => !x.folded;
  // deal two cards each, one at a time, starting left of the button
  const order: number[] = [];
  for (let i = nextSeat(s, s.button, active)!; order.length < withChips; i = nextSeat(s, i, active)!) order.push(i);
  for (let r = 0; r < 2; r++) for (const i of order) s.seats[i].hole.push(s.deck.shift()!);
  log(s, "deal", `Hand #${s.handNo}: ${s.seats[s.button].name} has the button`);

  const sbSeat = withChips === 2 ? s.button : nextSeat(s, s.button, active)!;
  const bbSeat = nextSeat(s, sbSeat, active)!;
  const post = (i: number, amount: number, label: string) => {
    const x = s.seats[i];
    const a = Math.min(amount, x.stack);
    put(s, x, a);
    x.lastAction = `${label} ${a}`;
    log(s, "blind", `${x.name} posts the ${label === "SB" ? "small" : "big"} blind ${a}${x.allIn ? " (all-in)" : ""}`, i);
  };
  post(sbSeat, s.sb, "SB");
  post(bbSeat, s.bb, "BB");
  // a short big blind still has to be called in full (uncalled chips come back later)
  s.currentBet = s.bb;
  return advance(s, bbSeat);
}

// ---- betting ---------------------------------------------------------------------------

const NO_OPTIONS: LegalOptions = { canFold: false, canCheck: false, toCall: 0, canRaise: false, minRaiseTo: 0, maxRaiseTo: 0, isOpeningBet: false };

export function legal(s: PokerState): LegalOptions {
  if (s.toAct === null || s.street === "done" || s.street === "showdown") return { ...NO_OPTIONS };
  const x = s.seats[s.toAct];
  const owed = Math.max(0, s.currentBet - x.committed);
  const toCall = Math.min(owed, x.stack);
  const maxRaiseTo = x.committed + x.stack;
  // betting is only re-opened for a player by a full raise (acted is reset then)
  const canRaise = !x.acted && othersCanMove(s, s.toAct) && maxRaiseTo > s.currentBet;
  const minFull = s.currentBet + s.lastRaiseSize;
  return {
    canFold: true,
    canCheck: owed === 0,
    toCall,
    canRaise,
    minRaiseTo: canRaise ? Math.min(minFull, maxRaiseTo) : 0,
    maxRaiseTo: canRaise ? maxRaiseTo : 0,
    isOpeningBet: s.currentBet === 0,
  };
}

export function act(state: PokerState, action: PlayerAction): PokerState {
  if (state.toAct === null || state.street === "done") throw new Error("No player is due to act");
  const L = legal(state);
  const s = clone(state);
  const i = s.toAct!;
  const x = s.seats[i];

  switch (action.kind) {
    case "fold":
      x.folded = true;
      x.lastAction = "Fold";
      log(s, "action", `${x.name} folds`, i);
      break;
    case "check":
      if (!L.canCheck) throw new Error(`${x.name} can't check: ${L.toCall} to call`);
      x.lastAction = "Check";
      log(s, "action", `${x.name} checks`, i);
      break;
    case "call": {
      if (L.canCheck) {
        // calling nothing is a check
        x.lastAction = "Check";
        log(s, "action", `${x.name} checks`, i);
        break;
      }
      put(s, x, L.toCall);
      x.lastAction = x.allIn ? `All-in ${x.committed}` : `Call ${x.committed}`;
      log(s, "action", `${x.name} calls ${L.toCall}${x.allIn ? " (all-in)" : ""}`, i);
      break;
    }
    case "raise": {
      if (!L.canRaise) throw new Error(`${x.name} can't raise here${L.toCall > 0 ? " (call or fold)" : ""}`);
      if (typeof action.to !== "number" || !Number.isFinite(action.to)) throw new Error("Raise amount must be a number");
      let to = Math.floor(action.to);
      if (to >= L.maxRaiseTo) to = L.maxRaiseTo;
      if (to < L.minRaiseTo) throw new Error(`Minimum ${L.isOpeningBet ? "bet" : "raise"} is to ${L.minRaiseTo}`);
      const increment = to - s.currentBet;
      const opening = s.currentBet === 0;
      put(s, x, to - x.committed);
      if (increment >= s.lastRaiseSize) {
        s.lastRaiseSize = increment;
        for (const o of s.seats) if (o !== x && canMove(o)) o.acted = false;
      }
      s.currentBet = to;
      const verb = opening ? "bets" : "raises to";
      x.lastAction = x.allIn ? `All-in ${to}` : opening ? `Bet ${to}` : `Raise ${to}`;
      log(s, "action", `${x.name} ${verb} ${to}${x.allIn ? " (all-in)" : ""}`, i);
      break;
    }
    default:
      throw new Error(`Unknown action ${(action as { kind: string }).kind}`);
  }
  x.acted = true;
  return advance(s, i);
}

/** Give back the part of the biggest bet on this street that nobody matched. */
function returnUncalled(s: PokerState) {
  let top = -1;
  for (let i = 0; i < s.seats.length; i++) if (top < 0 || s.seats[i].committed > s.seats[top].committed) top = i;
  if (top < 0) return;
  const second = Math.max(0, ...s.seats.filter((_, j) => j !== top).map((o) => o.committed));
  const x = s.seats[top];
  const extra = x.committed - second;
  if (extra <= 0) return;
  x.committed -= extra;
  x.totalCommitted -= extra;
  x.stack += extra;
  s.pot -= extra;
  if (x.stack > 0) x.allIn = false;
  log(s, "action", `Uncalled ${extra} returned to ${x.name}`, top);
}

const NEXT: Partial<Record<Street, Street>> = { preflop: "flop", flop: "turn", turn: "river" };

function dealStreet(s: PokerState) {
  const next = NEXT[s.street]!;
  s.deck.shift(); // burn
  const n = next === "flop" ? 3 : 1;
  const cards = s.deck.splice(0, n);
  s.board.push(...cards);
  s.street = next;
  log(s, "board", `${next[0].toUpperCase()}${next.slice(1)}: ${cards.join(" ")}`);
}

function newStreetReset(s: PokerState) {
  for (const x of s.seats) {
    x.committed = 0;
    x.acted = false;
    if (live(x)) x.lastAction = x.allIn ? "All-in" : null;
  }
  s.currentBet = 0;
  s.lastRaiseSize = s.bb;
}

/** After seat `from` acted (or blinds were posted): pass the turn or close the round. */
function advance(s: PokerState, from: number): PokerState {
  if (s.seats.filter(live).length === 1) return awardFoldout(s);
  const nxt = nextSeat(s, from, (_, i) => needsToAct(s, i));
  if (nxt !== null) {
    s.toAct = nxt;
    return s;
  }
  // betting round complete
  s.toAct = null;
  returnUncalled(s);
  if (s.street === "river") return showdown(s);
  if (s.seats.filter(canMove).length <= 1) {
    // nobody left to bet: run the board out
    newStreetReset(s);
    while (s.board.length < 5) dealStreet(s);
    return showdown(s);
  }
  newStreetReset(s);
  dealStreet(s);
  const first = nextSeat(s, s.button, (_, i) => needsToAct(s, i));
  s.toAct = first;
  return s;
}

function finishHand(s: PokerState) {
  for (const x of s.seats) x.committed = 0;
  s.pot = 0;
  s.street = "done";
  s.toAct = null;
  s.currentBet = 0;
}

function awardFoldout(s: PokerState): PokerState {
  returnUncalled(s);
  const w = s.seats.find(live)!;
  const amount = s.pot;
  w.stack += amount;
  s.pots = [{ amount, eligible: [w.id] }];
  s.winners = [{ seat: w.id, amount, pot: 0 }];
  log(s, "win", `${w.name} wins ${amount}`, w.id);
  finishHand(s);
  return s;
}

/** Main pot + side pots from everyone's total commitment (folded chips count, can't win). */
export function buildPots(s: PokerState): Pot[] {
  const contenders = s.seats.filter(live);
  const levels = [...new Set(contenders.map((x) => x.totalCommitted))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const x of s.seats) amount += Math.max(0, Math.min(x.totalCommitted, level) - prev);
    const eligible = contenders.filter((x) => x.totalCommitted >= level).map((x) => x.id);
    if (amount > 0) pots.push({ amount, eligible });
    prev = level;
  }
  let leftover = 0;
  for (const x of s.seats) leftover += Math.max(0, x.totalCommitted - prev);
  if (leftover > 0) {
    if (pots.length) pots[pots.length - 1].amount += leftover;
    else pots.push({ amount: leftover, eligible: contenders.map((x) => x.id) });
  }
  return pots;
}

function showdown(s: PokerState): PokerState {
  s.street = "showdown";
  s.toAct = null;
  const contenders = s.seats.filter(live);
  const score = new Map<number, number>();
  for (const x of contenders) {
    const d = describe([...x.hole, ...s.board]);
    score.set(x.id, d.score);
    log(s, "showdown", `${x.name} shows ${x.hole.join(" ")}: ${d.name}`, x.id);
  }
  // seats in order starting left of the button (odd chips go to the first winner)
  const order: number[] = [];
  for (let k = 1; k <= s.seats.length; k++) order.push((s.button + k) % s.seats.length);

  const pots = buildPots(s);
  const winners: Winner[] = [];
  pots.forEach((p, potIdx) => {
    const best = Math.max(...p.eligible.map((id) => score.get(id)!));
    const ws = order.filter((id) => p.eligible.includes(id) && score.get(id) === best);
    const share = Math.floor(p.amount / ws.length);
    let odd = p.amount - share * ws.length;
    for (const id of ws) {
      const amount = share + (odd > 0 ? 1 : 0);
      if (odd > 0) odd--;
      s.seats[id].stack += amount;
      const hand = describe([...s.seats[id].hole, ...s.board]).name;
      winners.push({ seat: id, amount, hand, pot: potIdx });
      const potName = pots.length > 1 ? (potIdx === 0 ? " the main pot" : ` side pot ${potIdx}`) : "";
      log(s, "win", `${s.seats[id].name} wins ${amount}${potName ? ` from${potName}` : ""} with ${hand}`, id);
    }
  });
  s.pots = pots;
  s.winners = winners;
  finishHand(s);
  return s;
}

// ---- helpers for the UI, bots and coach ------------------------------------------------

/** Positions for the seats dealt in (or with chips, between hands), counted from the button. */
export function positionOf(s: PokerState, seatId: number): TablePosition {
  const anyDealt = s.seats.some(dealt);
  const inHand = (x: Seat) => (anyDealt ? dealt(x) : x.stack > 0);
  const order: number[] = [];
  for (let k = 0; k < s.seats.length; k++) {
    const i = (s.button + k) % s.seats.length;
    if (inHand(s.seats[i])) order.push(i);
  }
  const n = order.length;
  const idx = order.indexOf(seatId);
  if (idx < 0) return "UTG";
  if (n <= 2) return idx === 0 ? "BTN" : "BB";
  if (idx === 0) return "BTN";
  if (idx === 1) return "SB";
  if (idx === 2) return "BB";
  const early: TablePosition[] = ["UTG", "HJ", "CO"].slice(3 - (n - 3)) as TablePosition[];
  return early[idx - 3] ?? "UTG";
}

/** Players still contesting the current hand (dealt in, not folded). */
export const activeCount = (s: PokerState) => s.seats.filter(live).length;
/** Players with chips (who'll be dealt into the next hand). */
export const playersWithChips = (s: PokerState) => s.seats.filter((x) => x.stack > 0).length;
export const isHandOver = (s: PokerState) => s.street === "done";
/** Live opponents of a seat in the current hand. */
export const opponentsOf = (s: PokerState, seatId: number) => s.seats.filter((x) => x.id !== seatId && live(x)).length;
/** Price of calling: toCall / (pot + toCall), 0 when there's nothing to call. */
export function potOdds(s: PokerState): number {
  const { toCall } = legal(s);
  return toCall > 0 ? toCall / (s.pot + toCall) : 0;
}
/** Number of bets/raises made so far on the current street (blinds don't count). */
export function raisesThisStreet(s: PokerState): number {
  let n = 0;
  for (const e of s.log) {
    if (e.kind !== "action" || e.street !== s.street || e.seat === undefined) continue;
    const rest = e.text.slice(s.seats[e.seat].name.length);
    if (rest.startsWith(" bets ") || rest.startsWith(" raises to ")) n++;
  }
  return n;
}
/** Sum of stacks plus the pot: constant for the whole session (chip conservation). */
export const totalChips = (s: PokerState) => s.seats.reduce((n, x) => n + x.stack, 0) + s.pot;

/**
 * Test/debug helper: replace hole cards and stack the deck so the next board cards are
 * `board` (in order). Seats not listed keep fresh random-free cards from the remaining deck.
 * Use right after startHand, before any community cards are dealt.
 */
export function rigDeck(state: PokerState, holes: Record<number, Card[]>, board: Card[] = []): PokerState {
  const s = clone(state);
  const used = new Set<Card>([...Object.values(holes).flat(), ...board, ...s.board]);
  const rest = DECK.filter((c) => !used.has(c));
  for (const x of s.seats) {
    if (!dealt(x)) continue;
    x.hole = holes[x.id] ? [...holes[x.id]] : [rest.shift()!, rest.shift()!];
  }
  const b = [...board];
  while (b.length < 5 - s.board.length) b.push(rest.pop()!);
  const deck: Card[] = [];
  let bi = 0;
  const streets = s.board.length === 0 ? [3, 1, 1] : s.board.length === 3 ? [1, 1] : s.board.length === 4 ? [1] : [];
  for (const n of streets) {
    deck.push(rest.shift()!);
    for (let k = 0; k < n; k++) deck.push(b[bi++]);
  }
  s.deck = [...deck, ...rest];
  return s;
}
