import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ART_IDS, ART_WIDTHS, lessonArt } from "./art";
import { LESSONS } from "./index";

const PUBLIC = join(__dirname, "../../../public");

describe("lesson art", () => {
  it("only maps real lessons", () => {
    const ids = new Set(LESSONS.map((l) => l.id));
    for (const id of ART_IDS) expect(ids.has(id), id).toBe(true);
  });

  it("ships every size for every mapped lesson", () => {
    for (const id of ART_IDS)
      for (const w of ART_WIDTHS) expect(existsSync(join(PUBLIC, "lessons", `${id}-${w}.webp`)), `${id}-${w}`).toBe(true);
  });

  it("returns null for a lesson without art", () => {
    expect(lessonArt("no-such-lesson")).toBeNull();
  });
});
