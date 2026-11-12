/**
 * Pure blackjack rules engine. No I/O, no randomness: every function takes the current
 * state plus the round's pre-shuffled shoe and returns a new state. The server owns the
 * shoe; clients only ever see `toView(state)`.
 *
 * Table rules (Inferno Classic):
 *  - 6 decks, fresh provably-fair shoe every round
 *  - Dealer stands on all 17s, peeks for blackjack with an A or 10-value upcard
 *  - Blackjack pays 3:2, insurance pays 2:1
 *  - Double on any first two cards, double after split allowed
 *  - Split up to 4 hands, split aces receive one card each, no re-splitting aces
 *  - Late surrender on the opening hand
 */
import { cardValue, handTotal, isBust, isNaturalPair, rankOf, type Card } from "./cards";

export interface Rules {
  dealerHitsSoft17: boolean;
  blackjackPays: number; // 1.5 = 3:2
  maxHands: number;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  surrender: boolean;
}

export const DEFAULT_RULES: Rules = {
  dealerHitsSoft17: false,
  blackjackPays: 1.5,
  maxHands: 4,
  doubleAfterSplit: true,
  resplitAces: false,
  surrender: true,
};

export type HandResult = "win" | "lose" | "push" | "blackjack" | "surrender";

export interface PlayerHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  splitAces: boolean;
  surrendered: boolean;
  done: boolean;
  result?: HandResult;
  payout?: number;
}

export type Phase = "insurance" | "player" | "settled";

export interface RoundState {
  rules: Rules;
  phase: Phase;
  /** index of the next card to draw from the shoe */
  cursor: number;
  dealer: Card[];
  hands: PlayerHand[];
  active: number;
  baseBet: number;
  insurance: { bet: number; payout: number } | null;
  dealerBlackjack: boolean;
  wagered: number;
  payout: number;
}

export type ActionType = "hit" | "stand" | "double" | "split" | "surrender" | "insurance" | "decline";
export type Action = { type: ActionType };

export class IllegalAction extends Error {}

const clone = (s: RoundState): RoundState => structuredClone(s);

function draw(s: RoundState, shoe: readonly Card[]): Card {
  const c = shoe[s.cursor];
  if (!c) throw new Error("shoe exhausted");
  s.cursor++;
  return c;
}

const isTenOrAce = (c: Card) => cardValue(c) === 10 || rankOf(c) === "A";

function isPlayerBlackjack(s: RoundState, h: PlayerHand) {
  return s.hands.length === 1 && !h.fromSplit && isNaturalPair(h.cards);
}

function newHand(cards: Card[], bet: number, extra: Partial<PlayerHand> = {}): PlayerHand {
  return { cards, bet, doubled: false, fromSplit: false, splitAces: false, surrendered: false, done: false, ...extra };
}

/** Deal a new round: player, dealer, player, dealer. */
export function deal(bet: number, shoe: readonly Card[], rules: Rules = DEFAULT_RULES): RoundState {
  if (!Number.isInteger(bet) || bet <= 0) throw new IllegalAction("bet must be a positive integer");
  const s: RoundState = {
    rules,
    phase: "player",
    cursor: 0,
    dealer: [],
    hands: [],
    active: 0,
    baseBet: bet,
    insurance: null,
    dealerBlackjack: false,
    wagered: bet,
    payout: 0,
  };
  const p1 = draw(s, shoe);
  const d1 = draw(s, shoe);
  const p2 = draw(s, shoe);
  const d2 = draw(s, shoe);
  s.hands.push(newHand([p1, p2], bet));
  s.dealer = [d1, d2];

  if (rankOf(d1) === "A") {
    s.phase = "insurance";
    return s;
  }
  return afterPeek(s);
}

/** Dealer checks for blackjack; resolves naturals or hands the turn to the player. */
function afterPeek(s: RoundState): RoundState {
  if (isTenOrAce(s.dealer[0]) && isNaturalPair(s.dealer)) {
    s.dealerBlackjack = true;
    return settle(s);
  }
  if (isPlayerBlackjack(s, s.hands[0])) {
    s.hands[0].done = true;
    return settle(s);
  }
  s.phase = "player";
  s.active = 0;
  return s;
}

const insuranceCost = (s: RoundState) => Math.floor(s.baseBet / 2);

function canDouble(s: RoundState, h: PlayerHand) {
  if (h.cards.length !== 2 || h.splitAces) return false;
  return !h.fromSplit || s.rules.doubleAfterSplit;
}

function canSplit(s: RoundState, h: PlayerHand) {
  if (h.cards.length !== 2 || s.hands.length >= s.rules.maxHands) return false;
  if (cardValue(h.cards[0]) !== cardValue(h.cards[1])) return false;
  if (h.splitAces && !s.rules.resplitAces) return false;
  return true;
}

function canSurrender(s: RoundState, h: PlayerHand) {
  return s.rules.surrender && s.hands.length === 1 && !h.fromSplit && h.cards.length === 2;
}

export function legalActions(s: RoundState): ActionType[] {
  if (s.phase === "insurance") return insuranceCost(s) > 0 ? ["insurance", "decline"] : ["decline"];
  if (s.phase !== "player") return [];
  const h = s.hands[s.active];
  const out: ActionType[] = ["hit", "stand"];
  if (canDouble(s, h)) out.push("double");
  if (canSplit(s, h)) out.push("split");
  if (canSurrender(s, h)) out.push("surrender");
  return out;
}

/** Extra chips the player must put up to take this action. */
export function actionCost(s: RoundState, a: Action): number {
  switch (a.type) {
    case "double":
    case "split":
      return s.hands[s.active].bet;
    case "insurance":
      return insuranceCost(s);
    default:
      return 0;
  }
}

export function applyAction(state: RoundState, a: Action, shoe: readonly Card[]): RoundState {
  if (!legalActions(state).includes(a.type)) throw new IllegalAction(`${a.type} is not allowed right now`);
  const s = clone(state);

  if (s.phase === "insurance") {
    if (a.type === "insurance") {
      const bet = insuranceCost(s);
      s.insurance = { bet, payout: 0 };
      s.wagered += bet;
    }
    return afterPeek(s);
  }

  const h = s.hands[s.active];
  switch (a.type) {
    case "hit": {
      h.cards.push(draw(s, shoe));
      if (handTotal(h.cards).total >= 21) h.done = true;
      break;
    }
    case "stand":
      h.done = true;
      break;
    case "double": {
      s.wagered += h.bet;
      h.bet *= 2;
      h.doubled = true;
      h.cards.push(draw(s, shoe));
      h.done = true;
      break;
    }
    case "split": {
      s.wagered += h.bet;
      const aces = rankOf(h.cards[0]) === "A";
      const second = newHand([h.cards[1]], h.bet, { fromSplit: true, splitAces: aces });
      h.cards = [h.cards[0]];
      h.fromSplit = true;
      h.splitAces = aces;
      s.hands.splice(s.active + 1, 0, second);
      fillSplitHand(s, h, shoe);
      break;
    }
    case "surrender":
      h.surrendered = true;
      h.done = true;
      break;
  }
  return advance(s, shoe);
}

/** A split hand starts with one card; give it its second and auto-finish when forced. */
function fillSplitHand(s: RoundState, h: PlayerHand, shoe: readonly Card[]) {
  if (h.cards.length !== 1) return;
  h.cards.push(draw(s, shoe));
  if (h.splitAces || handTotal(h.cards).total === 21) h.done = true;
}

function advance(s: RoundState, shoe: readonly Card[]): RoundState {
  while (s.hands[s.active].done) {
    if (s.active + 1 >= s.hands.length) return dealerPlay(s, shoe);
    s.active++;
    fillSplitHand(s, s.hands[s.active], shoe);
  }
  return s;
}

function dealerShouldHit(s: RoundState) {
  const { total, soft } = handTotal(s.dealer);
  return total < 17 || (total === 17 && soft && s.rules.dealerHitsSoft17);
}

function dealerPlay(s: RoundState, shoe: readonly Card[]): RoundState {
  const live = s.hands.some((h) => !h.surrendered && !isBust(h.cards));
  if (live) while (dealerShouldHit(s)) s.dealer.push(draw(s, shoe));
  return settle(s);
}

function settle(s: RoundState): RoundState {
  const dealer = handTotal(s.dealer).total;
  const dealerBust = dealer > 21;
  for (const h of s.hands) {
    h.done = true;
    const player = handTotal(h.cards).total;
    const natural = isPlayerBlackjack(s, h);
    let result: HandResult;
    let payout: number;
    if (h.surrendered) {
      result = "surrender";
      payout = Math.floor(h.bet / 2);
    } else if (s.dealerBlackjack) {
      result = natural ? "push" : "lose";
      payout = natural ? h.bet : 0;
    } else if (natural) {
      result = "blackjack";
      payout = h.bet + Math.floor(h.bet * s.rules.blackjackPays);
    } else if (player > 21) {
      result = "lose";
      payout = 0;
    } else if (dealerBust || player > dealer) {
      result = "win";
      payout = h.bet * 2;
    } else if (player === dealer) {
      result = "push";
      payout = h.bet;
    } else {
      result = "lose";
      payout = 0;
    }
    h.result = result;
    h.payout = payout;
  }
  if (s.insurance) s.insurance.payout = s.dealerBlackjack ? s.insurance.bet * 3 : 0;
  s.payout = s.hands.reduce((n, h) => n + (h.payout ?? 0), 0) + (s.insurance?.payout ?? 0);
  s.phase = "settled";
  return s;
}

/* ---------------------------------------------------------------- client view */

export interface RoundView {
  phase: Phase;
  /** dealer cards; the hole card is null until it is revealed */
  dealer: (Card | null)[];
  dealerTotal: { total: number; soft: boolean } | null;
  hands: (Omit<PlayerHand, "cards"> & { cards: Card[]; total: number; soft: boolean })[];
  active: number;
  baseBet: number;
  insurance: RoundState["insurance"];
  dealerBlackjack: boolean;
  wagered: number;
  payout: number;
  legal: ActionType[];
  costs: Partial<Record<ActionType, number>>;
}

/** What the browser is allowed to see: no shoe, no hole card until settlement. */
export function toView(s: RoundState): RoundView {
  const reveal = s.phase === "settled";
  const dealer = reveal ? s.dealer : [s.dealer[0], null];
  const legal = legalActions(s);
  const costs: RoundView["costs"] = {};
  for (const t of legal) {
    const c = actionCost(s, { type: t });
    if (c) costs[t] = c;
  }
  return {
    phase: s.phase,
    dealer,
    dealerTotal: reveal ? handTotal(s.dealer) : handTotal([s.dealer[0]]),
    hands: s.hands.map((h) => ({ ...h, ...handTotal(h.cards) })),
    active: s.active,
    baseBet: s.baseBet,
    insurance: s.insurance,
    dealerBlackjack: s.dealerBlackjack,
    wagered: s.wagered,
    payout: s.payout,
    legal,
    costs,
  };
}
