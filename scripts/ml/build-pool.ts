/**
 * Build the decision pool synthetic players are made from (see src/lib/leaks/pool.ts).
 *   npx tsx scripts/ml/build-pool.ts [pokerHands=4000] [bjRounds=20000] [seed=1]
 * Writes ml/data/pool.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { buildBlackjackPool, buildPokerPool } from "../../src/lib/leaks/pool";

const [hands = "4000", rounds = "20000", seed = "1"] = process.argv.slice(2);
const t = performance.now();
const poker = buildPokerPool(Number(hands), Number(seed));
const blackjack = buildBlackjackPool(Number(rounds), Number(seed) + 1);
mkdirSync("ml/data", { recursive: true });
writeFileSync("ml/data/pool.json", JSON.stringify({ seed: Number(seed), poker, blackjack }));
const count = (hs: { poker?: unknown[]; bj?: unknown[] }[]) => hs.reduce((n, h) => n + (h.poker ?? h.bj ?? []).length, 0);
console.log(`pool: ${poker.length} poker hands (${count(poker)} decisions), ${blackjack.length} blackjack rounds (${count(blackjack)} decisions) in ${Math.round((performance.now() - t) / 1000)}s`);
