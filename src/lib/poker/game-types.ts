/**
 * Shared types for the No-Limit Hold'em practice table (6-max, play chips, hero vs bots).
 * The engine (game.ts), bots (bots.ts), coach (table-coach.ts) and the 3D table UI all
 * build on these. Fields may be added; don't remove or rename existing ones.
 */
import type { Card } from "../blackjack/cards";

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown" | "done";

/** What a player does. `raise` covers opening bets too; `to` is the player's TOTAL
 * committed chips on this street after the action (not the increment). */
export type PlayerAction = { kind: "fold" } | { kind: "check" } | { kind: "call" } | { kind: "raise"; to: number };

export type BotStyle = "nit" | "tag" | "lag" | "station";

export interface Seat {
  /** 0..5, fixed seat index around the table; seat 0 is always the hero */
  id: number;
  name: string;
  isHero: boolean;
  style: BotStyle | null;
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
}
