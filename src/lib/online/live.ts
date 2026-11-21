/**
 * Live tables with friends: the authoritative game logic the `table` edge function runs.
 *
 * Pure and storage-free, so it is unit-tested here and bundled into the edge function by
 * `scripts/build-edge.mjs`. The server keeps the full state (`Secret`: the deck, every hole
 * card) and hands out two redacted views: `public` (what everyone at the table sees) and
 * `private[userId]` (your own hole cards, your coach notes).
 *
 * Chips at a live table are table chips: everyone sits down with the same stack, and nothing
 * moves to or from anyone's chip balance (AGENTS.md: chips never move between users).
 *
 * Poker: No-Limit Hold'em, 2-6 players, freezeout. The coach is off during live hands; the
 *   hands are saved with every card face up for a joint review once the table closes.
 * Blackjack: cooperative, 1-5 players against one dealer. Everyone plays their own hand at
 *   the same time against the same dealer cards, and each player's own coach grades them.
 */
import { buildShoe, handTotal, type Card } from "../blackjack/cards";
import { gradeAction, type Decision } from "../blackjack/coach";
import {
  actionCost,
  applyAction,
  deal,
  dealerMustHit,
  legalActions,
  needsDealer,
  settleAgainst,
  type ActionType,
  type HandResult,
  type RoundState,
} from "../blackjack/engine";
import { isTableId, tableOf, type TableId } from "../blackjack/tables";
import { act as pokerAct, isHandOver, legal as pokerLegal, newTable, playersWithChips, startHand } from "../poker/game";
import type { HandEvent, LegalOptions, PlayerAction, PokerState, Pot, Winner } from "../poker/game-types";

export type Game = "poker" | "blackjack";

export interface SeatInfo {
  user: string;
  seat: number;
  name: string;
}

export interface PokerSettings {
  sb: number;
  bb: number;
  stack: number;
  /** seconds to act */
  turn: number;
}

export interface BlackjackSettings {
  bet: number;
  stack: number;
  table: TableId;
  /** seconds for everyone to finish a round */
  turn: number;
}

export const POKER_DEFAULTS: PokerSettings = { sb: 50, bb: 100, stack: 10_000, turn: 30 };
export const BLACKJACK_DEFAULTS: BlackjackSettings = { bet: 25, stack: 1_000, table: "classic", turn: 45 };

export const MAX_PLAYERS: Record<Game, number> = { poker: 6, blackjack: 5 };
/** Pause after a hand so everyone sees how it ended. */
export const NEXT_DELAY_MS = 3_500;

export class LiveError extends Error {}

/* ------------------------------------------------------------------ state */

export interface PokerSecret {
  kind: "poker";
  settings: PokerSettings;
  engine: PokerState;
  /** user id per engine seat */
  users: string[];
  left: string[];
  /** stacks when the current hand started */
  startStacks: number[];
  doneAt: number | null;
  deadline: number | null;
}

export interface BjPlayer {
  user: string;
  name: string;
  seat: number;
  stack: number;
  round: RoundState | null;
  /** this player's cards in draw order: own card, dealer up, own card, dealer hole, then own draws */
  pshoe: Card[];
  /** the stack before this round's bet */
  before: number;
  notes: Decision[];
}

export interface BjSecret {
  kind: "blackjack";
  settings: BlackjackSettings;
  shoe: Card[];
  cursor: number;
  dealer: Card[];
  players: BjPlayer[];
  left: string[];
  phase: "playing" | "settled";
  roundNo: number;
  doneAt: number | null;
  deadline: number | null;
}

export type Secret = PokerSecret | BjSecret;

export type Move =
  | { kind: "poker"; action: PlayerAction }
  | { kind: "blackjack"; action: ActionType }
  | { kind: "next" }
  | { kind: "timeout" }
  | { kind: "leave" };

/* ------------------------------------------------------------------ views */

export interface PokerSeatView {
  id: number;
  user: string;
  name: string;
  stack: number;
  folded: boolean;
  allIn: boolean;
  committed: number;
  lastAction: string | null;
  /** has cards this hand */
  dealt: boolean;
  left: boolean;
}

export interface PokerPublic {
  kind: "poker";
  handNo: number;
  sb: number;
  bb: number;
  button: number;
  board: Card[];
  street: PokerState["street"];
  toAct: number | null;
  currentBet: number;
  pot: number;
  pots: Pot[];
  winners: Winner[];
  log: HandEvent[];
  seats: PokerSeatView[];
  /** hole cards turned over at showdown */
  shown: Record<number, Card[]>;
  /** options for the player to act (everyone can see the bet sizes anyway) */
  legal: LegalOptions | null;
  deadline: number | null;
  /** seconds each player gets to act */
  turn: number;
  /** when the next hand may be dealt */
  nextAt: number | null;
  /** the table is finished: one player has every chip, or everyone else left */
  over: boolean;
}

export interface BjHandView {
  cards: Card[];
  total: number;
  soft: boolean;
  bet: number;
  doubled: boolean;
  surrendered: boolean;
  done: boolean;
  result?: HandResult;
  payout?: number;
}

export interface BjPlayerView {
  user: string;
  name: string;
  seat: number;
  stack: number;
  /** sitting this round out (not enough table chips, or left) */
  out: boolean;
  left: boolean;
  phase: "insurance" | "player" | "waiting" | "settled" | null;
  hands: BjHandView[];
  active: number;
  legal: ActionType[];
  costs: Partial<Record<ActionType, number>>;
  /** chips won or lost this round, once settled */
  net: number | null;
  insurance: { bet: number; payout: number } | null;
}

export interface BjPublic {
  kind: "blackjack";
  roundNo: number;
  phase: "playing" | "settled";
  rulesId: TableId;
  bet: number;
  dealer: (Card | null)[];
  dealerTotal: { total: number; soft: boolean } | null;
  players: BjPlayerView[];
  deadline: number | null;
  nextAt: number | null;
  over: boolean;
}

export type Public = PokerPublic | BjPublic;

export interface PokerPrivate {
  kind: "poker";
  handNo: number;
  hole: Card[];
}

export interface BjPrivate {
  kind: "blackjack";
  roundNo: number;
  /** the coach's grades for this player's decisions this round */
  notes: Decision[];
}

export type Private = PokerPrivate | BjPrivate;

/** A finished hand with every card face up, for the joint review. */
export interface HandLog {
  handNo: number;
  game: Game;
  record: PokerHandLog | BjRoundLog;
}

export interface PokerHandLog {
  board: Card[];
  players: { seat: number; user: string; name: string; hole: Card[]; net: number }[];
  log: HandEvent[];
  winners: Winner[];
  bb: number;
}

export interface BjRoundLog {
  dealer: Card[];
  players: { user: string; name: string; hands: { cards: Card[]; result?: HandResult }[]; net: number; notes: Decision[] }[];
}

export interface Outcome {
  secret: Secret;
  public: Public;
  private: Record<string, Private>;
  closed: boolean;
  deadline: number | null;
  hands: HandLog[];
}

/* ------------------------------------------------------------------ randomness */

function shuffled<T>(xs: readonly T[], rand: () => number): T[] {
  const d = [...xs];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/* ------------------------------------------------------------------ entry points */

export function startGame(game: Game, settings: Partial<PokerSettings & BlackjackSettings>, seats: SeatInfo[], rand: () => number, now: number): Outcome {
  const players = [...seats].sort((a, b) => a.seat - b.seat);
  if (players.length > MAX_PLAYERS[game]) throw new LiveError("Too many players");
  if (game === "poker") {
    if (players.length < 2) throw new LiveError("Poker needs at least two players");
    return startPoker(cleanPoker(settings), players, rand, now);
  }
  if (players.length < 1) throw new LiveError("Nobody is seated");
  return startBlackjack(cleanBlackjack(settings), players, rand, now);
}

export function applyMove(secret: Secret, move: Move, user: string, rand: () => number, now: number): Outcome {
  return secret.kind === "poker" ? pokerMove(structuredClone(secret), move, user, rand, now) : bjMove(structuredClone(secret), move, user, rand, now);
}

/** Views for a secret without changing it (for a player reloading the table). */
export function viewsOf(secret: Secret, now: number): Outcome {
  return secret.kind === "poker" ? pokerOutcome(secret, now, []) : bjOutcome(secret, now, []);
}

function int(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(hi, Math.max(lo, n));
}

export function cleanPoker(s: Partial<PokerSettings>): PokerSettings {
  const bb = int(s.bb, 2, 10_000, POKER_DEFAULTS.bb);
  return {
    bb,
    sb: Math.max(1, Math.floor(bb / 2)),
    stack: int(s.stack, bb * 20, bb * 500, POKER_DEFAULTS.stack),
    turn: int(s.turn, 10, 120, POKER_DEFAULTS.turn),
  };
}

export function cleanBlackjack(s: Partial<BlackjackSettings>): BlackjackSettings {
  const bet = int(s.bet, 1, 1_000, BLACKJACK_DEFAULTS.bet);
  return {
    bet,
    stack: int(s.stack, bet * 4, bet * 1_000, Math.max(BLACKJACK_DEFAULTS.stack, bet * 40)),
    table: isTableId(s.table) ? s.table : "classic",
    turn: int(s.turn, 15, 180, BLACKJACK_DEFAULTS.turn),
  };
}

/* ================================================================== poker */

function startPoker(settings: PokerSettings, players: SeatInfo[], rand: () => number, now: number): Outcome {
  let engine = newTable({
    heroName: players[0].name,
    bots: players.slice(1).map((p) => ({ name: p.name, style: "tag" as const })),
    stack: settings.stack,
    sb: settings.sb,
    bb: settings.bb,
  });
  // every seat is a person: no hero, no bot style
  engine.seats = engine.seats.map((x) => ({ ...x, isHero: false, style: null }));
  const users = players.map((p) => p.user);
  const secret: PokerSecret = { kind: "poker", settings, engine, users, left: [], startStacks: [], doneAt: null, deadline: null };
  engine = startHand(engine, rand);
  secret.engine = engine;
  secret.startStacks = startStacksOf(engine);
  return pokerAfter(secret, now, []);
}

/** Stacks at the start of the hand: current stack plus what's already in (the blinds). */
const startStacksOf = (e: PokerState) => e.seats.map((x) => x.stack + x.totalCommitted);

function pokerMove(s: PokerSecret, move: Move, user: string, rand: () => number, now: number): Outcome {
  const seatOf = s.users.indexOf(user);
  if (seatOf < 0) throw new LiveError("You're not at this table");
  const e = s.engine;

  switch (move.kind) {
    case "poker": {
      if (isHandOver(e) || e.toAct === null) throw new LiveError("The hand is over");
      if (e.toAct !== seatOf) throw new LiveError("It's not your turn");
      s.engine = pokerAct(e, sanitizePoker(move.action, pokerLegal(e)));
      return pokerAfter(s, now, []);
    }
    case "timeout": {
      if (isHandOver(e) || e.toAct === null) throw new LiveError("Nobody is on the clock");
      if (s.deadline === null || now < s.deadline) throw new LiveError("There's still time on the clock");
      s.engine = pokerAct(e, autoAction(e));
      return pokerAfter(s, now, []);
    }
    case "leave": {
      if (!s.left.includes(user)) s.left.push(user);
      return pokerAfter(s, now, []);
    }
    case "next": {
      if (!isHandOver(e)) throw new LiveError("The hand isn't over yet");
      if (s.doneAt !== null && now < s.doneAt + NEXT_DELAY_MS) throw new LiveError("Not yet");
      if (pokerOver(s)) throw new LiveError("The table is finished");
      // players who left forfeit their table chips
      for (const u of s.left) {
        const i = s.users.indexOf(u);
        if (i >= 0) e.seats[i] = { ...e.seats[i], stack: 0 };
      }
      s.engine = startHand(e, rand);
      s.startStacks = startStacksOf(s.engine);
      s.doneAt = null;
      return pokerAfter(s, now, []);
    }
    default:
      throw new LiveError("That move doesn't belong at a poker table");
  }
}

/** Clamp a client's action to something legal (a raise size outside the range is clamped). */
function sanitizePoker(a: PlayerAction, L: LegalOptions): PlayerAction {
  switch (a?.kind) {
    case "fold":
      return L.canCheck ? { kind: "check" } : { kind: "fold" };
    case "check":
      if (!L.canCheck) throw new LiveError("You can't check here");
      return a;
    case "call":
      return L.toCall === 0 ? { kind: "check" } : a;
    case "raise": {
      if (!L.canRaise) throw new LiveError("You can't raise here");
      const to = Math.round(Number(a.to));
      if (!Number.isFinite(to)) throw new LiveError("Bad raise size");
      return { kind: "raise", to: Math.min(L.maxRaiseTo, Math.max(L.minRaiseTo, to)) };
    }
    default:
      throw new LiveError("Unknown action");
  }
}

const autoAction = (e: PokerState): PlayerAction => (pokerLegal(e).canCheck ? { kind: "check" } : { kind: "fold" });

/** Everyone but one is out of chips, or fewer than two players who haven't left have chips. */
function pokerOver(s: PokerSecret): boolean {
  const e = s.engine;
  if (playersWithChips(e) < 2) return true;
  const staying = e.seats.filter((x, i) => x.stack > 0 && !s.left.includes(s.users[i])).length;
  return staying < 2;
}

/** After any change: auto-act for players who left, close out a finished hand, set the clock. */
function pokerAfter(s: PokerSecret, now: number, hands: HandLog[]): Outcome {
  let guard = 0;
  while (!isHandOver(s.engine) && s.engine.toAct !== null && s.left.includes(s.users[s.engine.toAct]) && guard++ < 50) {
    s.engine = pokerAct(s.engine, autoAction(s.engine));
  }
  if (isHandOver(s.engine)) {
    if (s.doneAt === null) {
      s.doneAt = now;
      hands.push(pokerHandLog(s));
    }
    s.deadline = null;
  } else {
    s.deadline = now + s.settings.turn * 1000;
  }
  return pokerOutcome(s, now, hands);
}

function pokerHandLog(s: PokerSecret): HandLog {
  const e = s.engine;
  return {
    handNo: e.handNo,
    game: "poker",
    record: {
      board: e.board,
      bb: e.bb,
      log: e.log,
      winners: e.winners,
      players: e.seats
        .map((x, i) => ({ seat: x.id, user: s.users[i], name: x.name, hole: x.hole, net: x.stack - (s.startStacks[i] ?? x.stack) }))
        .filter((p) => p.hole.length > 0),
    },
  };
}

function pokerOutcome(s: PokerSecret, now: number, hands: HandLog[]): Outcome {
  const e = s.engine;
  const done = isHandOver(e);
  const showdown = e.log.some((l) => l.kind === "showdown");
  const shown: Record<number, Card[]> = {};
  if (done && showdown) for (const x of e.seats) if (x.hole.length && !x.folded) shown[x.id] = x.hole;
  const over = done && pokerOver(s);

  const pub: PokerPublic = {
    kind: "poker",
    handNo: e.handNo,
    sb: e.sb,
    bb: e.bb,
    button: e.button,
    board: e.board,
    street: e.street,
    toAct: e.toAct,
    currentBet: e.currentBet,
    pot: e.pot,
    pots: e.pots,
    winners: e.winners,
    log: e.log,
    seats: e.seats.map((x, i) => ({
      id: x.id,
      user: s.users[i],
      name: x.name,
      stack: x.stack,
      folded: x.folded,
      allIn: x.allIn,
      committed: x.committed,
      lastAction: x.lastAction,
      dealt: x.hole.length > 0,
      left: s.left.includes(s.users[i]),
    })),
    shown,
    legal: done || e.toAct === null ? null : pokerLegal(e),
    deadline: s.deadline,
    turn: s.settings.turn,
    nextAt: done && !over && s.doneAt !== null ? s.doneAt + NEXT_DELAY_MS : null,
    over,
  };
  const priv: Record<string, Private> = {};
  e.seats.forEach((x, i) => (priv[s.users[i]] = { kind: "poker", handNo: e.handNo, hole: x.hole }));
  return { secret: s, public: pub, private: priv, closed: over, deadline: s.deadline ?? pub.nextAt, hands };
}

/* ================================================================== blackjack */

/**
 * Cards reserved per player per round. A player's own draws come from here, and so do the
 * throwaway dealer draws the engine makes when that player's round ends (the real dealer
 * hand is played once for the table and settled with `settleAgainst`). 40 covers four split
 * hands of long draws plus a full dealer draw with room to spare.
 */
const STREAM = 40;
const DECKS = 6;

function startBlackjack(settings: BlackjackSettings, seats: SeatInfo[], rand: () => number, now: number): Outcome {
  const s: BjSecret = {
    kind: "blackjack",
    settings,
    shoe: shuffled(buildShoe(DECKS), rand),
    cursor: 0,
    dealer: [],
    players: seats.map((p) => ({ user: p.user, name: p.name, seat: p.seat, stack: settings.stack, round: null, pshoe: [], before: settings.stack, notes: [] })),
    left: [],
    phase: "settled",
    roundNo: 0,
    doneAt: null,
    deadline: null,
  };
  return bjDeal(s, rand, now);
}

const inRound = (s: BjSecret) => s.players.filter((p) => p.round !== null);
const bjCanPlay = (s: BjSecret, p: BjPlayer) => !s.left.includes(p.user) && p.stack >= s.settings.bet;

function bjDeal(s: BjSecret, rand: () => number, now: number): Outcome {
  const rules = tableOf(s.settings.table).rules;
  const seated = s.players.filter((p) => bjCanPlay(s, p));
  if (!seated.length) throw new LiveError("Nobody can cover the bet");

  const need = 2 + seated.length * (2 + STREAM) + 12;
  if (s.shoe.length - s.cursor < need) {
    s.shoe = shuffled(buildShoe(DECKS), rand);
    s.cursor = 0;
  }
  const draw = () => s.shoe[s.cursor++];
  // deal like the casino: one card each, dealer up, one card each, dealer hole
  const first = seated.map(draw);
  const up = draw();
  const second = seated.map(draw);
  const hole = draw();
  s.dealer = [up, hole];

  s.roundNo++;
  s.phase = "playing";
  s.doneAt = null;
  for (const p of s.players) {
    p.round = null;
    p.notes = [];
    p.pshoe = [];
  }
  seated.forEach((p, i) => {
    const stream = Array.from({ length: STREAM }, draw);
    p.pshoe = [first[i], up, second[i], hole, ...stream];
    p.before = p.stack;
    p.round = deal(s.settings.bet, p.pshoe, rules);
  });
  s.deadline = now + s.settings.turn * 1000;
  return bjAfter(s, now, []);
}

function bjMove(s: BjSecret, move: Move, user: string, rand: () => number, now: number): Outcome {
  const p = s.players.find((x) => x.user === user);
  if (!p) throw new LiveError("You're not at this table");

  switch (move.kind) {
    case "blackjack": {
      if (s.phase !== "playing" || !p.round || p.round.phase === "settled") throw new LiveError("You're not in this round");
      const a = move.action;
      if (!legalActions(p.round).includes(a)) throw new LiveError("You can't do that now");
      const room = p.before - p.round.wagered;
      if (actionCost(p.round, { type: a }) > room) throw new LiveError("Not enough table chips for that");
      const note = gradeAction(p.round, a);
      if (note) p.notes.push(note);
      p.round = applyAction(p.round, { type: a }, p.pshoe);
      return bjAfter(s, now, []);
    }
    case "timeout": {
      if (s.phase !== "playing") throw new LiveError("Nobody is on the clock");
      if (s.deadline === null || now < s.deadline) throw new LiveError("There's still time on the clock");
      for (const x of inRound(s)) autoFinish(x);
      return bjAfter(s, now, []);
    }
    case "leave": {
      if (!s.left.includes(user)) s.left.push(user);
      autoFinish(p);
      return bjAfter(s, now, []);
    }
    case "next": {
      if (s.phase !== "settled") throw new LiveError("The round isn't over yet");
      if (s.doneAt !== null && now < s.doneAt + NEXT_DELAY_MS) throw new LiveError("Not yet");
      if (bjOver(s)) throw new LiveError("The table is finished");
      return bjDeal(s, rand, now);
    }
    default:
      throw new LiveError("That move doesn't belong at a blackjack table");
  }
}

/** Stand on everything (and decline insurance) for a player who ran out of time or left. */
function autoFinish(p: BjPlayer) {
  let guard = 0;
  while (p.round && p.round.phase !== "settled" && guard++ < 20) {
    const legal = legalActions(p.round);
    const a: ActionType = legal.includes("decline") ? "decline" : "stand";
    if (!legal.includes(a)) break;
    p.round = applyAction(p.round, { type: a }, p.pshoe);
  }
}

const bjOver = (s: BjSecret) => !s.players.some((p) => bjCanPlay(s, p));

/** When every player is done, the dealer plays once for the whole table and everyone settles. */
function bjAfter(s: BjSecret, now: number, hands: HandLog[]): Outcome {
  if (s.phase === "playing" && inRound(s).every((p) => p.round!.phase === "settled")) {
    const rules = tableOf(s.settings.table).rules;
    const dealer = [...s.dealer];
    if (inRound(s).some((p) => needsDealer(p.round!))) {
      while (dealerMustHit(dealer, rules)) dealer.push(s.shoe[s.cursor++]);
    }
    s.dealer = dealer;
    for (const p of inRound(s)) {
      p.round = settleAgainst(p.round!, dealer);
      p.stack = p.before - p.round.wagered + p.round.payout;
    }
    s.phase = "settled";
    s.doneAt = now;
    s.deadline = null;
    hands.push({
      handNo: s.roundNo,
      game: "blackjack",
      record: {
        dealer,
        players: inRound(s).map((p) => ({
          user: p.user,
          name: p.name,
          hands: p.round!.hands.map((h) => ({ cards: h.cards, result: h.result })),
          net: p.stack - p.before,
          notes: p.notes,
        })),
      },
    });
  }
  return bjOutcome(s, now, hands);
}

function bjOutcome(s: BjSecret, now: number, hands: HandLog[]): Outcome {
  const settled = s.phase === "settled";
  const over = settled && bjOver(s);
  const up = s.dealer[0] ?? null;
  const pub: BjPublic = {
    kind: "blackjack",
    roundNo: s.roundNo,
    phase: s.phase,
    rulesId: s.settings.table,
    bet: s.settings.bet,
    dealer: settled ? s.dealer : up ? [up, null] : [],
    dealerTotal: settled ? handTotal(s.dealer) : up ? handTotal([up]) : null,
    players: s.players.map((p) => bjPlayerView(s, p)),
    deadline: s.deadline,
    nextAt: settled && !over && s.doneAt !== null ? s.doneAt + NEXT_DELAY_MS : null,
    over,
  };
  const priv: Record<string, Private> = {};
  for (const p of s.players) priv[p.user] = { kind: "blackjack", roundNo: s.roundNo, notes: p.notes };
  return { secret: s, public: pub, private: priv, closed: over, deadline: s.deadline ?? pub.nextAt, hands };
}

function bjPlayerView(s: BjSecret, p: BjPlayer): BjPlayerView {
  const r = p.round;
  const tableSettled = s.phase === "settled";
  const left = s.left.includes(p.user);
  if (!r) {
    return { user: p.user, name: p.name, seat: p.seat, stack: p.stack, out: true, left, phase: null, hands: [], active: 0, legal: [], costs: {}, net: null, insurance: null };
  }
  // a round the engine finished early is "waiting" until the shared dealer has played
  const phase = r.phase === "settled" ? (tableSettled ? "settled" : "waiting") : r.phase;
  const legal = phase === "player" || phase === "insurance" ? legalActions(r) : [];
  const room = p.before - r.wagered;
  const costs: Partial<Record<ActionType, number>> = {};
  for (const a of legal) {
    const c = actionCost(r, { type: a });
    if (c) costs[a] = c;
  }
  return {
    user: p.user,
    name: p.name,
    seat: p.seat,
    stack: tableSettled ? p.stack : p.before - r.wagered,
    out: false,
    left,
    phase,
    hands: r.hands.map((h) => {
      const t = handTotal(h.cards);
      return {
        cards: h.cards,
        total: t.total,
        soft: t.soft,
        bet: h.bet,
        doubled: h.doubled,
        surrendered: h.surrendered,
        done: h.done,
        ...(tableSettled ? { result: h.result, payout: h.payout } : {}),
      };
    }),
    active: r.active,
    legal: legal.filter((a) => (costs[a] ?? 0) <= room),
    costs,
    net: tableSettled ? p.stack - p.before : null,
    insurance: r.insurance && tableSettled ? r.insurance : r.insurance ? { bet: r.insurance.bet, payout: 0 } : null,
  };
}
