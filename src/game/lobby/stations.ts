/**
 * The three stations of the Home room, in the order you swipe through them, and the
 * arc they stand on. Plain data (no three.js) so the HTML overlay can import it cheaply.
 *
 * The room is round: every station stands on a circle of radius ROOM_R around a point
 * behind the camera, facing that point. Moving between stations swings the camera
 * around the same centre, so neighbours slide in from the sides at an angle.
 */
export type StationId = "blackjack" | "poker" | "training";

export interface Station {
  id: StationId;
  href: string;
  /** short label for the tabs */
  label: string;
  /** verb on the go button */
  cta: string;
}

export const STATIONS: readonly Station[] = [
  { id: "blackjack", href: "/play/blackjack/", label: "Blackjack", cta: "Play" },
  { id: "poker", href: "/play/poker/", label: "Poker", cta: "Play" },
  { id: "training", href: "/train/", label: "Training", cta: "Train" },
];

export const ROOM_R = 16;
/** angle between neighbouring stations (radians) */
export const STEP = 0.4;
/** the miniature tables are the game tables scaled down by this */
export const MINI = 0.55;

/** angle of a (fractional) station index; the middle station sits straight ahead */
export const angleOf = (s: number) => (s - (STATIONS.length - 1) / 2) * STEP;

/** World position of the point on the arc at angle `a`, `r` from the room centre. */
export function onArc(a: number, r: number): [number, number] {
  return [Math.sin(a) * r, ROOM_R - Math.cos(a) * r];
}
