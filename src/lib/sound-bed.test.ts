import { describe, expect, it } from "vitest";
import { BED_RATE, BED_SECONDS, renderBed, renderVinyl, VINYL_SECONDS } from "./sound-bed";

describe("back-room bed", () => {
  const { left, right } = renderBed();

  it("renders exactly 8 bars at 72 bpm", () => {
    expect(left.length).toBe(Math.round(BED_SECONDS * BED_RATE));
    expect(right.length).toBe(left.length);
    expect(BED_SECONDS).toBeCloseTo(26.667, 2);
  });

  it("is finite and peak-normalised", () => {
    let peak = 0;
    let finite = true;
    for (let i = 0; i < left.length; i++) {
      finite &&= Number.isFinite(left[i]) && Number.isFinite(right[i]);
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    }
    expect(finite).toBe(true);
    expect(peak).toBeCloseTo(0.9, 5);
  });

  it("loops without a jump at the seam", () => {
    const n = left.length;
    // the step across the seam is no bigger than a typical step inside the loop
    let maxStep = 0;
    for (let i = 1; i < n; i++) maxStep = Math.max(maxStep, Math.abs(left[i] - left[i - 1]));
    expect(Math.abs(left[0] - left[n - 1])).toBeLessThanOrEqual(maxStep);
  });

  it("renders the same every time", () => {
    expect(renderBed().left.slice(0, 2000)).toEqual(left.slice(0, 2000));
  });

  it("renders a vinyl surface of its own length", () => {
    const v = renderVinyl();
    expect(v.length).toBe(Math.round(VINYL_SECONDS * BED_RATE));
    expect(v.reduce((m, x) => Math.max(m, Math.abs(x)), 0)).toBeCloseTo(1, 5);
  });
});
