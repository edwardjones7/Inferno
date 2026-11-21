/**
 * Grades player decisions against basic strategy for the table's rules. Shared by the
 * server (grading live play), the table UI (coach feedback) and the drill trainer.
 */
import type { Card } from "./cards";
import { legalActions, type ActionType, type RoundState, type Rules } from "./engine";
import { INSURANCE_COST, mistakeCost, moveEVs } from "./ev";
import { basicStrategy, chartMove, explain, MOVE_LABEL, spotOf, type Move, type SpotKind } from "./strategy";

export interface Decision {
  /** chart cell id, e.g. "hard-16-10", or "insurance" */
  spot: string;
  label: string;
  kind: SpotKind | "insurance";
  chosen: ActionType;
  correct: Move | "decline";
  ok: boolean;
  /** why the correct play is correct (only stored for mistakes, to keep rows small) */
  why?: string;
  /** expected loss vs the correct play, as a fraction of the bet (only for mistakes) */
  cost?: number;
  /** think time in milliseconds, from the decision being offered to the click (live play only) */
  ms?: number;
}

/** Grade the action the player is about to take in this state (call before applying it). */
export function gradeAction(state: RoundState, action: ActionType): Decision | null {
  if (state.phase === "insurance") {
    // Basic strategy never takes insurance (it's a side bet with a house edge of ~7%).
    const ok = action === "decline";
    return {
      spot: "insurance",
      label: "Insurance offered",
      kind: "insurance",
      chosen: action,
      correct: "decline",
      ok,
      why: ok ? undefined : "Insurance is a side bet the house wins over time. Basic strategy never takes it.",
      cost: ok ? undefined : INSURANCE_COST,
    };
  }
  if (state.phase !== "player") return null;
  const hand = state.hands[state.active];
  return gradeSpot(hand.cards, state.dealer[0], legalActions(state), state.rules, action);
}

export function gradeSpot(cards: readonly Card[], dealerUp: Card, legal: readonly ActionType[], rules: Rules, action: ActionType): Decision {
  const correct = basicStrategy(cards, dealerUp, legal, rules);
  const spot = spotOf(cards, dealerUp);
  const chart = chartMove(spot, rules);
  const ok = action === correct;
  // EV tables are memoised per rules + upcard, so pricing a mistake is a few lookups.
  const cost = ok ? undefined : mistakeCost(moveEVs(cards, dealerUp, rules, legal), correct, action as Move);
  return {
    spot: spot.key,
    label: spot.label,
    kind: spot.kind,
    chosen: action,
    correct,
    ok,
    why: ok ? undefined : explain(spot, correct, chart),
    // a zero cost means the infinite-deck EV model disagrees with the chart on a very close
    // cell (e.g. A,2 vs 5): show no cost rather than telling the player the mistake was free
    ...(cost !== undefined && cost > 0 && { cost: Math.round(cost * 10000) / 10000 }),
  };
}

export const choiceLabel = (m: ActionType | Move | "decline") =>
  m === "decline" ? "Decline" : m === "insurance" ? "Take insurance" : MOVE_LABEL[m as Move];
