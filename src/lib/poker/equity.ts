/**
 * Heads-up equity between two known hands. With a flop or turn on board every runout is
 * enumerated (exact). Pre-flop uses a seeded Monte Carlo so the browser and the server
 * get the same number for the same matchup.
 */
import type { Card } from "../blackjack/cards";
import { DECK, evaluate } from "./eval";

export interface Equity {
  win: number;
  tie: number;
  lose: number;
  /** hero's share of the pot: win + tie / 2 */
  equity: number;
  samples: number;
  exact: boolean;
}

function finish(w: number, t: number, n: number, exact: boolean): Equity {
  return { win: w / n, tie: t / n, lose: (n - w - t) / n, equity: (w + t / 2) / n, samples: n, exact };
}

const remainingDeck = (used: readonly Card[]) => {
  const set = new Set(used);
  return DECK.filter((c) => !set.has(c));
};

/** Small deterministic PRNG (mulberry32). */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable seed from the cards involved, so equity for a spot is reproducible. */
export function seedFor(cards: readonly Card[]) {
  let h = 2166136261;
  for (const ch of cards.join("")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function equity(hero: readonly Card[], villain: readonly Card[], board: readonly Card[] = [], iterations = 20000): Equity {
  const rest = remainingDeck([...hero, ...villain, ...board]);
  const need = 5 - board.length;
  let w = 0;
  let t = 0;
  const tally = (full: Card[]) => {
    const a = evaluate([...hero, ...full]);
    const b = evaluate([...villain, ...full]);
    if (a > b) w++;
    else if (a === b) t++;
  };

  if (need <= 2) {
    let n = 0;
    if (need === 0) {
      tally([...board]);
      return finish(w, t, 1, true);
    }
    if (need === 1) {
      for (const c of rest) {
        tally([...board, c]);
        n++;
      }
    } else {
      for (let i = 0; i < rest.length; i++)
        for (let j = i + 1; j < rest.length; j++) {
          tally([...board, rest[i], rest[j]]);
          n++;
        }
    }
    return finish(w, t, n, true);
  }

  // pre-flop (or flop-less boards): seeded Monte Carlo
  const rand = seeded(seedFor([...hero, "|" as Card, ...villain, ...board]));
  const deck = [...rest];
  for (let k = 0; k < iterations; k++) {
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rand() * (deck.length - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    tally([...board, ...deck.slice(0, need)]);
  }
  return finish(w, t, iterations, false);
}

/**
 * Cards that put hero ahead (strictly winning) on the next street when hero is currently
 * behind. Used to teach counting outs; on the river there are none.
 */
export function outs(hero: readonly Card[], villain: readonly Card[], board: readonly Card[]): Card[] {
  if (board.length < 3 || board.length >= 5) return [];
  return remainingDeck([...hero, ...villain, ...board]).filter((c) => evaluate([...hero, ...board, c]) > evaluate([...villain, ...board, c]));
}
