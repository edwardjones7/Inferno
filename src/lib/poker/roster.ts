/**
 * The bots you can challenge. Each has a playing style (how they choose hands and bet),
 * a skill (how often they blunder away from that style) and a rating, so beating them
 * moves your poker rating the way a chess.com bot game does.
 */
import type { BotStyle } from "./game-types";

export type Tier = "Beginner" | "Intermediate" | "Advanced" | "Master";

/** What each tier is called on screen: the crew's ranks. `Tier` stays the stable key used in logic. */
export const TIER_LABEL: Record<Tier, string> = {
  Beginner: "Associate",
  Intermediate: "Soldier",
  Advanced: "Capo",
  Master: "Boss",
};

export interface BotProfile {
  id: string;
  name: string;
  /** what the crew calls them, e.g. Pip "the Kid" */
  nickname: string;
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
    nickname: "the Kid",
    title: "Runs errands, calls everything",
    tier: "Beginner",
    style: "station",
    skill: 0.25,
    rating: 450,
    bio: "Pip sells papers on the corner and runs errands for the crew. Tonight they let the kid sit in, and he wants to see every card. He'll call you down with ace-high and never bluffs.",
    tell: "Never bluff Pip. Bet your good hands big, because Pip will pay you off.",
    colors: ["#ffe1a1", "#c97a2b"],
    sigil: "spark",
    lines: {
      greet: ["Gee, mister, is ace-deuce any good?", "Extra, extra! Deal me in!"],
      win: ["Holy smokes, I won? Swell!", "Beginner's luck, I bet."],
      lose: ["Aw, nuts. Good game though!", "I'll getcha next time… maybe."],
      bigPot: ["Jeepers, that's a lotta chips.", "Ooh, this is the big time!"],
    },
  },
  {
    id: "moss",
    name: "Moss",
    nickname: "the Ledger",
    title: "Keeps the books, waits for aces",
    tier: "Beginner",
    style: "nit",
    skill: 0.45,
    rating: 650,
    bio: "Moss has kept the crew's books for forty years and seen every hustle twice. He folds, and folds, and folds again. When Moss finally bets, believe it.",
    tell: "Steal Moss's blinds relentlessly, and fold when Moss shows real aggression.",
    colors: ["#b7e4a4", "#2f6b3a"],
    sigil: "leaf",
    lines: {
      greet: ["I'll be patient, thank you.", "Wake me when I've got a hand."],
      win: ["Patience pays. Write that down.", "Told you I had it."],
      lose: ["Too many hands, young man. Reckless.", "Hm. That goes in the books."],
      bigPot: ["…This time I have it.", "Easy now. Easy."],
    },
  },
  {
    id: "kindle",
    name: "Kindle",
    nickname: "Hothead",
    title: "Can't sit still",
    tier: "Beginner",
    style: "lag",
    skill: 0.5,
    rating: 800,
    bio: "Kindle is the crew's youngest and loudest, sleeves rolled and itching for action. He raises the moment the cards land, whatever they are. Exciting to watch, expensive to play.",
    tell: "Call Kindle down lighter than feels comfortable and let them bluff into you.",
    colors: ["#ffb36b", "#d1350e"],
    sigil: "drop",
    lines: {
      greet: ["Deal 'em! I got places to be.", "Raise first, look later."],
      win: ["Fortune favours the bold, see?", "Ka-pow!"],
      lose: ["Aw, deal it again!", "Fine. Next one's mine, wise guy."],
      bigPot: ["All in? All in.", "Now we're cookin'."],
    },
  },
  {
    id: "ash",
    name: "Ash",
    nickname: "the Coat",
    title: "The quiet one",
    tier: "Intermediate",
    style: "nit",
    skill: 0.75,
    rating: 1000,
    bio: "Ash keeps his overcoat on and his hat brim low. He knows the opening charts by heart and won't make loose calls. Tight, but not quite tough enough.",
    tell: "Ash folds too much after the flop. Bet small and often when the board is scary.",
    colors: ["#d8d0c8", "#5c4a3d"],
    sigil: "moon",
    lines: {
      greet: ["Evening.", "Let's keep it clean."],
      win: ["Solid.", "That's the chart."],
      lose: ["Nice hand.", "You played that right."],
      bigPot: ["Hm.", "Let me think on it."],
    },
  },
  {
    id: "cinder",
    name: "Cinder",
    nickname: "Big Cinder",
    title: "Never folds a pair",
    tier: "Intermediate",
    style: "station",
    skill: 0.8,
    rating: 1200,
    bio: "Cinder is the crew's muscle: big hands, bigger laugh, heart of gold. He plays sensible hands but hates folding once there's money in. Any pair is a hero call waiting to happen.",
    tell: "Value bet thinner than usual. Bluffing Cinder is lighting chips on fire.",
    colors: ["#ff8f6b", "#7a0f0a"],
    sigil: "eye",
    lines: {
      greet: ["Siddown, pal. Nobody gets hurt here.", "Show me whatcha got."],
      win: ["Knew you was bluffin'.", "Gotcha, pal."],
      lose: ["You actually had it? Huh.", "Fair's fair. That one's yours."],
      bigPot: ["I call. Obviously.", "Let's see 'em."],
    },
  },
  {
    id: "blaze",
    name: "Blaze",
    nickname: "Dapper",
    title: "Pressure everywhere",
    tier: "Advanced",
    style: "lag",
    skill: 0.9,
    rating: 1450,
    bio: "Blaze wears the loudest pinstripes in the joint and plays like it. He 3-bets light and fires multiple barrels. Unlike Kindle, Blaze picks the right spots.",
    tell: "Trap with your strong hands and let Blaze do the betting. Don't fold top pair too easily.",
    colors: ["#ffd24b", "#e5360f"],
    sigil: "sun",
    lines: {
      greet: ["Hope you like the heat, pal.", "Let's play fast."],
      win: ["Too hot for ya?", "Smooth as silk."],
      lose: ["Respect.", "You held your ground. Classy."],
      bigPot: ["Your move.", "How much nerve you got?"],
    },
  },
  {
    id: "ember",
    name: "Ember",
    nickname: "the Mechanic",
    title: "By the book",
    tier: "Advanced",
    style: "tag",
    skill: 0.95,
    rating: 1650,
    bio: "Ember's hands could stack a deck, but he plays it straight: a disciplined, balanced game with good ranges and good sizing. Mistakes are rare.",
    tell: "Ember's few leaks are in close calls on the river. Bet big with your best hands.",
    colors: ["#ffc24b", "#b3200c"],
    sigil: "fang",
    lines: {
      greet: ["Good luck. You'll need it.", "Cut the deck. Let's play."],
      win: ["Ranges don't lie.", "Arithmetic, friend."],
      lose: ["Well played.", "Variance. Or skill. We'll see."],
      bigPot: ["Interesting.", "Big decision for you."],
    },
  },
  {
    id: "scorch",
    name: "Scorch",
    nickname: "the Boss",
    title: "Runs the back room",
    tier: "Master",
    style: "tag",
    skill: 1,
    rating: 1900,
    bio: "Scorch runs this room and everybody in it. The strongest bot at the table: solid pre-flop, pot-odds precise, and comfortable bluffing.",
    tell: "There's no easy exploit. Play your best and keep your mistakes small.",
    colors: ["#ffe9b8", "#3d0805"],
    sigil: "crown",
    lines: {
      greet: ["Sit down. Let's see what you've learned.", "I've been expecting you."],
      win: ["Close. Not close enough.", "Study the hand history, kid."],
      lose: ["Now that is poker.", "You earned this one. Don't spend it all at once."],
      bigPot: ["Everything on the table.", "Make the right call."],
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
