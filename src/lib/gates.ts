/**
 * Free vs Inferno Pro: every rule about what needs a membership lives here, so the split
 * can be changed in one place. Screens ask these helpers and pass in `useIsPro()`.
 *
 * The principle (AGENTS.md): free offline play stays free and genuinely good. Pro adds
 * depth on top: the later lessons, the counting course, the strongest bots and unlimited
 * hand reviews, plus the member table and card designs. Blackjack, the poker cash game,
 * daily puzzles, basic drills, charts and the review queue are free for everyone.
 */
import { cosmeticById, DEFAULT_COSMETIC, type CardBackId, type CosmeticId, type CosmeticKind, type FeltId } from "./cosmetics";
import { lessonById, TRACKS } from "./learn";
import { botById, type Tier } from "./poker/roster";

/* ------------------------------------------------------------------ lessons */

/** The first lessons of each track are free; the rest of the course is Pro. */
export const FREE_LESSONS_PER_TRACK = 3;

/** True when the lesson is part of the Pro course (whoever is asking). */
export function lessonIsPro(id: string): boolean {
  const lesson = lessonById(id);
  if (!lesson) return false;
  return TRACKS[lesson.track].lessons.indexOf(lesson) >= FREE_LESSONS_PER_TRACK;
}

/** True when this player can't open the lesson because it needs Pro. Unlock order is separate (`lessonUnlocked`). */
export const lessonLocked = (id: string, pro: boolean): boolean => !pro && lessonIsPro(id);

/* ------------------------------------------------------------------ card counting */

/** The card counting drills are a Pro course. */
export const COUNTING_IS_PRO = true;

export const countingLocked = (pro: boolean): boolean => COUNTING_IS_PRO && !pro;

/* ------------------------------------------------------------------ bots */

/** Bots of these tiers need Pro to play. They stay visible on the ladder. */
export const PRO_BOT_TIERS: readonly Tier[] = ["Advanced", "Master"];

export function botIsPro(id: string): boolean {
  const bot = botById(id);
  return !!bot && PRO_BOT_TIERS.includes(bot.tier);
}

/** True when this player can't play the bot because it needs Pro. Ladder unlocks are separate (`isUnlocked`). */
export const botLocked = (id: string, pro: boolean): boolean => !pro && botIsPro(id);

/* ------------------------------------------------------------------ review */

/** Free players can replay this many of their most recent poker hands, and as many blackjack rounds. */
export const FREE_REVIEW_HANDS = 10;

/**
 * Ids of the records a free player can't replay. `records` is a history in the order it
 * was recorded (oldest first, as the store keeps it); everything but the newest
 * FREE_REVIEW_HANDS is locked. Pro players get an empty set.
 */
export function lockedReviewIds(records: readonly { id: string }[], pro: boolean): Set<string> {
  if (pro || records.length <= FREE_REVIEW_HANDS) return new Set();
  return new Set(records.slice(0, records.length - FREE_REVIEW_HANDS).map((r) => r.id));
}

/* ------------------------------------------------------------------ table and card designs */

/**
 * Member designs ("exclusive table and card designs" in the membership). The defaults stay
 * free, and every kind keeps at least one free design.
 */
export const PRO_COSMETICS: readonly CosmeticId[] = ["back-room", "midnight", "gilded", "marquee"];

export const cosmeticIsPro = (id: string): boolean => (PRO_COSMETICS as readonly string[]).includes(id);

/** True when this player may use the design (free designs for everyone, member designs for Pro). */
export const canUseCosmetic = (id: string, pro: boolean): boolean => !!cosmeticById(id) && (pro || !cosmeticIsPro(id));

/**
 * The design to actually draw for a saved choice. An unknown choice, one of the wrong kind,
 * or a member design without Pro (a lapsed membership) draws the free default. The saved
 * choice itself is left alone, so it comes back if the player rejoins.
 */
export function activeCosmetic(kind: "felt", chosen: string | null | undefined, pro: boolean): FeltId;
export function activeCosmetic(kind: "back", chosen: string | null | undefined, pro: boolean): CardBackId;
export function activeCosmetic(kind: CosmeticKind, chosen: string | null | undefined, pro: boolean): CosmeticId {
  const c = chosen ? cosmeticById(chosen) : undefined;
  if (!c || c.kind !== kind || !canUseCosmetic(c.id, pro)) return DEFAULT_COSMETIC[kind];
  return c.id;
}

/* ------------------------------------------------------------------ paywall reasons */

/**
 * What the player tried to open, passed to `openPaywall()` so the paywall can say why it
 * appeared. Other values are allowed (other features may add their own); the paywall falls
 * back to a general headline.
 */
export const paywallReason = {
  lesson: (id: string) => `lesson:${id}`,
  counting: "counting",
  bot: (id: string) => `bot:${id}`,
  review: (game: "poker" | "blackjack") => `review:${game}`,
  profile: "profile",
  design: (id: string) => `design:${id}`,
} as const;
