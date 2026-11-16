/**
 * The bots you can challenge. Each has a playing style (how they choose hands and bet),
 * a skill (how often they blunder away from that style) and a rating, so beating them
 * moves your poker rating the way a chess.com bot game does.
 */
import type { BotStyle } from "./game-types";

export type Tier = "Beginner" | "Intermediate" | "Advanced" | "Master";

export interface BotProfile {
  id: string;
  name: string;
  /** short epithet under the name */
  title: string;
  tier: Tier;
  style: BotStyle;
  skill: number;
  rating: number;
  bio: string;
  /** what to exploit, shown after you've played them once */
  tell: string;
  /** avatar gradient (inner, outer) and sigil */
  colors: [string, string];
  sigil: Sigil;
  lines: { greet: string[]; win: string[]; lose: string[]; bigPot: string[] };
}

export type Sigil = "spark" | "drop" | "leaf" | "moon" | "eye" | "crown" | "fang" | "sun";

export const STYLE_LABEL: Record<BotStyle, string> = {
  station: "Calling station",
  nit: "Rock",
  lag: "Maniac",
  tag: "Shark",
};

export const STYLE_BLURB: Record<BotStyle, string> = {
  station: "Calls far too often, rarely raises.",
  nit: "Plays very few hands, folds to pressure.",
  lag: "Plays lots of hands and bets them hard.",
  tag: "Tight, aggressive and disciplined.",
};

export const ROSTER: BotProfile[] = [
  {
    id: "pip",
    name: "Pip",
    title: "Just here for the flop",
    tier: "Beginner",
    style: "station",
    skill: 0.25,
    rating: 450,
    bio: "Pip learned poker last week and loves seeing every card. Pip will call you down with ace-high and never bluffs.",
    tell: "Never bluff Pip. Bet your good hands big, because Pip will pay you off.",
    colors: ["#ffe1a1", "#c97a2b"],
    sigil: "spark",
    lines: {
      greet: ["Hi! Is ace-two good?", "I brought snacks. Deal me in!"],
      win: ["Wait, I won? Yay!", "Beginner's luck, probably."],
      lose: ["Aw. Good game though!", "I'll get you next time… maybe."],
      bigPot: ["That's a lot of chips…", "Ooh, exciting!"],
    },
  },
  {
    id: "moss",
    name: "Moss",
    title: "Waits for aces",
    tier: "Beginner",
    style: "nit",
    skill: 0.45,
    rating: 650,
    bio: "Moss folds, and folds, and folds again. When Moss finally bets, believe it.",
    tell: "Steal Moss's blinds relentlessly, and fold when Moss shows real aggression.",
    colors: ["#b7e4a4", "#2f6b3a"],
    sigil: "leaf",
    lines: {
      greet: ["I'll be patient.", "Wake me when I have a hand."],
      win: ["Patience pays.", "Told you I had it."],
      lose: ["Too many hands. Reckless.", "Hm. Well played."],
      bigPot: ["…I have it this time.", "Careful now."],
    },
  },
  {
    id: "kindle",
    name: "Kindle",
    title: "Can't sit still",
    tier: "Beginner",
    style: "lag",
    skill: 0.5,
    rating: 800,
    bio: "Kindle raises the moment the cards land, whatever they are. Exciting to watch, expensive to play.",
    tell: "Call Kindle down lighter than feels comfortable and let them bluff into you.",
    colors: ["#ffb36b", "#d1350e"],
    sigil: "drop",
    lines: {
      greet: ["Let's gamble!", "Raise first, look later."],
      win: ["Fortune favours the bold!", "Boom!"],
      lose: ["Ugh, run it again!", "Fine. Next one's mine."],
      bigPot: ["All in? All in.", "This is the fun part."],
    },
  },
  {
    id: "ash",
    name: "Ash",
    title: "The quiet one",
    tier: "Intermediate",
    style: "nit",
    skill: 0.75,
    rating: 1000,
    bio: "Ash knows the opening charts by heart and won't make loose calls. Tight, but not quite tough enough.",
    tell: "Ash folds too much after the flop. Bet small and often when the board is scary.",
    colors: ["#d8d0c8", "#5c4a3d"],
    sigil: "moon",
    lines: {
      greet: ["Good luck.", "Let's keep it clean."],
      win: ["Solid.", "That's the chart."],
      lose: ["Nice hand.", "You played that well."],
      bigPot: ["Hm.", "I'll think about this."],
    },
  },
  {
    id: "cinder",
    name: "Cinder",
    title: "Never folds a pair",
    tier: "Intermediate",
    style: "station",
    skill: 0.8,
    rating: 1200,
    bio: "Cinder plays sensible hands but hates folding once there's money in. Any pair is a hero call waiting to happen.",
    tell: "Value bet thinner than usual. Bluffing Cinder is lighting chips on fire.",
    colors: ["#ff8f6b", "#7a0f0a"],
    sigil: "eye",
    lines: {
      greet: ["I see everything.", "Show me what you've got."],
      win: ["Knew you were bluffing.", "Caught you."],
      lose: ["You actually had it?", "Fine, that one's yours."],
      bigPot: ["I call. Obviously.", "Let's see it."],
    },
  },
  {
    id: "blaze",
    name: "Blaze",
    title: "Pressure everywhere",
    tier: "Advanced",
    style: "lag",
    skill: 0.9,
    rating: 1450,
    bio: "Blaze 3-bets light and fires multiple barrels. Unlike Kindle, Blaze picks the right spots.",
    tell: "Trap with your strong hands and let Blaze do the betting. Don't fold top pair too easily.",
    colors: ["#ffd24b", "#e5360f"],
    sigil: "sun",
    lines: {
      greet: ["Hope you like pressure.", "Let's play fast."],
      win: ["Too hot for you?", "Heat check passed."],
      lose: ["Respect.", "You stood your ground."],
      bigPot: ["Your move.", "How brave are you?"],
    },
  },
  {
    id: "ember",
    name: "Ember",
    title: "By the book",
    tier: "Advanced",
    style: "tag",
    skill: 0.95,
    rating: 1650,
    bio: "Ember plays a disciplined, balanced game with good ranges and good sizing. Mistakes are rare.",
    tell: "Ember's few leaks are in close calls on the river. Bet big with your best hands.",
    colors: ["#ffc24b", "#b3200c"],
    sigil: "fang",
    lines: {
      greet: ["Good luck. You'll need it.", "Let's play some poker."],
      win: ["Ranges don't lie.", "Expected value, realised."],
      lose: ["Well played.", "Variance. Or skill. We'll see."],
      bigPot: ["Interesting.", "Big decision for you."],
    },
  },
  {
    id: "scorch",
    name: "Scorch",
    title: "The final table",
    tier: "Master",
    style: "tag",
    skill: 1,
    rating: 1900,
    bio: "Scorch is the strongest bot in the room: solid pre-flop, pot-odds precise, and comfortable bluffing.",
    tell: "There's no easy exploit. Play your best and keep your mistakes small.",
    colors: ["#ffe9b8", "#3d0805"],
    sigil: "crown",
    lines: {
      greet: ["Sit down. Let's see what you've learned.", "I've been waiting."],
      win: ["Close. Not close enough.", "Study the hand history."],
      lose: ["Now that is poker.", "You've earned this one."],
      bigPot: ["Everything on the line.", "Make the right call."],
    },
  },
];

export const botById = (id: string | null | undefined) => ROSTER.find((b) => b.id === id) ?? null;

/** A bot is open if it's one of the first three, or the bot before it has been beaten. */
export function isUnlocked(id: string, beaten: readonly string[]): boolean {
  const i = ROSTER.findIndex((b) => b.id === id);
  if (i < 0) return false;
  return i < 3 || beaten.includes(ROSTER[i - 1].id) || beaten.includes(id);
}

/* ------------------------------------------------------------------ match format */

/** Heads-up match: both start 100 big blinds deep, blinds rise every 8 hands, 40 hands max. */
export const MATCH = {
  stack: 1000,
  hands: 40,
  levelEvery: 8,
  levels: [
    [5, 10],
    [10, 20],
    [15, 30],
    [25, 50],
    [40, 80],
  ] as [number, number][],
};

export function blindsFor(handNo: number): [number, number] {
  const lvl = Math.min(MATCH.levels.length - 1, Math.floor(Math.max(0, handNo - 1) / MATCH.levelEvery));
  return MATCH.levels[lvl];
}

/** The 6-max practice table lineup. */
export const TABLE_LINEUP = ["kindle", "ash", "cinder", "blaze", "ember"];
