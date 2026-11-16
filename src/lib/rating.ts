/**
 * Elo-style ratings, the same idea chess.com uses for games and puzzles. A training answer
 * is a "game" against the spot's difficulty; a heads-up match is a game against the bot.
 */
export const START_RATING = 800;

export function expected(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

/** New rating after scoring `score` (1 win, 0.5 draw, 0 loss) against `opponent`. */
export function rate(rating: number, opponent: number, score: number, games: number): number {
  // provisional ratings move fast, settled ones slowly
  const k = games < 20 ? 40 : games < 100 ? 24 : 16;
  return Math.max(100, Math.round(rating + k * (score - expected(rating, opponent))));
}

/** Difficulty of each kind of training spot, on the rating scale. */
export const SPOT_DIFFICULTY: Record<string, number> = {
  // blackjack chart cells
  hard: 800,
  soft: 1150,
  pair: 1100,
  insurance: 600,
  surrender: 1350,
  // poker drills
  preflop: 1000,
  potodds: 1300,
  showdown: 1050,
  equity: 1400,
};

export const difficultyOf = (kind: string) => SPOT_DIFFICULTY[kind] ?? 1000;

export function ratingTitle(r: number): string {
  if (r >= 2000) return "Inferno";
  if (r >= 1700) return "Blaze";
  if (r >= 1400) return "Flame";
  if (r >= 1100) return "Ember";
  if (r >= 800) return "Spark";
  return "Kindling";
}
