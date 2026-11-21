/**
 * Shared types for the No-Limit Hold'em practice table (6-max, play chips, hero vs bots).
 * The engine (game.ts), bots (bots.ts), coach (table-coach.ts) and the 3D table UI all
 * build on these. Fields may be added; don't remove or rename existing ones.
 */
import type { Card } from "../blackjack/cards";
import type { HandClass } from "./postflop";

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown" | "done";

/** What a player does. `raise` covers opening bets too; `to` is the player's TOTAL
 * committed chips on this street after the action (not the increment). */
export type PlayerAction = { kind: "fold" } | { kind: "check" } | { kind: "call" } | { kind: "raise"; to: number };

export type TablePosition = "UTG" | "HJ" | "CO" | "BTN" | "SB" | "BB";

export type BotStyle = "nit" | "tag" | "lag" | "station";

export interface Seat {
  /** 0..5, fixed seat index around the table; seat 0 is always the hero */
  id: number;
  name: string;
  isHero: boolean;
  style: BotStyle | null;
  /** bot strength 0..1 (1 = plays its style perfectly; lower = more blunders). Hero: undefined */
  skill?: number;
  stack: number;
  /** two hole cards while in a hand, [] otherwise */
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  /** chips put in on the current street */
  committed: number;
  /** chips put in over the whole hand (for side pots) */
  totalCommitted: number;
  /** has acted since the last bet/raise on this street */
  acted: boolean;
  /** short label of the last action this street, e.g. "Raise 60", "Check", "Fold" */
  lastAction: string | null;
}

export interface HandEvent {
  kind: "blind" | "deal" | "action" | "board" | "showdown" | "win";
  seat?: number;
  street: Street;
  text: string;
}

export interface Pot {
  amount: number;
  /** seat ids that can win this pot */
  eligible: number[];
}

export interface Winner {
  seat: number;
  amount: number;
  /** e.g. "Two pair, kings and sevens"; absent when everyone else folded */
  hand?: string;
  /** which pot: 0 = main, 1+ = side pots */
  pot: number;
}

export interface PokerState {
  handNo: number;
  sb: number;
  bb: number;
  button: number;
  seats: Seat[];
  board: Card[];
  /** undealt cards, top of deck first (never sent anywhere, it's all client-side) */
  deck: Card[];
  street: Street;
  /** seat id whose turn it is, or null between streets / when the hand is over */
  toAct: number | null;
  /** highest `committed` on this street */
  currentBet: number;
  /** size of the last full raise on this street (min-raise increment), starts at bb */
  lastRaiseSize: number;
  /** total chips in the middle including current-street commitments */
  pot: number;
  /** filled when the hand ends */
  pots: Pot[];
  winners: Winner[];
  log: HandEvent[];
}

export interface LegalOptions {
  canFold: boolean;
  canCheck: boolean;
  /** chips needed to call (0 when checking is possible); capped at the stack */
  toCall: number;
  canRaise: boolean;
  /** smallest legal `to` for a raise/bet (or all-in total if the stack is short) */
  minRaiseTo: number;
  /** all-in `to` amount */
  maxRaiseTo: number;
  /** true when nobody has bet this street yet, so the UI should say "Bet" rather than "Raise" */
  isOpeningBet: boolean;
}

export interface CoachNote {
  /** true = good play, false = mistake, null = no clear verdict / informational */
  ok: boolean | null;
  title: string;
  detail: string;
  /** rough big blinds given up vs the coach's play; only set on mistakes when it can be estimated */
  cost?: number;
  /** the decision in structured form, for leak detection (see CoachSpot) */
  spot?: CoachSpot;
}

/** The situation, by who has the initiative and how many raises hero faces. */
export type SpotFamily =
  /** folded to hero pre-flop */
  | "open"
  /** pre-flop behind one or more limpers */
  | "iso"
  /** big blind, limped pot, option to check or raise */
  | "bb-option"
  /** facing a single pre-flop raise */
  | "vs-open"
  /** hero opened and faces a 3-bet */
  | "vs-3bet"
  /** hero 3-bet and faces a 4-bet (or later) */
  | "vs-4bet"
  /** facing two or more raises without having raised (cold 3-bets, squeezes) */
  | "cold"
  /** post-flop, facing a bet or raise */
  | "vs-bet"
  /** post-flop, nobody has bet, hero was the last aggressor (c-bet / barrel) */
  | "cbet"
  /** post-flop, nobody has bet, out of position to the last aggressor */
  | "lead"
  /** post-flop, nobody has bet, nobody (or someone behind hero who checked) had the initiative */
  | "first-in";

export type SimpleAction = "fold" | "check" | "call" | "raise";

/**
 * One graded hero decision in structured form. Everything the coach used to grade it, plus
 * the play it would have made, so leaks can be counted by situation and direction.
 */
export interface CoachSpot {
  family: SpotFamily;
  street: Street;
  pos: TablePosition;
  /**
   * Position of the player who made the bet hero faces; when nobody has bet, of last street's
   * aggressor, or of the only opponent when hero had the initiative heads-up.
   */
  vs?: TablePosition;
  /** hand code, e.g. "AKs", "T9o", "77" */
  hand: string;
  /** post-flop hand class */
  cls?: HandClass;
  chosen: SimpleAction;
  /** the coach's play; absent when it has no single answer (mixed and close spots) */
  best?: SimpleAction;
  /** chosen bet as a fraction of the pot (post-flop bets and raises) */
  size?: number;
  /** the coach's bet size as a fraction of the pot, when it recommends a bet */
  bestSize?: number;
  /**
   * Which way the choice missed: -1 tighter / more passive than the coach (fold vs call,
   * check vs bet, bet too small), +1 looser / more aggressive, 0 the same play.
   * Absent when the coach has no single answer.
   */
  dir?: -1 | 0 | 1;
  /** what the grade rests on: a pre-flop chart, an equity-vs-price estimate, the post-flop plan, or a fixed rule */
  graded: "chart" | "equity" | "plan" | "rule";
  /** effective stack with the deepest live opponent, in big blinds */
  effBb: number;
  /** live opponents in the hand */
  opps: number;
  /** hero acts last post-flop against everyone still in */
  ip: boolean;
  /** hero's estimated equity (0..1), when the coach computed it */
  eq?: number;
  potBb: number;
  toCallBb: number;
}
