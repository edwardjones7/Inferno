import { bigint, bigserial, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import type { RoundState } from "@/lib/blackjack/engine";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  serverSeed: text("server_seed").notNull(),
  serverSeedHash: text("server_seed_hash").notNull(),
  clientSeed: text("client_seed").notNull(),
  nonce: integer("nonce").notNull().default(0),
  faucetAt: timestamp("faucet_at", { withTimezone: true }),
});

export const balances = pgTable(
  "balances",
  {
    userId: text("user_id").notNull(),
    currency: text("currency").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.currency] })],
);

export const ledger = pgTable(
  "ledger",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id").notNull(),
    currency: text("currency").notNull(),
    delta: bigint("delta", { mode: "number" }).notNull(),
    balanceAfter: bigint("balance_after", { mode: "number" }).notNull(),
    kind: text("kind").notNull(), // grant | bet | payout | faucet | reset
    roundId: text("round_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ledger_user_idx").on(t.userId, t.id)],
);

export const rounds = pgTable(
  "rounds",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull(), // active | settled
    state: jsonb("state").$type<RoundState>().notNull(),
    bet: bigint("bet", { mode: "number" }).notNull(),
    wagered: bigint("wagered", { mode: "number" }).notNull(),
    payout: bigint("payout", { mode: "number" }).notNull().default(0),
    serverSeed: text("server_seed").notNull(),
    serverSeedHash: text("server_seed_hash").notNull(),
    clientSeed: text("client_seed").notNull(),
    nonce: integer("nonce").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [index("rounds_user_idx").on(t.userId, t.createdAt), index("rounds_settled_idx").on(t.status, t.settledAt)],
);

/** Idempotent bootstrap so the app runs with zero setup. Mirrors the tables above. */
export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  server_seed text NOT NULL,
  server_seed_hash text NOT NULL,
  client_seed text NOT NULL,
  nonce integer NOT NULL DEFAULT 0,
  faucet_at timestamptz
);
CREATE TABLE IF NOT EXISTS balances (
  user_id text NOT NULL,
  currency text NOT NULL,
  amount bigint NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (user_id, currency)
);
CREATE TABLE IF NOT EXISTS ledger (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  currency text NOT NULL,
  delta bigint NOT NULL,
  balance_after bigint NOT NULL,
  kind text NOT NULL,
  round_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_user_idx ON ledger (user_id, id);
CREATE TABLE IF NOT EXISTS rounds (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  currency text NOT NULL,
  status text NOT NULL,
  state jsonb NOT NULL,
  bet bigint NOT NULL,
  wagered bigint NOT NULL,
  payout bigint NOT NULL DEFAULT 0,
  server_seed text NOT NULL,
  server_seed_hash text NOT NULL,
  client_seed text NOT NULL,
  nonce integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS rounds_user_idx ON rounds (user_id, created_at);
CREATE INDEX IF NOT EXISTS rounds_settled_idx ON rounds (status, settled_at);
CREATE UNIQUE INDEX IF NOT EXISTS rounds_one_active ON rounds (user_id) WHERE status = 'active';
`;
