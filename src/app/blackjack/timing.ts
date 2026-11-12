import type { RoundView } from "@/lib/blackjack/engine";
import { unitsToUsd, type Currency } from "@/lib/currency";

/* ------------------------------------------------------------------ timing */

export const DEAL_STEP = 0.22;
const HIT_STEP = 0.28;
const DEALER_STEP = 0.5;

export interface Timing {
  delays: Record<string, number>;
  /** seconds until the hole card starts flipping (0 = no flip in this update) */
  flip: number;
  /** how long the hole-card flip takes; long when the reveal is dramatic (slow motion) */
  flipDuration: number;
  /** window (seconds from the update) for the cinematic reveal, or null */
  drama: { start: number; end: number } | null;
  total: number;
}

export const NORMAL_FLIP = 0.42;
export const SLOW_FLIP = 1.35;

/** A reveal is worth slowing down when the player still has a live, decent hand riding on it. */
function isDramatic(v: RoundView) {
  return v.hands.some((h) => h.result !== "surrender" && h.total <= 21 && (h.total >= 17 || h.doubled));
}

export const playerKey = (h: number, i: number, c: string) => `p${h}-${i}-${c}`;

/** Work out when each newly visible card lands so the table plays out like a real deal. */
export function schedule(prev: RoundView | null, next: RoundView): Timing {
  const delays: Record<string, number> = {};
  const seen = new Set<string>();
  prev?.hands.forEach((h, hi) => h.cards.forEach((c, i) => seen.add(playerKey(hi, i, c))));
  let t = 0;
  let flip = 0;

  if (!prev) {
    // Opening deal: player, dealer, player, dealer(hole)
    delays[playerKey(0, 0, next.hands[0].cards[0])] = 0;
    delays["d0"] = DEAL_STEP;
    delays[playerKey(0, 1, next.hands[0].cards[1])] = DEAL_STEP * 2;
    delays["d1"] = DEAL_STEP * 3;
    t = DEAL_STEP * 3 + 0.35;
    let flipDuration = NORMAL_FLIP;
    let drama: Timing["drama"] = null;
    if (next.dealer[1]) {
      const slow = isDramatic(next);
      flipDuration = slow ? SLOW_FLIP : NORMAL_FLIP;
      if (slow) t += 0.5; // let the camera settle in first
      flip = t;
      t += flipDuration + 0.1;
      if (slow) drama = { start: flip - 0.6, end: t + 0.4 };
    }
    for (let i = 2; i < next.dealer.length; i++) delays[`d${i}`] = t + (i - 2) * DEALER_STEP;
    t += Math.max(0, next.dealer.length - 2) * DEALER_STEP;
    if (drama) drama.end = t + 0.3;
    return { delays, flip, flipDuration, drama, total: t + 0.15 };
  }

  next.hands.forEach((h, hi) =>
    h.cards.forEach((c, i) => {
      const k = playerKey(hi, i, c);
      if (!seen.has(k)) {
        delays[k] = t;
        t += HIT_STEP;
      }
    }),
  );
  let flipDuration = NORMAL_FLIP;
  let drama: Timing["drama"] = null;
  if (!prev.dealer[1] && next.dealer[1]) {
    const slow = isDramatic(next);
    flipDuration = slow ? SLOW_FLIP : NORMAL_FLIP;
    t += slow ? 0.7 : 0.1;
    flip = t;
    t += flipDuration + 0.13;
    if (slow) drama = { start: Math.max(0, flip - 0.7), end: 0 };
  }
  for (let i = prev.dealer.length; i < next.dealer.length; i++) {
    delays[`d${i}`] = t;
    t += DEALER_STEP;
  }
  if (drama) drama.end = t + 0.3;
  return { delays, flip, flipDuration, drama, total: t + 0.1 };
}

/* ------------------------------------------------------------------ outcome */

export function outcome(v: RoundView, currency: Currency) {
  const net = unitsToUsd(v.payout - v.wagered, currency);
  const blackjack = v.hands.some((h) => h.result === "blackjack");
  const allBust = v.hands.every((h) => h.total > 21);
  const surrendered = v.hands.every((h) => h.result === "surrender");
  let title: string;
  if (blackjack) title = "Blackjack";
  else if (surrendered) title = "Surrendered";
  else if (v.dealerBlackjack) title = "Dealer blackjack";
  else if (net > 0) title = "You win";
  else if (net === 0) title = "Push";
  else if (allBust) title = "Bust";
  else title = "Dealer wins";
  const tone: "win" | "push" | "lose" = net > 0 ? "win" : net === 0 ? "push" : "lose";
  return { net, title, tone, blackjack };
}

export type Outcome = ReturnType<typeof outcome>;
