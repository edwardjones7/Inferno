/**
 * The Learn path: two tracks of short lessons, unlocked in order. Completion lives in
 * `progress.lessons` (see store.ts `completeLesson`).
 */
import { BLACKJACK_LESSONS } from "./blackjack";
import { POKER_LESSONS } from "./poker";
import type { Lesson, Track, TrackId } from "./types";

export type { Body, CheckStep, ExplainStep, Lesson, PracticeLink, Step, Track, TrackId, Visual } from "./types";

export const TRACKS: Record<TrackId, Track> = {
  blackjack: {
    id: "blackjack",
    title: "Blackjack",
    blurb: "From why the dealer busts to counting the shoe.",
    lessons: BLACKJACK_LESSONS,
  },
  poker: {
    id: "poker",
    title: "Hold'em",
    blurb: "From hand rankings to reading ranges.",
    lessons: POKER_LESSONS,
  },
};

export const TRACK_IDS: TrackId[] = ["blackjack", "poker"];

/** Every lesson, blackjack first, in unlock order. */
export const LESSONS: Lesson[] = TRACK_IDS.flatMap((t) => TRACKS[t].lessons);

export const lessonById = (id: string): Lesson | undefined => LESSONS.find((l) => l.id === id);

type LessonProgress = { lessons: Record<string, number> };

export const lessonDone = (progress: LessonProgress, id: string): boolean => !!progress.lessons[id];

/** A lesson is open when it's first in its track or the lesson before it is done. */
export function lessonUnlocked(progress: LessonProgress, id: string): boolean {
  const lesson = lessonById(id);
  if (!lesson) return false;
  const list = TRACKS[lesson.track].lessons;
  const i = list.indexOf(lesson);
  return i === 0 || lessonDone(progress, list[i - 1].id);
}

/** The first unfinished lesson in a track, or null when the whole track is done. */
export function nextLesson(progress: LessonProgress, track: TrackId): Lesson | null {
  return TRACKS[track].lessons.find((l) => !lessonDone(progress, l.id)) ?? null;
}

/** The lesson after `id` in its track, if any. */
export function lessonAfter(id: string): Lesson | null {
  const lesson = lessonById(id);
  if (!lesson) return null;
  const list = TRACKS[lesson.track].lessons;
  return list[list.indexOf(lesson) + 1] ?? null;
}

/** Finished and total lessons in a track. */
export function trackProgress(progress: LessonProgress, track: TrackId): { done: number; total: number } {
  const list = TRACKS[track].lessons;
  return { done: list.filter((l) => lessonDone(progress, l.id)).length, total: list.length };
}
