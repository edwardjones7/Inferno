/**
 * Lesson model for the Learn path. A lesson is a short sequence of steps: explanation
 * screens (text + an optional visual) interleaved with check questions graded on the
 * spot. Steps are built lazily (`steps()`) so listing lessons never runs equity maths.
 */
import type { Card } from "../blackjack/cards";
import type { Position } from "../poker/ranges";

export type TrackId = "blackjack" | "poker";

/** Body text: one string per paragraph. `**bold**` is rendered as emphasis. */
export type Body = string[];

export type Visual =
  /** rows of cards, e.g. "Dealer" / "You", or "Board" / "Hero" / "Villain" */
  | { kind: "cards"; rows: { label?: string; cards: Card[]; note?: string }[]; size?: "small" | "normal" }
  /** horizontal bars, values in percent */
  | { kind: "bars"; bars: { label: string; value: number; hot?: boolean; note?: string }[]; caption?: string }
  /** two-column table; a row may carry mini cards instead of a left label */
  | { kind: "table"; head?: [string, string]; rows: { left: string; cards?: Card[]; right: string; hot?: boolean }[] }
  /** a 13x13 opening-range grid for a position */
  | { kind: "range"; pos: Position; highlight?: string }
  /** a formula / rule of thumb, big and centered */
  | { kind: "formula"; text: string; note?: string };

export interface ExplainStep {
  kind: "explain";
  title: string;
  body: Body;
  visual?: Visual;
}

export interface CheckOption {
  id: string;
  label: string;
}

export interface CheckStep {
  kind: "check";
  prompt: string;
  visual?: Visual;
  options: CheckOption[];
  /** id of the correct option */
  answer: string;
  /** shown after answering, right or wrong */
  why: string;
}

export type Step = ExplainStep | CheckStep;

export interface PracticeLink {
  href: string;
  label: string;
}

export interface Lesson {
  id: string;
  track: TrackId;
  title: string;
  blurb: string;
  /** rough time to finish */
  minutes: number;
  /** first link is the main "Practice this" call to action */
  practice: PracticeLink[];
  steps: () => Step[];
}

export interface Track {
  id: TrackId;
  title: string;
  blurb: string;
  lessons: Lesson[];
}
