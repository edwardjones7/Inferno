import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

export type DB = PgliteDatabase<typeof schema>;

/**
 * Local dev: embedded Postgres (PGlite) persisted to ./.data — zero setup.
 * Production: set DATABASE_URL (e.g. Neon) and the same schema runs on real Postgres.
 */
async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(url, { max: 5 });
    await client.unsafe(schema.BOOTSTRAP_SQL);
    // Same query-builder surface; typed as the PGlite flavour for simplicity.
    return drizzle(client, { schema }) as unknown as DB;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (!dataDir.startsWith("memory://")) mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  await client.exec(schema.BOOTSTRAP_SQL);
  return drizzlePglite(client, { schema });
}

const g = globalThis as unknown as { __infernoDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  g.__infernoDb ??= connect().catch((err) => {
    g.__infernoDb = undefined;
    throw err;
  });
  return g.__infernoDb;
}

export { schema };
