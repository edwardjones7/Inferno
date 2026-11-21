/**
 * Screen-space placement for the coach callouts that float over the 3D table (hints,
 * coach notes, odds tags). A callout belongs to a group of cards (a player hand or the
 * dealer) and tries a list of sides around it, taking the first spot that stays inside
 * the visible band and covers no card, label or banner. On a tall phone the gap between
 * the dealer and your hand is small, so a fixed anchor ends up on top of the cards.
 *
 * Coordinates are CSS pixels in the canvas, y down.
 */

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Where to try, relative to the target cards: the four sides, or pinned to the top or
 * bottom edge of the visible band (a last resort when there's no room next to the cards).
 */
export type Side = "above" | "below" | "right" | "left" | "top" | "bottom";

export interface Placement {
  /** centre of the box */
  x: number;
  y: number;
  side: Side;
  rect: Rect;
  /** px² of the box that still covers something (0 when the spot is clear) */
  overlap: number;
}

export const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x0, y0, x1, y1 });

export function union(rs: Rect[]): Rect | null {
  if (!rs.length) return null;
  return rs.reduce((a, b) => rect(Math.min(a.x0, b.x0), Math.min(a.y0, b.y0), Math.max(a.x1, b.x1), Math.max(a.y1, b.y1)));
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

const clampTo = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

/**
 * Pick a spot for a `size` box next to `target`.
 * - `obstacles` must not be covered (cards, labels, other callouts, the result banner);
 *   the target itself counts as one, so it never needs to be listed.
 * - `bounds` is the visible band between the HUD and the controls; boxes are clamped into it.
 * - `prev` is the side used last frame: it's kept while it's still clear, so a callout
 *   doesn't flick between two equally good spots as the camera moves.
 * The first clear side wins, then the first that is clear after stepping past what blocks it;
 * when none is clear, the one covering the least.
 */
export function placeCallout(
  target: Rect,
  size: { w: number; h: number },
  sides: readonly Side[],
  bounds: Rect,
  obstacles: readonly Rect[],
  opts: { gap?: number; prev?: Side } = {},
): Placement {
  const gap = opts.gap ?? 8;
  const { w, h } = size;
  const cx = (target.x0 + target.x1) / 2;
  const cy = (target.y0 + target.y1) / 2;
  const blockers = [target, ...obstacles];

  const score = (x: number, y: number, side: Side): Placement => {
    x = clampTo(x, bounds.x0 + w / 2, bounds.x1 - w / 2);
    y = clampTo(y, bounds.y0 + h / 2, bounds.y1 - h / 2);
    const r = rect(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
    let overlap = 0;
    for (const b of blockers) overlap += overlapArea(r, b);
    // whatever pokes outside the band (only when the box is bigger than the band) counts too
    overlap += w * h - overlapArea(r, bounds);
    return { x, y, side, rect: r, overlap };
  };

  const at = (side: Side, slide = false): Placement => {
    let x = cx;
    let y = cy;
    if (side === "above") y = target.y0 - gap - h / 2;
    else if (side === "below") y = target.y1 + gap + h / 2;
    else if (side === "right") x = target.x1 + gap + w / 2;
    else if (side === "left") x = target.x0 - gap - w / 2;
    else if (side === "top") y = bounds.y0 + h / 2;
    else y = bounds.y1 - h / 2;
    let p = score(x, y, side);
    if (!slide || side === "top" || side === "bottom") return p;
    // something in the way (a total beside the cards, the dealer's label): step further out
    // along the same side, past it, while that still helps. Only when no side is clear as is,
    // so a spot right next to the cards beats one that hops over the dealer's.
    for (let i = 0; i < 4 && p.overlap > 0; i++) {
      const hits = blockers.filter((b) => overlapArea(p.rect, b) > 0);
      if (!hits.length) break;
      if (side === "above") y = Math.min(...hits.map((b) => b.y0)) - gap - h / 2;
      else if (side === "below") y = Math.max(...hits.map((b) => b.y1)) + gap + h / 2;
      else if (side === "right") x = Math.max(...hits.map((b) => b.x1)) + gap + w / 2;
      else x = Math.min(...hits.map((b) => b.x0)) - gap - w / 2;
      const next = score(x, y, side);
      if (next.overlap >= p.overlap) break;
      p = next;
    }
    return p;
  };

  if (opts.prev && sides.includes(opts.prev)) {
    const kept = at(opts.prev);
    if (kept.overlap === 0) return kept;
  }
  let best: Placement | null = null;
  for (const slide of [false, true]) {
    for (const s of sides) {
      const p = at(s, slide);
      if (p.overlap === 0) return p;
      if (!best || p.overlap < best.overlap) best = p;
    }
  }
  return best ?? at("above");
}
