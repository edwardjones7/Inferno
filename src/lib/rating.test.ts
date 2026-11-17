import { describe, expect, it } from "vitest";
import { ratingTitle, START_RATING } from "./rating";

describe("ratingTitle", () => {
  it("names each band at its threshold", () => {
    expect(ratingTitle(100)).toBe("Greenhorn");
    expect(ratingTitle(799)).toBe("Greenhorn");
    expect(ratingTitle(800)).toBe("Hustler");
    expect(ratingTitle(1099)).toBe("Hustler");
    expect(ratingTitle(1100)).toBe("Sharp");
    expect(ratingTitle(1399)).toBe("Sharp");
    expect(ratingTitle(1400)).toBe("Wiseguy");
    expect(ratingTitle(1700)).toBe("Kingpin");
    expect(ratingTitle(1999)).toBe("Kingpin");
    expect(ratingTitle(2000)).toBe("Inferno");
  });

  it("starts a new player as a Hustler", () => {
    expect(ratingTitle(START_RATING)).toBe("Hustler");
  });
});
