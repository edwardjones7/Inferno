/**
 * Synthetic players for training and testing the leak model. Each player replays hands from
 * a decision pool (pool.ts) and mostly plays the coach's line, with:
 *   - background noise: a random other action at `noise` rate (everyone slips);
 *   - injected leaks: in matching spots, a miss in the leak's direction at `rate`;
 *   - optional tilt: noise rises (and leans loose) for a few hands after a big loss.
 * The output is the same DecisionRow format the app logs, plus the ground truth.
 */
import type { ActionType } from "../blackjack/engine";
import type { DecisionRow } from "../decisions";
import { seeded } from "../poker/equity";
import type { SimpleAction } from "../poker/game-types";
import type { Dir } from "./model";
import type { PoolHand, PoolOption } from "./pool";

export interface LeakSpec {
  id: string;
  label: string;
  game: "poker" | "blackjack";
  family: string;
  /** limit to these positions (poker) or totals (blackjack) */
  groups?: string[];
  dir: Dir;
}

/** Leaks a real player commonly has, in the coach's own terms. */
export const LEAK_LIBRARY: LeakSpec[] = [
  { id: "overfold-3bet", label: "Folds too often to 3-bets", game: "poker", family: "vs-3bet", dir: -1 },
  { id: "bb-overdefend", label: "Defends the big blind too wide", game: "poker", family: "vs-open", groups: ["BB"], dir: 1 },
  { id: "loose-early-opens", label: "Opens too loose from early position", game: "poker", family: "open", groups: ["UTG", "HJ"], dir: 1 },
  { id: "tight-late-opens", label: "Opens too tight from the button", game: "poker", family: "open", groups: ["BTN"], dir: -1 },
  { id: "missed-cbets", label: "Misses c-bets", game: "poker", family: "cbet", dir: -1 },
  { id: "calling-station", label: "Calls bets without the price", game: "poker", family: "vs-bet", dir: 1 },
  { id: "overfold-to-bets", label: "Folds too much to bets", game: "poker", family: "vs-bet", dir: -1 },
  { id: "cold-calls", label: "Plays too loose against two raises", game: "poker", family: "cold", dir: 1 },
  { id: "passive-soft", label: "Too passive with soft hands", game: "blackjack", family: "soft", dir: -1 },
  { id: "stiff-hitter", label: "Hits or doubles hard totals it should stand on", game: "blackjack", family: "hard", dir: 1 },
  { id: "never-splits", label: "Doesn't split pairs it should", game: "blackjack", family: "pair", dir: -1 },
  { id: "takes-insurance", label: "Takes insurance", game: "blackjack", family: "insurance", dir: 1 },
];

export interface Profile {
  id: string;
  /** probability of a random slip at each decision */
  noise: number;
  leaks: { spec: LeakSpec; rate: number }[];
  /** extra noise multiplier for `tiltWindow` hands after a big loss (0 = no tilt) */
  tilt: number;
  pokerHands: number;
  bjRounds: number;
}

export interface SynthPlayer {
  profile: Profile;
  rows: DecisionRow[];
}

export interface ProfileOptions {
  noise: [number, number];
  /** chance of each extra leak (0..3 leaks per player) */
  leakChance: number;
  leakRate: [number, number];
  tiltChance: number;
  pokerHands: number;
  bjRounds: number;
}

/** Players range from careful (1.5% slips) to sloppy (12%). */
export const DEFAULT_PROFILE: ProfileOptions = {
  noise: [0.015, 0.12],
  leakChance: 0.35,
  leakRate: [0.25, 0.6],
  tiltChance: 0.2,
  pokerHands: 400,
  bjRounds: 400,
};

const between = (rand: () => number, [a, b]: [number, number]) => a + (b - a) * rand();

export function randomProfile(id: string, rand: () => number, o: ProfileOptions = DEFAULT_PROFILE): Profile {
  const leaks: Profile["leaks"] = [];
  const pool = [...LEAK_LIBRARY];
  for (let i = 0; i < 3 && rand() < o.leakChance; i++) {
    const spec = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    // two leaks in opposite directions in the same family don't make sense for one player
    if (leaks.some((l) => l.spec.game === spec.game && l.spec.family === spec.family)) continue;
    leaks.push({ spec, rate: between(rand, o.leakRate) });
  }
  return { id, noise: between(rand, o.noise), leaks, tilt: rand() < o.tiltChance ? 4 : 0, pokerHands: o.pokerHands, bjRounds: o.bjRounds };
}

/** Tilt window used when generating (matches DEFAULT_TILT in the model's priors). */
export const SYNTH_TILT = { lossBb: 20, lossBets: 2, window: 6 };

const groupOfBj = (key: string) => key.split("-").slice(0, 2).join("-");

function choose<A extends string>(
  options: Partial<Record<A, PoolOption>>,
  best: A | undefined,
  leaks: { spec: LeakSpec; rate: number }[],
  group: string | undefined,
  noise: number,
  looseBias: boolean,
  rand: () => number,
  /** blackjack: real players make near-misses (stand on soft 18), not absurd ones (surrender soft 20) */
  nearMisses = false,
): A {
  const keys = Object.keys(options) as A[];
  const fine = keys.filter((k) => options[k]!.ok !== false);
  let pick: A = best && options[best] ? best : (fine.length ? fine : keys)[Math.floor(rand() * (fine.length || keys.length))];
  if (best && options[best]) {
    for (const l of leaks) {
      if (l.spec.groups && (!group || !l.spec.groups.includes(group))) continue;
      // a near-miss costs at most NEAR_MISS of a bet: nobody "too passive with soft hands" surrenders soft 20
      // a leak is a mistake the coach flags, in the leak's direction
      const miss = keys.filter((k) => options[k]!.dir === l.spec.dir && options[k]!.ok === false && (!nearMisses || (options[k]!.cost ?? 0) <= NEAR_MISS));
      if (!miss.length || rand() >= l.rate) continue;
      if (nearMisses) return miss.reduce((a, b) => ((options[b]!.cost ?? 0) < (options[a]!.cost ?? 0) ? b : a));
      return miss[Math.floor(rand() * miss.length)];
    }
  }
  if (rand() < noise) {
    let others = keys.filter((k) => k !== pick);
    if (looseBias) {
      const loose = others.filter((k) => options[k]!.dir === 1);
      if (loose.length) others = loose;
    }
    if (others.length) pick = nearMisses ? weighted(others, (k) => 1 / (0.05 + (options[k]!.cost ?? 0)), rand) : others[Math.floor(rand() * others.length)];
  }
  return pick;
}

/** The most a blackjack leak's miss costs, as a fraction of the bet. */
const NEAR_MISS = 0.35;

function weighted<A>(xs: A[], w: (x: A) => number, rand: () => number): A {
  const ws = xs.map(w);
  let r = rand() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < xs.length; i++) if ((r -= ws[i]) <= 0) return xs[i];
  return xs[xs.length - 1];
}

/** Generate one player's decision log from the pool. `start` is the first timestamp. */
export function playerRows(profile: Profile, pool: { poker: PoolHand[]; blackjack: PoolHand[] }, seed: number, start = Date.UTC(2026, 10, 1)): DecisionRow[] {
  const rand = seeded(seed);
  const rows: DecisionRow[] = [];
  let t = start;
  let session = 0;
  const sessionLen = 60 + Math.floor(rand() * 90);

  const play = (game: "poker" | "blackjack", count: number) => {
    const hands = pool[game];
    if (!hands.length) return;
    let tiltLeft = 0;
    let sid = `${profile.id}-${session++}`;
    for (let h = 0; h < count; h++) {
      if (h > 0 && h % sessionLen === 0) {
        sid = `${profile.id}-${session++}`;
        t += 3 * 3600_000;
        tiltLeft = 0;
      }
      const hand = hands[Math.floor(rand() * hands.length)];
      const hid = `${profile.id}-${game[0]}${h}`;
      const tilted = profile.tilt > 0 && tiltLeft > 0;
      const noise = Math.min(0.6, profile.noise * (tilted ? profile.tilt : 1));
      t += game === "poker" ? 30_000 + rand() * 40_000 : 10_000 + rand() * 15_000;
      const leaks = profile.leaks.filter((l) => l.spec.game === game);
      if (game === "poker") {
        for (const [i, d] of hand.poker!.entries()) {
          const chosen = choose<SimpleAction>(d.options, d.spot.best, leaks.filter((l) => l.spec.family === d.spot.family), d.spot.pos, noise, tilted, rand);
          const o = d.options[chosen]!;
          const row: DecisionRow = { at: t, sid, game, mode: "table", hid, i, ok: o.ok, net: hand.net, ms: thinkTime(rand, o.ok === false), poker: { ...d.spot, chosen } };
          if (o.dir !== undefined) row.poker!.dir = o.dir;
          if (o.size !== undefined) row.poker!.size = o.size;
          if (o.cost !== undefined) row.cost = o.cost;
          rows.push(row);
          // folding ends the hero's hand: the recorded later decisions never happen
          if (chosen === "fold") break;
        }
      } else {
        hand.bj!.forEach((d, i) => {
          const chosen = choose<ActionType>(d.options, d.best as ActionType, leaks.filter((l) => l.spec.family === d.family), groupOfBj(d.key), noise, tilted, rand, true);
          const o = d.options[chosen]!;
          const row: DecisionRow = {
            at: t,
            sid,
            game,
            mode: "bj",
            hid,
            i,
            ok: o.ok,
            net: hand.net,
            ms: thinkTime(rand, o.ok === false),
            bj: { family: d.family, key: d.key, chosen, best: d.best, bet: 100 },
          };
          if (o.dir !== undefined) row.bj!.dir = o.dir;
          if (o.cost !== undefined) row.cost = o.cost;
          rows.push(row);
        });
      }
      const lost = game === "poker" ? -hand.net >= SYNTH_TILT.lossBb : -hand.net >= SYNTH_TILT.lossBets;
      tiltLeft = lost ? SYNTH_TILT.window : Math.max(0, tiltLeft - 1);
    }
  };
  play("poker", profile.pokerHands);
  t += 6 * 3600_000;
  play("blackjack", profile.bjRounds);
  return rows;
}

/** Think time: log-normal around 2.5s, a little slower on misses. */
function thinkTime(rand: () => number, miss: boolean): number {
  const z = Math.sqrt(-2 * Math.log(Math.max(1e-9, rand()))) * Math.cos(2 * Math.PI * rand());
  return Math.round(Math.min(120_000, 2500 * Math.exp(0.6 * z) * (miss ? 1.3 : 1)));
}

/** A population of synthetic players. */
export function population(count: number, pool: { poker: PoolHand[]; blackjack: PoolHand[] }, seed: number, o: ProfileOptions = DEFAULT_PROFILE, prefix = "p"): SynthPlayer[] {
  const rand = seeded(seed);
  const out: SynthPlayer[] = [];
  for (let i = 0; i < count; i++) {
    const profile = randomProfile(`${prefix}${i}`, rand, o);
    out.push({ profile, rows: playerRows(profile, pool, Math.floor(rand() * 2 ** 31)) });
  }
  return out;
}

/** Ground truth at the level the evaluation scores: game | family | dir. */
export const truthKeys = (p: Profile) => new Set(p.leaks.map((l) => `${l.spec.game}|${l.spec.family}|${l.spec.dir}`));
