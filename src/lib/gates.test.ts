import { describe, expect, it } from "vitest";
import {
  botIsPro,
  botLocked,
  countingLocked,
  FREE_LESSONS_PER_TRACK,
  FREE_REVIEW_HANDS,
  lessonIsPro,
  lessonLocked,
  lockedReviewIds,
  PRO_BOT_TIERS,
} from "./gates";
import { lessonUnlocked, TRACK_IDS, TRACKS } from "./learn";
import { ROSTER } from "./poker/roster";

describe("lesson gates", () => {
  it("keeps the first three lessons of each track free and the rest Pro", () => {
    for (const t of TRACK_IDS) {
      const list = TRACKS[t].lessons;
      expect(list.length).toBeGreaterThan(FREE_LESSONS_PER_TRACK);
      list.forEach((l, i) => expect(lessonIsPro(l.id)).toBe(i >= FREE_LESSONS_PER_TRACK));
    }
  });

  it("locks Pro lessons only for free players", () => {
    const pro = TRACKS.poker.lessons[FREE_LESSONS_PER_TRACK].id;
    const free = TRACKS.poker.lessons[0].id;
    expect(lessonLocked(pro, false)).toBe(true);
    expect(lessonLocked(pro, true)).toBe(false);
    expect(lessonLocked(free, false)).toBe(false);
  });

  it("treats unknown lessons as not Pro", () => {
    expect(lessonIsPro("nope")).toBe(false);
  });

  it("leaves the unlock order alone", () => {
    const list = TRACKS.blackjack.lessons;
    const done = Object.fromEntries(list.slice(0, FREE_LESSONS_PER_TRACK).map((l) => [l.id, 1]));
    // finishing the free lessons opens the next one in order; Pro is a separate check
    expect(lessonUnlocked({ lessons: done }, list[FREE_LESSONS_PER_TRACK].id)).toBe(true);
    expect(lessonLocked(list[FREE_LESSONS_PER_TRACK].id, false)).toBe(true);
  });
});

describe("bot gates", () => {
  it("needs Pro for Advanced and Master bots only", () => {
    for (const b of ROSTER) expect(botIsPro(b.id)).toBe(PRO_BOT_TIERS.includes(b.tier));
    expect(ROSTER.some((b) => botIsPro(b.id))).toBe(true);
    expect(ROSTER.filter((b) => b.tier === "Beginner" || b.tier === "Intermediate").every((b) => !botIsPro(b.id))).toBe(true);
  });

  it("locks Pro bots only for free players", () => {
    const master = ROSTER.find((b) => b.tier === "Master")!;
    expect(botLocked(master.id, false)).toBe(true);
    expect(botLocked(master.id, true)).toBe(false);
    expect(botLocked(ROSTER[0].id, false)).toBe(false);
    expect(botIsPro("not-a-bot")).toBe(false);
  });
});

describe("counting gate", () => {
  it("is Pro", () => {
    expect(countingLocked(false)).toBe(true);
    expect(countingLocked(true)).toBe(false);
  });
});

describe("review gate", () => {
  const records = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `h${i}` }));

  it("leaves short histories open", () => {
    expect(lockedReviewIds(records(FREE_REVIEW_HANDS), false).size).toBe(0);
    expect(lockedReviewIds([], false).size).toBe(0);
  });

  it("locks everything but the newest ten for free players", () => {
    const list = records(25);
    const locked = lockedReviewIds(list, false);
    expect(locked.size).toBe(15);
    // the store keeps oldest first: the last ten are the most recent
    for (const r of list.slice(-FREE_REVIEW_HANDS)) expect(locked.has(r.id)).toBe(false);
    for (const r of list.slice(0, 15)) expect(locked.has(r.id)).toBe(true);
  });

  it("locks nothing for Pro", () => {
    expect(lockedReviewIds(records(150), true).size).toBe(0);
  });
});
