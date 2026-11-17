import { describe, expect, it } from "vitest";
import type { Card } from "./cards";
import {
  betUnits,
  countAdjustedPlay,
  countRecord,
  countSpotForKey,
  decksRemainingOf,
  gradeIndex,
  gradeTrueCount,
  hiLo,
  INDEX_PLAYS,
  indexFor,
  indexSpot,
  newCount,
  runningCount,
  see,
  shuffledDeck,
  trueCount,
  trueCountOf,
  trueCountSpot,
} from "./counting";
import { DEFAULT_RULES, type ActionType } from "./engine";
import { basicStrategy } from "./strategy";

/** Deterministic PRNG (mulberry32). */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OPEN: ActionType[] = ["hit", "stand", "double", "split", "surrender"];
const NO_SUR: ActionType[] = ["hit", "stand", "double", "split"];
const S17 = DEFAULT_RULES;
const S17_NOSUR = { ...DEFAULT_RULES, surrender: false };

describe("Hi-Lo values", () => {
  it("tags low cards +1, middle 0, tens and aces −1", () => {
    expect(["2S", "3H", "4D", "5C", "6S"].map((c) => hiLo(c as Card))).toEqual([1, 1, 1, 1, 1]);
    expect(["7S", "8H", "9D"].map((c) => hiLo(c as Card))).toEqual([0, 0, 0]);
    expect(["TS", "JH", "QD", "KC", "AS"].map((c) => hiLo(c as Card))).toEqual([-1, -1, -1, -1, -1]);
  });

  it("a full deck (and shoe) counts to zero", () => {
    for (let seed = 1; seed < 6; seed++) {
      expect(runningCount(shuffledDeck(seeded(seed)))).toBe(0);
      expect(runningCount(shuffledDeck(seeded(seed), 6))).toBe(0);
    }
  });
});

describe("true count", () => {
  it("divides by decks remaining and floors", () => {
    expect(trueCount(6, 3)).toBe(2);
    expect(trueCount(7, 3)).toBe(2);
    expect(trueCount(6, 1.5)).toBe(4);
    expect(trueCount(-1, 3)).toBe(-1); // floor, not truncate
    expect(trueCount(-6, 2)).toBe(-3);
    expect(trueCount(0, 4)).toBe(0);
    expect(trueCount(5, 0.5)).toBe(10);
  });

  it("RunningCount tracks a shoe", () => {
    let rc = newCount(6);
    rc = see(rc, ["2S", "3S", "4S", "TS"] as Card[]);
    expect(rc).toEqual({ decks: 6, running: 2, seen: 4 });
    expect(decksRemainingOf(rc)).toBe(6);
    rc = { ...rc, running: 9, seen: 52 * 3 };
    expect(decksRemainingOf(rc)).toBe(3);
    expect(trueCountOf(rc)).toBe(3);
  });

  it("true count spots have a consistent answer among four distinct choices", () => {
    const rand = seeded(7);
    for (let i = 0; i < 300; i++) {
      const s = trueCountSpot(rand);
      expect(s.answer).toBe(trueCount(s.running, s.decksRemaining));
      expect(s.choices).toContain(s.answer);
      expect(new Set(s.choices).size).toBe(4);
      expect(s.decksRemaining).toBeGreaterThan(0);
      expect(s.decksRemaining).toBeLessThan(6);
      expect(gradeTrueCount(s, s.answer).ok).toBe(true);
    }
  });
});

describe("bet ramp", () => {
  it("bets the minimum until +2, then ramps to the cap", () => {
    expect([-3, 0, 1, 1.9, 2, 3, 4, 5, 7, 12].map((t) => betUnits(t))).toEqual([1, 1, 1, 1, 2, 4, 6, 8, 12, 12]);
    expect(betUnits(10, 8)).toBe(8);
  });
});

describe("index plays", () => {
  it("the table's basic play matches S17 basic strategy", () => {
    const rand = seeded(3);
    for (const p of INDEX_PLAYS) {
      if (p.spot === "insurance") continue;
      const s = indexSpot(rand, p);
      expect(basicStrategy(s.cards, s.up, s.legal as ActionType[], s.rules), p.id).toBe(p.basic);
    }
  });

  const c = (...xs: string[]) => xs as Card[];

  it("16 vs 10: stand at 0+, hit below; surrender when allowed", () => {
    expect(countAdjustedPlay(c("TS", "6H"), "KD", NO_SUR, S17_NOSUR, 0)).toBe("stand");
    expect(countAdjustedPlay(c("TS", "6H"), "KD", NO_SUR, S17_NOSUR, -1)).toBe("hit");
    expect(countAdjustedPlay(c("TS", "6H"), "KD", OPEN, S17, 3)).toBe("surrender");
    // multi-card 16 can't surrender, the index applies
    expect(countAdjustedPlay(c("TS", "2H", "4C"), "KD", ["hit", "stand"], S17, 1)).toBe("stand");
    // 8,8 is a pair: still split
    expect(countAdjustedPlay(c("8S", "8H"), "KD", NO_SUR, S17_NOSUR, 5)).toBe("split");
  });

  it("15 vs 10: stand at +4 without surrender; with surrender, surrender at 0+ and hit below", () => {
    expect(countAdjustedPlay(c("TS", "5H"), "TD", NO_SUR, S17_NOSUR, 4)).toBe("stand");
    expect(countAdjustedPlay(c("TS", "5H"), "TD", NO_SUR, S17_NOSUR, 3)).toBe("hit");
    expect(countAdjustedPlay(c("TS", "5H"), "TD", OPEN, S17, 0)).toBe("surrender");
    expect(countAdjustedPlay(c("TS", "5H"), "TD", OPEN, S17, 6)).toBe("surrender");
    expect(countAdjustedPlay(c("TS", "5H"), "TD", OPEN, S17, -1)).toBe("hit");
    expect(indexFor(c("TS", "5H"), "TD", OPEN, S17)?.id).toBe("hard-15-10-ls");
    expect(indexFor(c("TS", "5H"), "TD", NO_SUR, S17_NOSUR)?.id).toBe("hard-15-10");
  });

  it("splits tens at +5 vs 5 and +4 vs 6", () => {
    expect(countAdjustedPlay(c("TS", "KH"), "5D", NO_SUR, S17, 5)).toBe("split");
    expect(countAdjustedPlay(c("TS", "KH"), "5D", NO_SUR, S17, 4)).toBe("stand");
    expect(countAdjustedPlay(c("TS", "KH"), "6D", NO_SUR, S17, 4)).toBe("split");
    expect(countAdjustedPlay(c("TS", "KH"), "6D", NO_SUR, S17, 3)).toBe("stand");
  });

  it("12 vs 2/3/4 and the negative stand indices", () => {
    expect(countAdjustedPlay(c("TS", "2H"), "3D", NO_SUR, S17, 2)).toBe("stand");
    expect(countAdjustedPlay(c("TS", "2H"), "3D", NO_SUR, S17, 1)).toBe("hit");
    expect(countAdjustedPlay(c("TS", "2H"), "2D", NO_SUR, S17, 3)).toBe("stand");
    expect(countAdjustedPlay(c("TS", "2H"), "2D", NO_SUR, S17, 2)).toBe("hit");
    expect(countAdjustedPlay(c("TS", "2H"), "4D", NO_SUR, S17, 0)).toBe("stand");
    expect(countAdjustedPlay(c("TS", "2H"), "4D", NO_SUR, S17, -1)).toBe("hit");
    expect(countAdjustedPlay(c("TS", "3H"), "2D", NO_SUR, S17, -1)).toBe("stand");
    expect(countAdjustedPlay(c("TS", "3H"), "2D", NO_SUR, S17, -2)).toBe("hit");
    expect(countAdjustedPlay(c("TS", "2H"), "5D", NO_SUR, S17, -3)).toBe("hit");
    expect(countAdjustedPlay(c("TS", "2H"), "6D", NO_SUR, S17, -1)).toBe("stand");
    expect(countAdjustedPlay(c("TS", "2H"), "6D", NO_SUR, S17, -2)).toBe("hit");
  });

  it("doubles: 10 vs 10/A at +4, 11 vs A at +1, 9 vs 2 at +1, 9 vs 7 at +3; 5,5 plays as 10", () => {
    expect(countAdjustedPlay(c("6S", "4H"), "TD", OPEN, S17, 4)).toBe("double");
    expect(countAdjustedPlay(c("5S", "5H"), "TD", OPEN, S17, 4)).toBe("double");
    expect(countAdjustedPlay(c("6S", "4H"), "AD", OPEN, S17, 3)).toBe("hit");
    expect(countAdjustedPlay(c("6S", "4H"), "AD", OPEN, S17, 4)).toBe("double");
    expect(countAdjustedPlay(c("6S", "5H"), "AD", OPEN, S17, 0)).toBe("hit");
    expect(countAdjustedPlay(c("6S", "5H"), "AD", OPEN, S17, 1)).toBe("double");
    expect(countAdjustedPlay(c("6S", "3H"), "2D", OPEN, S17, 1)).toBe("double");
    expect(countAdjustedPlay(c("6S", "3H"), "7D", OPEN, S17, 3)).toBe("double");
    expect(countAdjustedPlay(c("6S", "3H"), "7D", OPEN, S17, 2)).toBe("hit");
    // can't double a three-card hand: fall back to basic
    expect(countAdjustedPlay(c("2S", "4H", "4C"), "TD", ["hit", "stand"], S17, 6)).toBe("hit");
  });

  it("Fab 4 surrenders", () => {
    expect(countAdjustedPlay(c("TS", "4H"), "TD", OPEN, S17, 3)).toBe("surrender");
    expect(countAdjustedPlay(c("TS", "4H"), "TD", OPEN, S17, 2)).toBe("hit");
    expect(countAdjustedPlay(c("TS", "5H"), "9D", OPEN, S17, 2)).toBe("surrender");
    expect(countAdjustedPlay(c("TS", "5H"), "9D", OPEN, S17, 1)).toBe("hit");
    expect(countAdjustedPlay(c("TS", "5H"), "AD", OPEN, S17, 1)).toBe("surrender");
    expect(countAdjustedPlay(c("TS", "5H"), "AD", OPEN, S17, 0)).toBe("hit");
  });

  it("returns basic strategy where no index applies", () => {
    expect(countAdjustedPlay(c("TS", "7H"), "TD", OPEN, S17, 10)).toBe("stand");
    expect(countAdjustedPlay(c("AS", "7H"), "9D", OPEN, S17, -5)).toBe("hit");
  });

  it("index spots land on both sides of the index and grade consistently", () => {
    const rand = seeded(11);
    for (const p of INDEX_PLAYS) {
      let dev = 0;
      let basic = 0;
      for (let i = 0; i < 40; i++) {
        const s = indexSpot(rand, p);
        expect(s.key).toBe(`index-${p.id}`);
        expect(s.legal).toContain(s.answer);
        expect(s.answer).toBe(s.deviation ? p.deviation : p.basic);
        expect(gradeIndex(s, s.answer).ok).toBe(true);
        if (s.deviation) dev++;
        else basic++;
      }
      expect(dev, p.id).toBeGreaterThan(0);
      expect(basic, p.id).toBeGreaterThan(0);
    }
  });
});

describe("countSpotForKey", () => {
  it("regenerates spots of the same concept", () => {
    const rand = seeded(5);
    expect(countSpotForKey("count-running", rand)?.kind).toBe("count");
    expect(countSpotForKey("count-true", rand)?.kind).toBe("truecount");
    const s = countSpotForKey("index-hard-16-10", rand);
    expect(s?.kind === "index" && s.play.id).toBe("hard-16-10");
    expect(countSpotForKey("index-hard-15-10-ls", rand)?.key).toBe("index-hard-15-10-ls");
    expect(countSpotForKey("index-insurance", rand)?.key).toBe("index-insurance");
    expect(countSpotForKey("index-hard-17-10", rand)).toBeNull();
    expect(countSpotForKey("hard-16-10", rand)).toBeNull();
  });

  it("records carry kind and key for ratings and spaced repetition", () => {
    const s = countSpotForKey("index-pair-10-6", seeded(2))!;
    if (s.kind !== "index") throw new Error("expected index spot");
    const r = countRecord(s, gradeIndex(s, s.answer));
    expect(r).toMatchObject({ game: "blackjack", key: "index-pair-10-6", kind: "index", ok: true });
    expect(r.label).toBe("Index: 10,10 vs 6");
  });
});
