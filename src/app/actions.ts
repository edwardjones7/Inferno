"use server";

import type { ActionType } from "@/lib/blackjack/engine";
import { isCurrency } from "@/lib/currency";
import * as casino from "@/server/casino";
import { currentUserId } from "@/server/session";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: (userId: string) => Promise<T>): Promise<Result<T>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Enable cookies to play" };
  try {
    return { ok: true, data: await fn(userId) };
  } catch (e) {
    if (e instanceof casino.GameError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

const ACTIONS: readonly ActionType[] = ["hit", "stand", "double", "split", "surrender", "insurance", "decline"];

export async function accountAction() {
  return run((id) => casino.getAccount(id));
}

export async function dealAction(currency: string, betUsd: number) {
  return run((id) => {
    if (!isCurrency(currency)) throw new casino.GameError("Unknown currency");
    return casino.startRound(id, currency, Number(betUsd));
  });
}

export async function playAction(roundId: string, action: string) {
  return run((id) => {
    if (!ACTIONS.includes(action as ActionType)) throw new casino.GameError("Unknown action");
    return casino.playAction(id, String(roundId), action as ActionType);
  });
}

export async function rotateSeedsAction(clientSeed?: string) {
  return run((id) => casino.rotateSeeds(id, clientSeed === undefined ? undefined : String(clientSeed)));
}

export async function faucetAction(currency: string) {
  return run((id) => {
    if (!isCurrency(currency)) throw new casino.GameError("Unknown currency");
    return casino.claimFaucet(id, currency);
  });
}

export async function resetBalancesAction() {
  return run((id) => casino.resetBalances(id));
}
