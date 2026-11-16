"use client";

/**
 * Blackjack against the dealer, played entirely on the device. Same rules engine and coach
 * as before; chips and history live in the progress store. Every live decision is graded
 * against basic strategy and moves the blackjack rating.
 */
import { chipsToUnits, MAX_BET, MIN_BET } from "../chips";
import { applyRating, getProgress, touchDay, update, type ActiveRound, type BjRoundRecord, type Progress } from "../store";
import { difficultyOf } from "../rating";
import { gradeAction, type Decision } from "./coach";
import { applyAction, deal, toView, type ActionType, type RoundView } from "./engine";
import { shuffledShoe } from "./shoe";
import { tableOf, type TableId } from "./tables";

export class GameError extends Error {}

export interface RoundPayload {
  id: string;
  tableId: TableId;
  view: RoundView;
}

const payload = (r: ActiveRound): RoundPayload => ({ id: r.id, tableId: r.tableId, view: toView(r.state) });

function settle(p: Progress, r: ActiveRound) {
  const s = r.state;
  p.chips += s.payout;
  const record: BjRoundRecord = {
    id: r.id,
    at: r.at,
    tableId: r.tableId,
    bet: s.hands[0]?.bet ?? 0,
    wagered: s.wagered,
    payout: s.payout,
    dealer: s.dealer,
    hands: toView(s).hands.map((h) => ({ cards: h.cards, result: h.result, total: h.total })),
    decisions: r.decisions,
  };
  p.bjRounds.push(record);
  p.activeRound = null;
}

export function startRound(betChips: number, tableId: TableId): { round: RoundPayload; chips: number } {
  if (!Number.isFinite(betChips) || betChips < MIN_BET || betChips > MAX_BET) {
    throw new GameError(`Bets are ${MIN_BET}–${MAX_BET.toLocaleString()} chips`);
  }
  const bet = chipsToUnits(betChips);
  const table = tableOf(tableId);
  let out: ActiveRound | null = null;
  const p = update((p) => {
    if (p.activeRound) throw new GameError("Finish your current hand first");
    if (p.chips < bet) throw new GameError("Not enough chips. Refill to keep playing.");
    p.chips -= bet;
    const shoe = shuffledShoe();
    const state = deal(bet, shoe, table.rules);
    const r: ActiveRound = { id: crypto.randomUUID(), tableId: table.id, state, shoe, decisions: [], at: Date.now() };
    out = r;
    touchDay(p);
    if (state.phase === "settled") settle(p, r);
    else p.activeRound = r;
  });
  return { round: payload(out!), chips: p.chips };
}

export function playAction(roundId: string, action: ActionType): { round: RoundPayload; chips: number; decision: Decision | null } {
  let decision: Decision | null = null;
  let after: ActiveRound | null = null;
  const p = update((p) => {
    const r = p.activeRound;
    if (!r || r.id !== roundId) throw new GameError("That hand is already over");
    decision = r.state.phase === "insurance" || r.state.phase === "player" ? gradeAction(r.state, action) : null;
    const next = applyAction(r.state, { type: action }, r.shoe);
    const extra = next.wagered - r.state.wagered;
    if (extra > p.chips) throw new GameError("Not enough chips for that");
    p.chips -= extra;
    r.state = next;
    if (decision) {
      r.decisions.push(decision);
      applyRating(p, "blackjack", difficultyOf(decision.kind), decision.ok ? 1 : 0);
    }
    after = { ...r };
    if (next.phase === "settled") settle(p, r);
  });
  return { round: payload(after!), chips: p.chips, decision };
}

/**
 * A hand left unfinished from an earlier visit is finished the way a casino treats an
 * abandoned hand: insurance declined, every live hand stands.
 */
export function settleAbandoned(): { round: RoundPayload; chips: number } | null {
  if (!getProgress().activeRound) return null;
  let after: ActiveRound | null = null;
  const p = update((p) => {
    const r = p.activeRound;
    if (!r) return;
    let s = r.state;
    for (let guard = 0; s.phase !== "settled" && guard < 12; guard++) {
      s = applyAction(s, { type: s.phase === "insurance" ? "decline" : "stand" }, r.shoe);
    }
    r.state = s;
    after = { ...r };
    settle(p, r);
  });
  return after ? { round: payload(after), chips: p.chips } : null;
}

/** Top the balance back up to the refill amount (practice chips, no cooldown). */
export function refill(toChips: number) {
  update((p) => {
    p.chips = Math.max(p.chips, chipsToUnits(toChips));
  });
}
