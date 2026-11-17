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

/* ------------------------------------------------------------------ hand vs range */

/**
 * A villain range as explicit two-card combos with weights in [0, 1] (1 = always plays
 * this way, 0.25 = a quarter of the time). Built by `weightedRange`; combos that clash with
 * the dead cards are left out.
 */
export interface WeightedRange {
  combos: [Card, Card][];
  weights: number[];
}

const CARD_INDEX = new Map<Card, number>(DECK.map((c, i) => [c, i]));

/** Expand hand codes ("AKs", "77") into combos, dropping those that use a dead card. */
export function weightedRange(codes: Iterable<string>, dead: readonly Card[] = [], weight: (combo: [Card, Card], code: string) => number = () => 1): WeightedRange {
  const deadSet = new Set(dead);
  const combos: [Card, Card][] = [];
  const weights: number[] = [];
  for (const code of codes)
    for (const c of codeCombos(code)) {
      if (deadSet.has(c[0]) || deadSet.has(c[1])) continue;
      const w = weight(c, code);
      if (w <= 0) continue;
      combos.push(c);
      weights.push(Math.min(1, w));
    }
  return { combos, weights };
}

const SUITS = ["S", "H", "D", "C"] as const;
function codeCombos(code: string): [Card, Card][] {
  const out: [Card, Card][] = [];
  const [r1, r2] = [code[0], code[1]];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      if (r1 === r2 ? j <= i : (code[2] === "s") !== (i === j)) continue;
      out.push([`${r1}${SUITS[i]}` as Card, `${r2}${SUITS[j]}` as Card]);
    }
  return out;
}

/** Sum of weights: the number of combos the range effectively holds. */
export const rangeSize = (r: WeightedRange) => r.weights.reduce((a, b) => a + b, 0);

/**
 * Hero's share of the pot against one or more villains, each holding a hand drawn from
 * their own weighted range, with the rest of the board dealt at random (ties split).
 * Seeded Monte Carlo: pass `seeded(...)` for reproducible answers. Draws that make two
 * villains share a card are re-drawn (a few tries, then the sample is skipped), so card
 * removal between ranges is respected. Fast enough for a phone: ~1,500 samples heads-up
 * take a few milliseconds.
 */
export function equityVsRanges(hero: readonly Card[], board: readonly Card[], ranges: readonly WeightedRange[], iterations: number, rand: () => number): number {
  const dead = new Set<Card>([...hero, ...board]);
  const deck = DECK.filter((c) => !dead.has(c));
  const need = 5 - board.length;
  // cumulative weights for O(log n) weighted picks, card indices for quick clash checks
  const prepared = ranges
    .map((r) => {
      const combos: [Card, Card][] = [];
      const cumList: number[] = [];
      let t = 0;
      r.combos.forEach((c, i) => {
        if (dead.has(c[0]) || dead.has(c[1]) || !(r.weights[i] > 0)) return;
        combos.push(c);
        cumList.push((t += r.weights[i]));
      });
      return { combos, cum: Float64Array.from(cumList), total: t, a: combos.map((c) => CARD_INDEX.get(c[0])!), b: combos.map((c) => CARD_INDEX.get(c[1])!) };
    })
    .filter((p) => p.combos.length > 0);
  if (!prepared.length) return 0;
  const live = prepared;
  const stamp = new Int32Array(52);
  const heroCards: Card[] = [...hero, ...board];
  const villCards: Card[][] = live.map(() => [] as Card[]);
  let won = 0;
  let n = 0;
  for (let it = 1; it <= iterations; it++) {
    let ok = true;
    const picked: [Card, Card][] = [];
    for (const p of prepared) {
      let got = false;
      for (let tries = 0; tries < 12 && !got; tries++) {
        const x = rand() * p.total;
        let lo = 0;
        let hi = p.cum.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (p.cum[mid] > x) hi = mid;
          else lo = mid + 1;
        }
        if (stamp[p.a[lo]] === it || stamp[p.b[lo]] === it) continue;
        stamp[p.a[lo]] = it;
        stamp[p.b[lo]] = it;
        picked.push(p.combos[lo]);
        got = true;
      }
      if (!got) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    heroCards.length = hero.length + board.length;
    for (let k = 0; k < need; k++) {
      let c: Card;
      do c = deck[Math.floor(rand() * deck.length)];
      while (stamp[CARD_INDEX.get(c)!] === it);
      stamp[CARD_INDEX.get(c)!] = it;
      heroCards.push(c);
    }
    const mine = evaluate(heroCards);
    let best = -1;
    let ties = 0;
    for (let v = 0; v < picked.length; v++) {
      const vc = villCards[v];
      vc.length = 0;
      vc.push(picked[v][0], picked[v][1], ...heroCards.slice(hero.length));
      const s = evaluate(vc);
      if (s > best) {
        best = s;
        ties = s === mine ? 1 : 0;
      } else if (s === best && s === mine) ties++;
    }
    n++;
    if (mine > best) won += 1;
    else if (mine === best) won += 1 / (ties + 1);
  }
  return n ? won / n : 0;
}

/**
 * Cards that put hero ahead (strictly winning) on the next street when hero is currently
 * behind. Used to teach counting outs; on the river there are none.
 */
export function outs(hero: readonly Card[], villain: readonly Card[], board: readonly Card[]): Card[] {
  if (board.length < 3 || board.length >= 5) return [];
  return remainingDeck([...hero, ...villain, ...board]).filter((c) => evaluate([...hero, ...board, c]) > evaluate([...villain, ...board, c]));
}
