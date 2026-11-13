import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { applyAction, deal, DEFAULT_RULES, IllegalAction, toView, type ActionType, type RoundState, type RoundView } from "@/lib/blackjack/engine";
import { fairShoe, randomSeed, sha256Hex } from "@/lib/blackjack/fair";
import {
  CURRENCY_CODES,
  FAUCET_COOLDOWN_MS,
  FAUCET_USD,
  MAX_BET_USD,
  MIN_BET_USD,
  STARTING_USD,
  unitsToUsd,
  usdToUnits,
  type Currency,
} from "@/lib/currency";
import { getDb, schema, type DB } from "./db";

const { users, balances, ledger, rounds } = schema;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** Errors whose message is safe to show the player. */
export class GameError extends Error {}

export type Wallet = Record<Currency, number>;

export interface Fairness {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface RoundPayload {
  id: string;
  currency: Currency;
  view: RoundView;
  nonce: number;
}

/* ------------------------------------------------------------------ helpers */

const ADJECTIVES = ["Ashen", "Molten", "Scorched", "Blazing", "Smoldering", "Cinder", "Feral", "Obsidian", "Searing", "Volcanic", "Burnt", "Crimson"];
const NOUNS = ["Wolf", "Phoenix", "Viper", "Drake", "Raven", "Jackal", "Fox", "Hydra", "Lynx", "Golem", "Wraith", "Mantis"];
const guestName = () =>
  `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]}${NOUNS[Math.floor(Math.random() * NOUNS.length)]}#${Math.floor(1000 + Math.random() * 9000)}`;

async function adjust(tx: Tx, userId: string, currency: Currency, delta: number, kind: string, roundId: string | null = null) {
  if (delta === 0) return;
  const [row] = await tx
    .update(balances)
    .set({ amount: sql`${balances.amount} + ${delta}` })
    .where(and(eq(balances.userId, userId), eq(balances.currency, currency), sql`${balances.amount} + ${delta} >= 0`))
    .returning({ amount: balances.amount });
  if (!row) throw new GameError("Insufficient balance");
  await tx.insert(ledger).values({ userId, currency, delta, balanceAfter: row.amount, kind, roundId });
}

async function lockUser(tx: Tx, userId: string) {
  const [u] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
  if (!u) throw new GameError("Session expired, refresh the page");
  return u;
}

async function walletOf(db: DB | Tx, userId: string): Promise<Wallet> {
  const rows = await db.select().from(balances).where(eq(balances.userId, userId));
  const w = Object.fromEntries(CURRENCY_CODES.map((c) => [c, 0])) as Wallet;
  for (const r of rows) if (r.currency in w) w[r.currency as Currency] = r.amount;
  return w;
}

const payload = (r: typeof rounds.$inferSelect): RoundPayload => ({
  id: r.id,
  currency: r.currency as Currency,
  view: toView(r.state),
  nonce: r.nonce,
});

/* ------------------------------------------------------------------ users */

export async function ensureUser(userId: string) {
  const db = await getDb();
  const [existing] = await db.select().from(users).where(eq(users.id, userId));
  if (existing) return existing;
  return db.transaction(async (tx) => {
    const serverSeed = randomSeed();
    const [created] = await tx
      .insert(users)
      .values({ id: userId, name: guestName(), serverSeed, serverSeedHash: sha256Hex(serverSeed), clientSeed: randomSeed(8) })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      const [u] = await tx.select().from(users).where(eq(users.id, userId));
      return u;
    }
    for (const c of CURRENCY_CODES) {
      const amount = usdToUnits(STARTING_USD, c);
      await tx.insert(balances).values({ userId, currency: c, amount });
      await tx.insert(ledger).values({ userId, currency: c, delta: amount, balanceAfter: amount, kind: "grant" });
    }
    return created;
  });
}

export async function getAccount(userId: string) {
  const u = await ensureUser(userId);
  const db = await getDb();
  const wallet = await walletOf(db, userId);
  const faucetReadyAt = u.faucetAt ? u.faucetAt.getTime() + FAUCET_COOLDOWN_MS : 0;
  return { name: u.name, wallet, faucetReadyAt };
}

/* ------------------------------------------------------------------ blackjack */

export async function getTable(userId: string): Promise<{ round: RoundPayload | null; fairness: Fairness }> {
  const u = await ensureUser(userId);
  const db = await getDb();
  const [active] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.userId, userId), eq(rounds.status, "active")));
  return {
    round: active ? payload(active) : null,
    fairness: { serverSeedHash: u.serverSeedHash, clientSeed: u.clientSeed, nonce: u.nonce },
  };
}

export async function startRound(userId: string, currency: Currency, betUsd: number) {
  if (!Number.isFinite(betUsd) || betUsd < MIN_BET_USD || betUsd > MAX_BET_USD) {
    throw new GameError(`Bets are $${MIN_BET_USD}–$${MAX_BET_USD.toLocaleString()}`);
  }
  const bet = usdToUnits(betUsd, currency);
  await ensureUser(userId);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const u = await lockUser(tx, userId);
    const [active] = await tx
      .select({ id: rounds.id })
      .from(rounds)
      .where(and(eq(rounds.userId, userId), eq(rounds.status, "active")));
    if (active) throw new GameError("Finish your current hand first");

    const id = crypto.randomUUID();
    const nonce = u.nonce;
    await tx.update(users).set({ nonce: nonce + 1 }).where(eq(users.id, userId));
    await adjust(tx, userId, currency, -bet, "bet", id);

    const shoe = fairShoe(u.serverSeed, u.clientSeed, nonce);
    const state = deal(bet, shoe, DEFAULT_RULES);
    const settled = state.phase === "settled";
    const [row] = await tx
      .insert(rounds)
      .values({
        id,
        userId,
        currency,
        status: settled ? "settled" : "active",
        state,
        bet,
        wagered: state.wagered,
        payout: state.payout,
        serverSeed: u.serverSeed,
        serverSeedHash: u.serverSeedHash,
        clientSeed: u.clientSeed,
        nonce,
        settledAt: settled ? new Date() : null,
      })
      .returning();
    if (settled) await adjust(tx, userId, currency, state.payout, "payout", id);
    return { round: payload(row), wallet: await walletOf(tx, userId), nextNonce: nonce + 1 };
  });
}

export async function playAction(userId: string, roundId: string, action: ActionType) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const [r] = await tx
      .select()
      .from(rounds)
      .where(and(eq(rounds.id, roundId), eq(rounds.userId, userId)))
      .for("update");
    if (!r || r.status !== "active") throw new GameError("That hand is already over");
    const currency = r.currency as Currency;
    const shoe = fairShoe(r.serverSeed, r.clientSeed, r.nonce);

    let next: RoundState;
    try {
      next = applyAction(r.state, { type: action }, shoe);
    } catch (e) {
      if (e instanceof IllegalAction) throw new GameError(e.message);
      throw e;
    }
    const extra = next.wagered - r.state.wagered;
    if (extra > 0) await adjust(tx, userId, currency, -extra, "bet", r.id);

    const settled = next.phase === "settled";
    const [row] = await tx
      .update(rounds)
      .set({
        state: next,
        wagered: next.wagered,
        payout: next.payout,
        status: settled ? "settled" : "active",
        settledAt: settled ? new Date() : null,
      })
      .where(eq(rounds.id, r.id))
      .returning();
    if (settled) await adjust(tx, userId, currency, next.payout, "payout", r.id);
    return { round: payload(row), wallet: await walletOf(tx, userId) };
  });
}

/**
 * Finish a hand the player walked away from, the way a casino treats an abandoned hand:
 * insurance is declined and every live hand stands. Nothing is refunded, so reloading
 * can't be used to dodge a bad hand. Idempotent: an already-settled round is returned as is.
 */
export async function settleAbandoned(userId: string, roundId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const [r] = await tx
      .select()
      .from(rounds)
      .where(and(eq(rounds.id, roundId), eq(rounds.userId, userId)))
      .for("update");
    if (!r) throw new GameError("Hand not found");
    if (r.status !== "active") return { round: payload(r), wallet: await walletOf(tx, userId), settledNow: false };

    const shoe = fairShoe(r.serverSeed, r.clientSeed, r.nonce);
    let s = r.state;
    for (let guard = 0; s.phase !== "settled" && guard < 12; guard++) {
      s = applyAction(s, { type: s.phase === "insurance" ? "decline" : "stand" }, shoe);
    }
    if (s.phase !== "settled") throw new Error("could not settle abandoned round");
    const [row] = await tx
      .update(rounds)
      .set({ state: s, wagered: s.wagered, payout: s.payout, status: "settled", settledAt: new Date() })
      .where(eq(rounds.id, r.id))
      .returning();
    await adjust(tx, userId, r.currency as Currency, s.payout, "payout", r.id);
    return { round: payload(row), wallet: await walletOf(tx, userId), settledNow: true };
  });
}

/* ------------------------------------------------------------------ fairness */

export async function rotateSeeds(userId: string, clientSeed?: string) {
  const seed = clientSeed?.trim();
  if (seed !== undefined && (seed.length < 1 || seed.length > 64)) throw new GameError("Client seed must be 1–64 characters");
  await ensureUser(userId);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const u = await lockUser(tx, userId);
    const [active] = await tx
      .select({ id: rounds.id })
      .from(rounds)
      .where(and(eq(rounds.userId, userId), eq(rounds.status, "active")));
    if (active) throw new GameError("Finish your current hand before rotating seeds");
    const serverSeed = randomSeed();
    const next = { serverSeed, serverSeedHash: sha256Hex(serverSeed), clientSeed: seed || randomSeed(8), nonce: 0 };
    await tx.update(users).set(next).where(eq(users.id, userId));
    return {
      revealed: { serverSeed: u.serverSeed, serverSeedHash: u.serverSeedHash, clientSeed: u.clientSeed, handsPlayed: u.nonce },
      fairness: { serverSeedHash: next.serverSeedHash, clientSeed: next.clientSeed, nonce: 0 } satisfies Fairness,
    };
  });
}

/* ------------------------------------------------------------------ wallet */

export async function claimFaucet(userId: string, currency: Currency) {
  await ensureUser(userId);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const u = await lockUser(tx, userId);
    const now = Date.now();
    if (u.faucetAt && now - u.faucetAt.getTime() < FAUCET_COOLDOWN_MS) {
      throw new GameError("The forge is still cooling down");
    }
    await tx.update(users).set({ faucetAt: new Date(now) }).where(eq(users.id, userId));
    await adjust(tx, userId, currency, usdToUnits(FAUCET_USD, currency), "faucet");
    return { wallet: await walletOf(tx, userId), faucetReadyAt: now + FAUCET_COOLDOWN_MS };
  });
}

export async function resetBalances(userId: string) {
  await ensureUser(userId);
  const db = await getDb();
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const [active] = await tx
      .select({ id: rounds.id })
      .from(rounds)
      .where(and(eq(rounds.userId, userId), eq(rounds.status, "active")));
    if (active) throw new GameError("Finish your current hand first");
    const wallet = await walletOf(tx, userId);
    for (const c of CURRENCY_CODES) {
      const target = usdToUnits(STARTING_USD, c);
      await adjust(tx, userId, c, target - wallet[c], "reset");
    }
    return { wallet: await walletOf(tx, userId) };
  });
}

/* ------------------------------------------------------------------ stats */

export interface HistoryRow {
  id: string;
  currency: Currency;
  createdAt: string;
  betUsd: number;
  wageredUsd: number;
  profitUsd: number;
  dealer: string[];
  hands: { cards: string[]; result?: string; total: number }[];
  nonce: number;
  clientSeed: string;
  serverSeedHash: string;
  /** only present once the seed has been rotated out */
  serverSeed: string | null;
}

export async function getProfile(userId: string) {
  const u = await ensureUser(userId);
  const db = await getDb();

  const perCurrency = await db
    .select({
      currency: rounds.currency,
      hands: sql<number>`count(*)::int`,
      wins: sql<number>`count(*) filter (where ${rounds.payout} > ${rounds.wagered})::int`,
      pushes: sql<number>`count(*) filter (where ${rounds.payout} = ${rounds.wagered})::int`,
      blackjacks: sql<number>`count(*) filter (where ${rounds.state} @> '{"hands":[{"result":"blackjack"}]}')::int`,
      wagered: sql<number>`coalesce(sum(${rounds.wagered}),0)::float8`,
      net: sql<number>`coalesce(sum(${rounds.payout} - ${rounds.wagered}),0)::float8`,
      best: sql<number>`coalesce(max(${rounds.payout} - ${rounds.wagered}),0)::float8`,
    })
    .from(rounds)
    .where(and(eq(rounds.userId, userId), eq(rounds.status, "settled")))
    .groupBy(rounds.currency);

  const stats = { hands: 0, wins: 0, pushes: 0, blackjacks: 0, wageredUsd: 0, netUsd: 0, bestWinUsd: 0 };
  for (const r of perCurrency) {
    const c = r.currency as Currency;
    stats.hands += r.hands;
    stats.wins += r.wins;
    stats.pushes += r.pushes;
    stats.blackjacks += r.blackjacks;
    stats.wageredUsd += unitsToUsd(r.wagered, c);
    stats.netUsd += unitsToUsd(r.net, c);
    stats.bestWinUsd = Math.max(stats.bestWinUsd, unitsToUsd(r.best, c));
  }

  const recent = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.userId, userId), eq(rounds.status, "settled")))
    .orderBy(desc(rounds.createdAt))
    .limit(100);

  const history: HistoryRow[] = recent.map((r) => {
    const c = r.currency as Currency;
    const v = toView(r.state);
    return {
      id: r.id,
      currency: c,
      createdAt: r.createdAt.toISOString(),
      betUsd: unitsToUsd(r.bet, c),
      wageredUsd: unitsToUsd(r.wagered, c),
      profitUsd: unitsToUsd(r.payout - r.wagered, c),
      dealer: r.state.dealer,
      hands: v.hands.map((h) => ({ cards: h.cards, result: h.result, total: h.total })),
      nonce: r.nonce,
      clientSeed: r.clientSeed,
      serverSeedHash: r.serverSeedHash,
      serverSeed: r.serverSeedHash === u.serverSeedHash ? null : r.serverSeed,
    };
  });

  let running = 0;
  const curve = [...history].reverse().map((h) => (running += h.profitUsd));

  return { name: u.name, createdAt: u.createdAt.toISOString(), stats, history: history.slice(0, 50), curve };
}

export async function getLeaderboard(viewerId: string | null, limit = 10) {
  const db = await getDb();
  const rows = await db
    .select({
      userId: rounds.userId,
      name: users.name,
      currency: rounds.currency,
      hands: sql<number>`count(*)::int`,
      wagered: sql<number>`sum(${rounds.wagered})::float8`,
      net: sql<number>`sum(${rounds.payout} - ${rounds.wagered})::float8`,
    })
    .from(rounds)
    .innerJoin(users, eq(users.id, rounds.userId))
    .where(eq(rounds.status, "settled"))
    .groupBy(rounds.userId, users.name, rounds.currency);

  const byUser = new Map<string, { userId: string; name: string; hands: number; wageredUsd: number; netUsd: number }>();
  for (const r of rows) {
    const c = r.currency as Currency;
    const e = byUser.get(r.userId) ?? { userId: r.userId, name: r.name, hands: 0, wageredUsd: 0, netUsd: 0 };
    e.hands += r.hands;
    e.wageredUsd += unitsToUsd(r.wagered, c);
    e.netUsd += unitsToUsd(r.net, c);
    byUser.set(r.userId, e);
  }
  // Never send user ids to the browser: the id doubles as the guest session token.
  return [...byUser.values()]
    .sort((a, b) => b.netUsd - a.netUsd)
    .slice(0, limit)
    .map(({ userId, ...rest }) => ({ ...rest, you: userId === viewerId }));
}

export async function getRecentWins(limit = 12) {
  const db = await getDb();
  const rows = await db
    .select({
      id: rounds.id,
      name: users.name,
      currency: rounds.currency,
      wagered: rounds.wagered,
      payout: rounds.payout,
      state: rounds.state,
      settledAt: rounds.settledAt,
    })
    .from(rounds)
    .innerJoin(users, eq(users.id, rounds.userId))
    .where(and(eq(rounds.status, "settled"), sql`${rounds.payout} > ${rounds.wagered}`))
    .orderBy(desc(rounds.settledAt))
    .limit(limit);
  return rows.map((r) => {
    const c = r.currency as Currency;
    return {
      id: r.id,
      name: r.name,
      currency: c,
      profitUsd: unitsToUsd(r.payout - r.wagered, c),
      multiplier: r.payout / r.wagered,
      blackjack: r.state.hands.some((h) => h.result === "blackjack"),
      at: r.settledAt?.toISOString() ?? "",
    };
  });
}
