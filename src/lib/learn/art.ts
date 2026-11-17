/**
 * Hero art for Learn lessons: 1940s mobster-noir scenes, bundled under `public/lessons/` as
 * `<id>-640.webp` and `<id>-1280.webp` (16:9). The art is mood only: no readable card faces or
 * hands, so it can never contradict the strategy the lesson teaches. A lesson with no entry
 * here simply renders without art.
 */
const WITH_ART = new Set([
  "bj-dealer-bust",
  "bj-hard-totals",
  "bj-soft-totals",
  "bj-pairs",
  "bj-doubling",
  "bj-surrender",
  "bj-insurance",
  "bj-counting",
  "pk-hand-rankings",
  "pk-position",
  "pk-opening-ranges",
  "pk-pot-odds",
  "pk-outs",
  "pk-equity",
  "pk-board-texture",
  "pk-cbet-sizing",
  "pk-hand-reading",
]);

export const ART_WIDTHS = [640, 1280] as const;

export interface LessonArt {
  src: string;
  srcSet: string;
}

export function lessonArt(id: string): LessonArt | null {
  if (!WITH_ART.has(id)) return null;
  const at = (w: number) => `/lessons/${id}-${w}.webp`;
  return { src: at(640), srcSet: ART_WIDTHS.map((w) => `${at(w)} ${w}w`).join(", ") };
}

/** Lesson ids that have art, for tests. */
export const ART_IDS: readonly string[] = [...WITH_ART];
