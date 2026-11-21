/**
 * Write a demo player's decision log (known leaks) for trying the Review panel:
 *   npx tsx scripts/ml/demo-player.ts out.json
 * The file is a progress document; paste it into localStorage["inferno:progress:v1"].
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Pool } from "../../src/lib/leaks/pool";
import { LEAK_LIBRARY, playerRows, type Profile } from "../../src/lib/leaks/synth";

const pool = JSON.parse(readFileSync("ml/data/pool.json", "utf8")) as Pool;
const spec = (id: string) => LEAK_LIBRARY.find((l) => l.id === id)!;
const profile: Profile = {
  id: "demo",
  noise: 0.03,
  leaks: [
    { spec: spec("bb-overdefend"), rate: 0.45 },
    { spec: spec("overfold-to-bets"), rate: 0.4 },
    { spec: spec("passive-soft"), rate: 0.5 },
  ],
  tilt: 4,
  pokerHands: 600,
  bjRounds: 400,
};
const decisions = playerRows(profile, pool, 7, Date.now() - 86_400_000);
writeFileSync(process.argv[2] ?? "demo-progress.json", JSON.stringify({ v: 1, name: "Demo", createdAt: Date.now(), decisions }));
console.log(`${decisions.length} decisions; leaks: ${profile.leaks.map((l) => l.spec.id).join(", ")}, tilt`);
