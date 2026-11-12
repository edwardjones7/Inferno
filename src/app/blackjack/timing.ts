import type { RoundView } from "@/lib/blackjack/engine";
import { unitsToUsd, type Currency } from "@/lib/currency";

/* ------------------------------------------------------------------ timing */

export const DEAL_STEP = 0.22;
const HIT_STEP = 0.28;
const DEALER_STEP = 0.5;

export interface Timing {
  delays: Record<string, number>;
  flip: number;
  total: number;
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
    if (next.dealer[1]) {
      flip = t;
      t += 0.5;
    }
    for (let i = 2; i < next.dealer.length; i++) delays[`d${i}`] = t + (i - 2) * DEALER_STEP;
    t += Math.max(0, next.dealer.length - 2) * DEALER_STEP;
    return { delays, flip, total: t + 0.15 };
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
  if (!prev.dealer[1] && next.dealer[1]) {
    t += 0.1;
    flip = t;
    t += 0.55;
  }
  for (let i = prev.dealer.length; i < next.dealer.length; i++) {
    delays[`d${i}`] = t;
    t += DEALER_STEP;
  }
  return { delays, flip, total: t + 0.1 };
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
