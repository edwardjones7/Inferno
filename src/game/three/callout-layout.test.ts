import { describe, expect, it } from "vitest";
import { overlapArea, placeCallout, rect, union, type Rect } from "./callout-layout";

// a 390x844 phone: HUD ~80px on top, controls ~200px at the bottom
const BAND = rect(8, 88, 382, 636);
const HAND = rect(150, 420, 260, 560); // the player's cards
const DEALER = rect(140, 170, 270, 250);
const PILL = { w: 220, h: 36 };
const NOTE = { w: 300, h: 110 };

const clear = (r: Rect, obstacles: Rect[]) => obstacles.every((o) => overlapArea(r, o) === 0);
const inside = (r: Rect, b: Rect) => r.x0 >= b.x0 && r.y0 >= b.y0 && r.x1 <= b.x1 && r.y1 <= b.y1;

describe("placeCallout", () => {
  it("puts the hint just above the cards when there's room", () => {
    const p = placeCallout(HAND, PILL, ["above", "below"], BAND, [DEALER]);
    expect(p.side).toBe("above");
    expect(p.overlap).toBe(0);
    expect(p.rect.y1).toBeLessThanOrEqual(HAND.y0);
    expect(p.x).toBeCloseTo((HAND.x0 + HAND.x1) / 2);
  });

  it("never covers the cards it talks about, even as the hand grows toward the dealer", () => {
    // each extra card sits a little further up the screen
    for (let extra = 0; extra < 6; extra++) {
      const hand = rect(150 - extra * 12, 420 - extra * 18, 260 + extra * 12, 560);
      const p = placeCallout(hand, PILL, ["above", "below", "top", "bottom"], BAND, [DEALER]);
      expect(p.overlap).toBe(0);
      expect(clear(p.rect, [hand, DEALER])).toBe(true);
      expect(inside(p.rect, BAND)).toBe(true);
    }
  });

  it("drops below the cards when the dealer's cards leave no room above", () => {
    const hand = rect(150, 380, 260, 500);
    const tightDealer = rect(100, 280, 300, 360);
    const p = placeCallout(hand, NOTE, ["above", "below"], BAND, [tightDealer]);
    expect(p.side).toBe("below");
    expect(p.overlap).toBe(0);
    expect(p.rect.y0).toBeGreaterThanOrEqual(hand.y1);
  });

  it("keeps clear of other obstacles such as the result banner", () => {
    const banner = rect(60, 300, 330, 400);
    const p = placeCallout(HAND, PILL, ["above", "below", "top"], BAND, [DEALER, banner]);
    expect(p.overlap).toBe(0);
    expect(clear(p.rect, [HAND, DEALER, banner])).toBe(true);
  });

  it("slides sideways to stay on screen instead of running off the edge", () => {
    const edgeHand = rect(300, 420, 380, 560);
    const p = placeCallout(edgeHand, { w: 120, h: 40 }, ["right", "below"], BAND, []);
    expect(inside(p.rect, BAND)).toBe(true);
    expect(p.overlap).toBe(0);
  });

  it("steps past a label beside the cards instead of covering it", () => {
    const total = rect(270, 470, 310, 510); // the hand total, just right of the cards
    const p = placeCallout(HAND, { w: 60, h: 40 }, ["right"], BAND, [total]);
    expect(p.overlap).toBe(0);
    expect(p.rect.x0).toBeGreaterThanOrEqual(total.x1);
  });

  it("stays inside the band between the HUD and the controls", () => {
    const lowHand = rect(150, 520, 260, 630);
    const p = placeCallout(lowHand, NOTE, ["below", "above"], BAND, []);
    expect(inside(p.rect, BAND)).toBe(true);
    expect(p.side).toBe("above");
  });

  it("keeps last frame's side while it's still clear, so it doesn't flicker", () => {
    const p = placeCallout(HAND, PILL, ["above", "below"], BAND, [DEALER], { prev: "below" });
    expect(p.side).toBe("below");
    expect(p.overlap).toBe(0);
  });

  it("leaves last frame's side when it stops being clear", () => {
    const blocker = rect(0, 560, 390, 640);
    const p = placeCallout(HAND, PILL, ["above", "below"], BAND, [DEALER, blocker], { prev: "below" });
    expect(p.side).toBe("above");
  });

  it("reports the overlap when nothing fits, choosing the spot that covers least", () => {
    const crowded = [rect(0, 88, 390, 410), rect(0, 570, 390, 640)];
    const p = placeCallout(HAND, NOTE, ["above", "below", "top", "bottom"], BAND, crowded);
    expect(p.overlap).toBeGreaterThan(0);
    for (const side of ["above", "below", "top", "bottom"] as const) {
      expect(p.overlap).toBeLessThanOrEqual(placeCallout(HAND, NOTE, [side], BAND, crowded).overlap);
    }
  });
});

describe("union", () => {
  it("bounds every rect, or is null for none", () => {
    expect(union([])).toBeNull();
    expect(union([rect(0, 5, 10, 10), rect(-2, 0, 4, 20)])).toEqual(rect(-2, 0, 10, 20));
  });
});
