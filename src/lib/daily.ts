/**
 * Daily puzzles: three spots a day, the same for everyone, generated from the date.
 * 1. a blackjack decision (harder categories), 2. a pre-flop or pot-odds poker decision,
 * 3. a showdown read or an equity estimate.
 */
import { DEFAULT_RULES } from "./blackjack/engine";
import { generateSpot, spotLegal, type DrillSpot } from "./blackjack/drill";
import { seeded } from "./poker/equity";
import { genPoker, type PokerSpot } from "./poker/drills";
import type { ActionType } from "./blackjack/engine";

export type DailyPuzzle =
  | { n: number; game: "blackjack"; spot: DrillSpot; legal: ActionType[]; title: string }
  | { n: number; game: "poker"; spot: PokerSpot; title: string };

function hash(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function dailyPuzzles(date: string): DailyPuzzle[] {
  const rand = seeded(hash(`inferno-daily:${date}`));
  const cat = (["soft", "pair", "surrender", "hard"] as const)[Math.floor(rand() * 4)];
  let bj = generateSpot(cat, rand);
  let legal = spotLegal(bj.cards, bj.up, DEFAULT_RULES);
  for (let i = 0; legal.length === 0 && i < 20; i++) {
    bj = generateSpot("all", rand);
    legal = spotLegal(bj.cards, bj.up, DEFAULT_RULES);
  }
  const p2 = genPoker(rand() < 0.5 ? "preflop" : "potodds", rand);
  const p3 = genPoker(rand() < 0.5 ? "showdown" : "equity", rand);
  const title = (s: PokerSpot) =>
    s.kind === "preflop" ? "Open or fold?" : s.kind === "potodds" ? "Call or fold?" : s.kind === "showdown" ? "Who wins?" : "How often do you win?";
  return [
    { n: 0, game: "blackjack", spot: bj, legal, title: "Play the hand" },
    { n: 1, game: "poker", spot: p2, title: title(p2) },
    { n: 2, game: "poker", spot: p3, title: title(p3) },
  ];
}
