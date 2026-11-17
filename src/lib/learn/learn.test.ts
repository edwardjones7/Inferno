import { describe, expect, it } from "vitest";
import { evaluate } from "../poker/eval";
import { lessonAfter, LESSONS, lessonUnlocked, nextLesson, TRACKS, trackProgress } from "./index";
import { combosLeft, dealerBustChance, hitChance, insuranceEv, runningCount, textureOf, trueCount } from "./math";
import { RANKING_EXAMPLES } from "./poker";
import type { CheckStep } from "./types";

const checks = (id: string) => LESSONS.find((l) => l.id === id)!.steps().filter((s): s is CheckStep => s.kind === "check");

describe("lesson content", () => {
  it("has the planned tracks in order", () => {
    expect(TRACKS.blackjack.lessons.map((l) => l.id)).toEqual([
      "bj-dealer-bust",
      "bj-hard-totals",
      "bj-soft-totals",
      "bj-pairs",
      "bj-doubling",
      "bj-surrender",
      "bj-insurance",
      "bj-counting",
    ]);
    expect(TRACKS.poker.lessons.map((l) => l.id).slice(-5)).toEqual(["pk-hand-reading", "pk-bb-defence", "pk-3bet", "pk-vs-3bet", "pk-ranges-later"]);
    expect(TRACKS.poker.lessons).toHaveLength(13);
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
  });

  it("every lesson opens with an explanation and every check has its answer among the options", () => {
    for (const l of LESSONS) {
      const steps = l.steps();
      const cs = steps.filter((s): s is CheckStep => s.kind === "check");
      expect(cs.length, l.id).toBeGreaterThanOrEqual(1);
      expect(steps[0].kind, l.id).toBe("explain");
      expect(l.practice.length, l.id).toBeGreaterThan(0);
      for (const c of cs) {
        expect(c.options.map((o) => o.id), `${l.id}: ${c.prompt}`).toContain(c.answer);
        expect(new Set(c.options.map((o) => o.id)).size).toBe(c.options.length);
      }
    }
  });

  it("grades blackjack checks with basic strategy", () => {
    expect(checks("bj-dealer-bust").map((c) => c.answer)).toEqual(["40", "stand", "hit"]);
    expect(checks("bj-hard-totals").map((c) => c.answer)).toEqual(["hit", "hit", "stand"]);
    expect(checks("bj-soft-totals").map((c) => c.answer)).toEqual(["hit", "double", "stand"]);
    expect(checks("bj-pairs").map((c) => c.answer)).toEqual(["split", "stand", "stand", "double"]);
    expect(checks("bj-doubling").map((c) => c.answer)).toEqual(["double", "hit", "hit", "double"]);
    expect(checks("bj-surrender").map((c) => c.answer)).toEqual(["surrender", "hit", "split"]);
    expect(checks("bj-counting").map((c) => c.answer)).toEqual(["-1", "3"]);
  });

  it("grades poker checks with the engine", () => {
    expect(checks("pk-hand-rankings").map((c) => c.answer)).toEqual(["hero", "hero", "split"]);
    expect(checks("pk-opening-ranges").map((c) => c.answer)).toEqual(["fold", "raise", "fold"]);
    expect(checks("pk-pot-odds").map((c) => c.answer)).toEqual(["33", "17", "call", "fold"]);
    expect(checks("pk-outs")[0].answer).toBe("9");
    expect(checks("pk-equity").map((c) => c.answer)).toEqual(["pair", "70"]);
    expect(checks("pk-board-texture").map((c) => c.answer)).toEqual(["dry", "wet", "paired"]);
    expect(checks("pk-hand-reading").map((c) => c.answer)).toEqual(["76o", "16", "6"]);
    // response-chart lessons: answers come from preflop.ts
    expect(checks("pk-bb-defence").map((c) => c.answer)).toEqual(["call", "fold", "raise", "fold"]);
    expect(checks("pk-3bet").map((c) => c.answer)).toEqual(["3", "raise", "fold", "raise"]);
    expect(checks("pk-vs-3bet").map((c) => c.answer)).toEqual(["call", "raise", "fold", "call"]);
    expect(checks("pk-ranges-later").map((c) => c.answer)).toEqual(["air", "33", "wider"]);
  });

  it("lists hand rankings strongest first", () => {
    const s = RANKING_EXAMPLES.map((c) => evaluate(c));
    expect([...s].sort((a, b) => b - a)).toEqual(s);
  });
});

describe("unlocking", () => {
  it("opens lessons one at a time per track", () => {
    const p = { lessons: {} as Record<string, number> };
    expect(lessonUnlocked(p, "bj-dealer-bust")).toBe(true);
    expect(lessonUnlocked(p, "pk-hand-rankings")).toBe(true);
    expect(lessonUnlocked(p, "bj-hard-totals")).toBe(false);
    expect(nextLesson(p, "blackjack")?.id).toBe("bj-dealer-bust");
    p.lessons["bj-dealer-bust"] = 1;
    expect(lessonUnlocked(p, "bj-hard-totals")).toBe(true);
    expect(nextLesson(p, "blackjack")?.id).toBe("bj-hard-totals");
    expect(trackProgress(p, "blackjack")).toEqual({ done: 1, total: 8 });
    expect(lessonUnlocked(p, "nope")).toBe(false);
    for (const l of TRACKS.poker.lessons) p.lessons[l.id] = 1;
    expect(nextLesson(p, "poker")).toBeNull();
    expect(lessonAfter("bj-counting")).toBeNull();
    expect(lessonAfter("bj-dealer-bust")?.id).toBe("bj-hard-totals");
  });
});

describe("math", () => {
  it("dealer bust chances are in the textbook range", () => {
    expect(dealerBustChance(6)).toBeGreaterThan(0.4);
    expect(dealerBustChance(6)).toBeLessThan(0.45);
    expect(dealerBustChance(10)).toBeGreaterThan(0.2);
    expect(dealerBustChance(10)).toBeLessThan(0.25);
    expect(dealerBustChance(5)).toBeGreaterThan(dealerBustChance(7));
    expect(dealerBustChance(11)).toBeLessThan(dealerBustChance(10));
  });

  it("insurance loses about 7% in six decks", () => {
    expect(insuranceEv(6)).toBeCloseTo(-0.074, 2);
    expect(insuranceEv(6, ["KS", "QH"])).toBeLessThan(insuranceEv(6));
  });

  it("counts Hi-Lo", () => {
    expect(runningCount(["2C", "6D", "7H", "TS", "AC"])).toBe(0);
    expect(trueCount(9, 3)).toBe(3);
    expect(trueCount(-7, 2)).toBe(-3);
  });

  it("classifies textures and odds", () => {
    expect(textureOf(["KS", "7D", "2C"])).toBe("dry");
    expect(textureOf(["JH", "TH", "8C"])).toBe("wet");
    expect(textureOf(["AH", "5H", "4H"])).toBe("wet");
    expect(textureOf(["8S", "8D", "3C"])).toBe("paired");
    expect(hitChance(9, 2)).toBeCloseTo(0.35, 2);
    expect(hitChance(9, 1)).toBeCloseTo(0.196, 2);
    expect(combosLeft("AK", [])).toBe(16);
    expect(combosLeft("QQ", ["QS"])).toBe(3);
  });
});
