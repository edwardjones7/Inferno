import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { legalActions } from "@/lib/blackjack/engine";
import { fairShoe, sha256Hex } from "@/lib/blackjack/fair";
import { basicStrategy } from "@/lib/blackjack/strategy";
import { STARTING_USD, usdToUnits } from "@/lib/currency";
import * as casino from "./casino";
import { getDb, schema } from "./db";

const newUser = () => crypto.randomUUID();

async function ledgerSum(userId: string, currency: string) {
  const db = await getDb();
  const [row] = await db
    .select({ s: sql<number>`coalesce(sum(${schema.ledger.delta}),0)::float8` })
    .from(schema.ledger)
    .where(sql`${schema.ledger.userId} = ${userId} and ${schema.ledger.currency} = ${currency}`);
  return row.s;
}

async function playOut(userId: string, roundId: string) {
  const db = await getDb();
  for (let guard = 0; guard < 20; guard++) {
    const [r] = await db.select().from(schema.rounds).where(eq(schema.rounds.id, roundId));
    if (r.status === "settled") return r;
    const s = r.state;
    const action =
      s.phase === "insurance" ? "decline" : basicStrategy(s.hands[s.active].cards, s.dealer[0], legalActions(s));
    await casino.playAction(userId, roundId, action);
  }
  throw new Error("round never settled");
}

describe("casino service", () => {
  it("creates a guest with starting balances recorded in the ledger", async () => {
    const id = newUser();
    const acct = await casino.getAccount(id);
    expect(acct.wallet.USDT).toBe(usdToUnits(STARTING_USD, "USDT"));
    expect(acct.wallet.BTC).toBe(usdToUnits(STARTING_USD, "BTC"));
    expect(await ledgerSum(id, "BTC")).toBe(acct.wallet.BTC);
  });

  it("keeps balance == ledger == start - wagered + payout over many hands", async () => {
    const id = newUser();
    const start = usdToUnits(STARTING_USD, "ETH");
    for (let i = 0; i < 40; i++) {
      const { round } = await casino.startRound(id, "ETH", 25);
      expect(round.view.dealer.includes(null) || round.view.phase === "settled").toBe(true);
      await playOut(id, round.id);
    }
    const db = await getDb();
    const [agg] = await db
      .select({
        w: sql<number>`sum(${schema.rounds.wagered})::float8`,
        p: sql<number>`sum(${schema.rounds.payout})::float8`,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.rounds)
      .where(eq(schema.rounds.userId, id));
    const { wallet } = await casino.getAccount(id);
    expect(agg.n).toBe(40);
    expect(wallet.ETH).toBe(start - agg.w + agg.p);
    expect(await ledgerSum(id, "ETH")).toBe(wallet.ETH);
  });

  it("rejects bets over the balance and out of limits", async () => {
    const id = newUser();
    await expect(casino.startRound(id, "USDT", 4_000)).rejects.toThrow("Insufficient balance");
    await expect(casino.startRound(id, "USDT", 0.5)).rejects.toThrow(casino.GameError);
    await expect(casino.startRound(id, "USDT", 10_000)).rejects.toThrow(casino.GameError);
    const { wallet } = await casino.getAccount(id);
    expect(wallet.USDT).toBe(usdToUnits(STARTING_USD, "USDT"));
  });

  it("never allows two live hands, even when deals race", async () => {
    const id = newUser();
    const results = await Promise.allSettled([1, 2, 3, 4].map(() => casino.startRound(id, "SOL", 10)));
    const db = await getDb();
    const active = await db
      .select()
      .from(schema.rounds)
      .where(sql`${schema.rounds.userId} = ${id} and ${schema.rounds.status} = 'active'`);
    expect(active.length).toBeLessThanOrEqual(1);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    const { wallet } = await casino.getAccount(id);
    expect(await ledgerSum(id, "SOL")).toBe(wallet.SOL);
  });

  it("refuses illegal actions and actions on other players' hands", async () => {
    const id = newUser();
    let round;
    do {
      round = (await casino.startRound(id, "USDT", 5)).round;
      if (round.view.phase !== "settled") break;
    } while (true);
    await expect(casino.playAction(newUser(), round.id, "stand")).rejects.toThrow(casino.GameError);
    if (round.view.phase === "player") {
      await casino.playAction(id, round.id, "stand");
      await expect(casino.playAction(id, round.id, "hit")).rejects.toThrow("already over");
    }
  });

  it("reveals the committed seed on rotation and the shoe replays the hand", async () => {
    const id = newUser();
    const { fairness } = await casino.getTable(id);
    const { round } = await casino.startRound(id, "USDT", 10);
    const settled = await playOut(id, round.id);
    const { revealed, fairness: next } = await casino.rotateSeeds(id, "my-lucky-seed");
    expect(sha256Hex(revealed.serverSeed)).toBe(fairness.serverSeedHash);
    expect(next.clientSeed).toBe("my-lucky-seed");
    expect(next.nonce).toBe(0);
    const shoe = fairShoe(revealed.serverSeed, revealed.clientSeed, settled.nonce);
    expect(settled.state.dealer.slice(0, 2)).toEqual([shoe[1], shoe[3]]);
    expect(settled.state.hands[0].cards[0]).toBe(shoe[0]);

    const profile = await casino.getProfile(id);
    expect(profile.history[0].serverSeed).toBe(revealed.serverSeed);
  });

  it("faucet pays once per cooldown", async () => {
    const id = newUser();
    const before = (await casino.getAccount(id)).wallet.BTC;
    const { wallet } = await casino.claimFaucet(id, "BTC");
    expect(wallet.BTC).toBeGreaterThan(before);
    await expect(casino.claimFaucet(id, "BTC")).rejects.toThrow(casino.GameError);
  });

  it("reset restores starting balances", async () => {
    const id = newUser();
    const { round } = await casino.startRound(id, "USDT", 100);
    await playOut(id, round.id);
    const { wallet } = await casino.resetBalances(id);
    expect(wallet.USDT).toBe(usdToUnits(STARTING_USD, "USDT"));
    expect(await ledgerSum(id, "USDT")).toBe(wallet.USDT);
  });
});
