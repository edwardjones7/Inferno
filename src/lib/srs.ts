/**
 * Spaced repetition for training spots (a simplified SM-2, the flashcard scheduler).
 * Every graded answer schedules its spot: a miss brings it back tomorrow, each correct
 * answer pushes it further out (1 → 3 → 7 → 16 … days). Pure functions over plain data
 * so the store can persist cards as JSON.
 */

export interface SrsCard {
  game: "blackjack" | "poker";
  /** chart cell (blackjack) or concept key (poker), same as DrillRecord.key */
  key: string;
  label: string;
  /** blackjack spot kind or poker drill id */
  kind: string;
  /** yyyy-mm-dd the card is next due */
  due: string;
  /** current gap in days */
  interval: number;
  /** ease factor, 1.3..2.8 */
  ease: number;
  reps: number;
  lapses: number;
}

export const srsId = (game: string, key: string) => `${game}|${key}`;

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/**
 * Schedule a card after an answer. Spots answered correctly the first time they're seen
 * aren't scheduled at all (returns null): the queue is for things you've actually missed.
 */
export function schedule(
  card: SrsCard | undefined,
  base: Omit<SrsCard, "due" | "interval" | "ease" | "reps" | "lapses">,
  ok: boolean,
  todayStr: string,
): SrsCard | null {
  if (!card) {
    if (ok) return null;
    return { ...base, due: addDays(todayStr, 1), interval: 1, ease: 2.3, reps: 0, lapses: 1 };
  }
  // answering a card early (in a normal drill) only counts once per day
  if (ok) {
    if (card.due > todayStr) return card;
    const interval = card.reps === 0 ? 3 : Math.min(120, Math.round(card.interval * card.ease));
    return { ...card, ...base, interval, reps: card.reps + 1, ease: Math.min(2.8, card.ease + 0.05), due: addDays(todayStr, interval) };
  }
  return { ...card, ...base, interval: 1, reps: 0, lapses: card.lapses + 1, ease: Math.max(1.3, card.ease - 0.2), due: addDays(todayStr, 1) };
}

/** Cards due on or before today, most-lapsed first. */
export function dueCards(cards: Record<string, SrsCard>, todayStr: string): SrsCard[] {
  return Object.values(cards)
    .filter((c) => c.due <= todayStr)
    .sort((a, b) => a.due.localeCompare(b.due) || b.lapses - a.lapses);
}

/** A card counts as learned once it has survived a few reviews. */
export const isMastered = (c: SrsCard) => c.reps >= 3 && c.interval >= 14;
