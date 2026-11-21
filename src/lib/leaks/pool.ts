/**
 * A pool of real decisions for synthetic players: hands played at the practice table (and
 * blackjack rounds) where, at every hero decision, the live coach graded EVERY available
 * action. A synthetic player then replays these hands choosing its own actions, and each
 * choice comes with the grade the coach would really have given it. So injected leaks are
 * measured by the same coach the app uses, not by a simplified copy.
 *
 * Approximation: after a synthetic player deviates, the hand continues as it was recorded
 * (the hero played the coach's line), except that a fold ends the hero's decisions in it.
 * Detection only looks at decisions one at a time, so this keeps the spot mix realistic.
 */
import { gradeAction } from "../blackjack/coach";
import { applyAction, deal, legalActions, type ActionType, type RoundState } from "../blackjack/engine";
import { shuffledShoe } from "../blackjack/shoe";
import { TABLES } from "../blackjack/tables";
import { bjDirection } from "../decisions";
import { botDecide, BOT_ROSTER } from "../poker/bots";
import { seeded } from "../poker/equity";
import { act, legal, newTable, startHand } from "../poker/game";
import type { CoachSpot, PlayerAction, PokerState, SimpleAction } from "../poker/game-types";
import { coachHero } from "../poker/table-coach";

export interface PoolOption {
  ok: boolean | null;
  cost?: number;
  dir?: -1 | 0 | 1;
  /** post-flop bet size as a fraction of the pot, for raises */
  size?: number;
}

export interface PoolPokerDecision {
  /** the spot as graded, without the hero's choice */
  spot: Omit<CoachSpot, "chosen" | "dir" | "size">;
  options: Partial<Record<SimpleAction, PoolOption>>;
}

export interface PoolBjDecision {
  family: string;
  key: string;
  best: string;
  options: Partial<Record<ActionType, PoolOption>>;
}

export interface PoolHand {
  /** hand result when the hero played the coach's line: big blinds (poker) or opening bets (blackjack) */
  net: number;
  poker?: PoolPokerDecision[];
  bj?: PoolBjDecision[];
}

export interface Pool {
  poker: PoolHand[];
  blackjack: PoolHand[];
}

const BB = 10;
const STACK = 100 * BB;

/** A legal raise target: the coach's size post-flop, standard sizes pre-flop. */
function raiseTo(s: PokerState, bestSize?: number): number {
  const L = legal(s);
  const me = s.seats[0];
  let to: number;
  if (s.street === "preflop") {
    const limpers = s.seats.filter((x) => x.id !== 0 && x.hole.length > 0 && !x.folded && x.lastAction?.startsWith("Call")).length;
    to = s.currentBet <= BB ? 2.5 * BB + limpers * BB : 3 * s.currentBet;
  } else {
    to = me.committed + L.toCall + Math.round((bestSize ?? 0.66) * (s.pot + L.toCall));
  }
  return Math.max(L.minRaiseTo, Math.min(L.maxRaiseTo, Math.round(to)));
}

function gradePokerDecision(s: PokerState): { decision: PoolPokerDecision; actions: Partial<Record<SimpleAction, PlayerAction>> } {
  const L = legal(s);
  const passive: PlayerAction = L.canCheck ? { kind: "check" } : { kind: "call" };
  const first = coachHero(s, passive);
  const spot = first.spot!;
  const actions: Partial<Record<SimpleAction, PlayerAction>> = { [passive.kind]: passive };
  if (!L.canCheck) actions.fold = { kind: "fold" };
  if (L.canRaise) actions.raise = { kind: "raise", to: raiseTo(s, spot.bestSize) };
  const options: Partial<Record<SimpleAction, PoolOption>> = {};
  for (const [k, a] of Object.entries(actions) as [SimpleAction, PlayerAction][]) {
    const n = k === passive.kind ? first : coachHero(s, a);
    const o: PoolOption = { ok: n.ok };
    if (n.cost !== undefined) o.cost = n.cost;
    if (n.spot?.dir !== undefined) o.dir = n.spot.dir;
    if (n.spot?.size !== undefined) o.size = n.spot.size;
    options[k] = o;
  }
  const base: Partial<CoachSpot> = { ...spot };
  delete base.chosen;
  delete base.dir;
  delete base.size;
  return { decision: { spot: base as PoolPokerDecision["spot"], options }, actions };
}

/** What the recording hero plays: the coach's play, or a reasonable one where it has no single answer. */
function heroPlay(d: PoolPokerDecision, actions: Partial<Record<SimpleAction, PlayerAction>>, rand: () => number): PlayerAction {
  if (d.spot.best && actions[d.spot.best]) return actions[d.spot.best]!;
  const fine = (Object.keys(actions) as SimpleAction[]).filter((k) => d.options[k]?.ok !== false);
  const pickFrom = fine.length ? fine : (Object.keys(actions) as SimpleAction[]);
  return actions[pickFrom[Math.floor(rand() * pickFrom.length)]]!;
}

export function buildPokerPool(hands: number, seed = 1): PoolHand[] {
  const rand = seeded(seed);
  let s = newTable({ heroName: "Hero", bots: BOT_ROSTER, stack: STACK, sb: BB / 2, bb: BB });
  const out: PoolHand[] = [];
  for (let h = 0; h < hands; h++) {
    s = startHand({ ...s, seats: s.seats.map((x) => ({ ...x, stack: STACK })) }, rand);
    const decisions: PoolPokerDecision[] = [];
    for (let guard = 0; s.street !== "done" && guard < 100; guard++) {
      const seat = s.toAct!;
      if (seat === 0) {
        const { decision, actions } = gradePokerDecision(s);
        decisions.push(decision);
        s = act(s, heroPlay(decision, actions, rand));
      } else {
        s = act(s, botDecide(s, seat, rand));
      }
    }
    if (decisions.length) out.push({ net: Math.round(((s.seats[0].stack - STACK) / BB) * 100) / 100, poker: decisions });
  }
  return out;
}

export function buildBlackjackPool(rounds: number, seed = 1): PoolHand[] {
  const rand = seeded(seed);
  const rules = TABLES.classic.rules;
  const bet = 100;
  const out: PoolHand[] = [];
  for (let r = 0; r < rounds; r++) {
    const shoe = shuffledShoe(6, rand);
    let st: RoundState = deal(bet, shoe, rules);
    const decisions: PoolBjDecision[] = [];
    for (let guard = 0; (st.phase === "player" || st.phase === "insurance") && guard < 30; guard++) {
      const legalNow = legalActions(st);
      const graded = legalNow.map((a) => [a, gradeAction(st, a)] as const).filter(([, d]) => d);
      if (!graded.length) break;
      const d0 = graded[0][1]!;
      const options: Partial<Record<ActionType, PoolOption>> = {};
      for (const [a, d] of graded) {
        const o: PoolOption = { ok: d!.ok };
        if (d!.cost !== undefined) o.cost = d!.cost;
        const dir = bjDirection(a, d0.correct);
        if (dir !== undefined) o.dir = dir;
        options[a] = o;
      }
      decisions.push({ family: d0.kind, key: d0.spot, best: d0.correct, options });
      const play = (d0.correct in options ? d0.correct : legalNow[0]) as ActionType;
      st = applyAction(st, { type: play }, shoe);
    }
    // play out anything left (dealer turn is automatic in the engine)
    for (let guard = 0; st.phase !== "settled" && guard < 30; guard++) st = applyAction(st, { type: "stand" }, shoe);
    if (decisions.length) out.push({ net: Math.round(((st.payout - st.wagered) / bet) * 100) / 100, bj: decisions });
  }
  return out;
}

export function buildPool(pokerHands: number, bjRounds: number, seed = 1): Pool {
  return { poker: buildPokerPool(pokerHands, seed), blackjack: buildBlackjackPool(bjRounds, seed + 1) };
}
