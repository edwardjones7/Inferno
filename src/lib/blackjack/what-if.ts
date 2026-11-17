/**
 * "What would the right play have done?" Replays a hand from the moment of a mistake with
 * the correct action instead, then plays the rest by basic strategy, drawing from the same
 * shoe. The result is exactly what those cards would have produced, which is what the
 * coach replays on the table after a hand settles.
 */
import type { Card } from "./cards";
import { applyAction, legalActions, toView, type ActionType, type RoundState, type RoundView } from "./engine";
import { basicStrategy } from "./strategy";

export function whatIf(before: RoundState, shoe: readonly Card[], correct: ActionType): RoundView {
  let s = applyAction(before, { type: correct }, shoe);
  for (let guard = 0; s.phase !== "settled" && guard < 40; guard++) {
    if (s.phase === "insurance") {
      s = applyAction(s, { type: "decline" }, shoe);
      continue;
    }
    const hand = s.hands[s.active];
    const move = basicStrategy(hand.cards, s.dealer[0], legalActions(s), s.rules);
    s = applyAction(s, { type: move }, shoe);
  }
  return toView(s);
}
