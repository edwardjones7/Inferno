import { describe, expect, it } from "vitest";
import { BACK_IDS, CARD_BACKS, DEFAULT_BACK, DEFAULT_FELT, FELT_IDS, FELTS } from "./cosmetics";
import {
  activeCosmetic,
  botIsPro,
  canUseCosmetic,
  cosmeticIsPro,
  botLocked,
  countingLocked,
  FREE_LESSONS_PER_TRACK,
  FREE_REVIEW_HANDS,
  lessonIsPro,
  lessonLocked,
  lockedReviewIds,
  paywallReason,
  PRO_BOT_TIERS,
  PRO_COSMETICS,
} from "./gates";
import { lessonUnlocked, TRACK_IDS, TRACKS } from "./learn";
import { ROSTER, TIER_LABEL } from "./poker/roster";

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
  it("shows Pro tiers as the Capo and Boss ranks", () => {
    expect(PRO_BOT_TIERS.map((t) => TIER_LABEL[t])).toEqual(["Capo", "Boss"]);
  });

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

describe("table and card designs", () => {
  it("keeps the defaults free and offers member designs of both kinds", () => {
    expect(cosmeticIsPro(DEFAULT_FELT)).toBe(false);
    expect(cosmeticIsPro(DEFAULT_BACK)).toBe(false);
    expect(FELT_IDS.filter(cosmeticIsPro).length).toBeGreaterThanOrEqual(2);
    expect(BACK_IDS.filter(cosmeticIsPro).length).toBeGreaterThanOrEqual(2);
  });

  it("lists every design once, with ids unique across kinds", () => {
    const ids = [...FELTS, ...CARD_BACKS].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(FELTS.map((f) => f.id)).toEqual([...FELT_IDS]);
    expect(CARD_BACKS.map((b) => b.id)).toEqual([...BACK_IDS]);
    for (const id of PRO_COSMETICS) expect(ids).toContain(id);
  });

  it("lets free players use only the free designs", () => {
    expect(canUseCosmetic("crimson", false)).toBe(true);
    expect(canUseCosmetic("house", false)).toBe(true);
    expect(canUseCosmetic("back-room", false)).toBe(false);
    expect(canUseCosmetic("gilded", false)).toBe(false);
    for (const id of [...FELT_IDS, ...BACK_IDS]) expect(canUseCosmetic(id, true)).toBe(true);
    expect(canUseCosmetic("not-a-design", true)).toBe(false);
  });

  it("draws the saved choice when allowed", () => {
    expect(activeCosmetic("felt", "midnight", true)).toBe("midnight");
    expect(activeCosmetic("back", "marquee", true)).toBe("marquee");
    expect(activeCosmetic("felt", "crimson", false)).toBe("crimson");
  });

  it("falls back to the free default when membership lapses, without needing the choice changed", () => {
    const saved = "back-room";
    expect(activeCosmetic("felt", saved, false)).toBe(DEFAULT_FELT);
    expect(activeCosmetic("back", "gilded", false)).toBe(DEFAULT_BACK);
    // rejoining brings the same saved choice back
    expect(activeCosmetic("felt", saved, true)).toBe("back-room");
  });

  it("falls back on missing, unknown or wrong-kind choices", () => {
    expect(activeCosmetic("felt", null, true)).toBe(DEFAULT_FELT);
    expect(activeCosmetic("felt", undefined, false)).toBe(DEFAULT_FELT);
    expect(activeCosmetic("back", "lava", true)).toBe(DEFAULT_BACK);
    expect(activeCosmetic("felt", "gilded", true)).toBe(DEFAULT_FELT);
    expect(activeCosmetic("back", "midnight", true)).toBe(DEFAULT_BACK);
  });

  it("names the design in the paywall reason", () => {
    expect(paywallReason.design("marquee")).toBe("design:marquee");
  });
});
