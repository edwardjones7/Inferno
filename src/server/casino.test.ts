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

  it("settles an abandoned hand by standing (no refund) and is idempotent", async () => {
    const id = newUser();
    let round;
    do {
      round = (await casino.startRound(id, "USDT", 20)).round;
    } while (round.view.phase === "settled");
    const res = await casino.settleAbandoned(id, round.id);
    expect(res.settledNow).toBe(true);
    expect(res.round.view.phase).toBe("settled");
    expect(res.round.view.hands.every((h) => h.result !== "surrender")).toBe(true);
    const again = await casino.settleAbandoned(id, round.id);
    expect(again.settledNow).toBe(false);
    expect(await ledgerSum(id, "USDT")).toBe(again.wallet.USDT);
    // the table is free for a new hand
    await expect(casino.startRound(id, "USDT", 5)).resolves.toBeTruthy();
    await expect(casino.settleAbandoned(newUser(), round.id)).rejects.toThrow(casino.GameError);
  });

  it("grades live decisions with the table's rules", async () => {
    const id = newUser();
    let round;
    do {
      round = (await casino.startRound(id, "USDT", 10, "h17")).round;
    } while (round.view.phase === "settled");
    expect(round.tableId).toBe("h17");
    const before = round.view;
    const action = before.phase === "insurance" ? "insurance" : "stand";
    const res = await casino.playAction(id, round.id, action);
    expect(res.decision).toBeTruthy();
    if (action === "insurance") expect(res.decision!.ok).toBe(false);
    const db = await getDb();
    const [row] = await db.select().from(schema.rounds).where(eq(schema.rounds.id, round.id));
    expect(row.decisions).toHaveLength(1);
    expect(row.state.rules.dealerHitsSoft17).toBe(true);
  });

  it("re-grades drill answers server-side and reports leaks", async () => {
    const id = newUser();
    await casino.recordDrill(id, "classic", [
      { cards: ["AS", "7H"], up: "9C", action: "stand" }, // wrong: hit
      { cards: ["AD", "7C"], up: "9H", action: "stand" }, // wrong again
      { cards: ["TS", "6H"], up: "TC", action: "surrender" }, // right
      { cards: ["8S", "8H"], up: "AC", action: "split" }, // right
    ]);
    await expect(casino.recordDrill(id, "classic", [{ cards: ["AS", "KH"], up: "9C", action: "stand" }])).rejects.toThrow(casino.GameError);
    await expect(casino.recordDrill(id, "classic", [{ cards: ["9S", "9H"], up: "9C", action: "surrender" }])).resolves.toBeTruthy();
    await expect(casino.recordDrill(id, "oldschool", [{ cards: ["TS", "6H"], up: "TC", action: "surrender" }])).rejects.toThrow("Invalid drill answer");
    const t = await casino.getTraining(id);
    expect(t.drill.answers).toBe(5);
    expect(t.drill.correct).toBe(2);
    expect(t.drill.bestStreak).toBe(2);
    expect(t.leaks[0]).toMatchObject({ spot: "soft-18-9", label: "Soft 18 vs 9", correct: "hit", misses: 2 });
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

describe("poker trainer", () => {
  it("re-grades poker answers server-side and tracks leaks", async () => {
    const id = newUser();
    await casino.recordPoker(id, [
      { spot: { kind: "preflop", pos: "UTG", cards: ["KS", "4S"] }, answer: "raise" }, // wrong
      { spot: { kind: "preflop", pos: "UTG", cards: ["KD", "4D"] }, answer: "raise" }, // wrong, same cell
      { spot: { kind: "preflop", pos: "BTN", cards: ["KS", "4S"] }, answer: "raise" }, // right
      { spot: { kind: "equity", hero: ["AS", "AH"], villain: ["KD", "KC"] }, answer: "gt65" }, // right
    ]);
    await expect(casino.recordPoker(id, [{ spot: { kind: "preflop", pos: "UTG", cards: ["KS", "KS"] }, answer: "raise" }])).rejects.toThrow("Invalid poker spot");
    await expect(casino.recordPoker(id, [{ spot: { kind: "preflop", pos: "UTG", cards: ["KS", "4S"] }, answer: "call" }])).rejects.toThrow("Invalid poker answer");
    const st = await casino.getPokerStats(id);
    const pre = st.byDrill.find((d) => d.drill === "preflop")!;
    expect(pre).toMatchObject({ seen: 3, correct: 1 });
    expect(st.leaks[0]).toMatchObject({ key: "pre-UTG-K4s", misses: 2 });
    expect(st.bestStreak).toBe(2);
  });
});
