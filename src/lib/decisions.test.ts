import { describe, expect, it } from "vitest";
import type { Decision } from "./blackjack/coach";
import { bjDirection, bjRows, exportDataset, MAX_MS, pokerRows, SESSION_GAP, sessionFor, thinkMs, type DecisionRow } from "./decisions";
import type { CoachSpot } from "./poker/game-types";

const row = (at: number, sid: string): DecisionRow => ({ at, sid, game: "poker", mode: "table", hid: "h", i: 0, ok: true, net: 0 });

describe("decision log: sessions", () => {
  it("continues the last session until play pauses for the gap", () => {
    const rows = [row(1_000, "abc")];
    expect(sessionFor(rows, 1_000 + SESSION_GAP - 1)).toBe("abc");
    expect(sessionFor(rows, 1_000 + SESSION_GAP)).not.toBe("abc");
  });

  it("starts a session on an empty log, and when the clock went backwards", () => {
    expect(sessionFor([], 5)).toMatch(/^\w{8}$/);
    expect(sessionFor([row(10_000, "abc")], 5_000)).not.toBe("abc");
  });
});

describe("decision log: think time", () => {
  it("caps long pauses and drops nonsense", () => {
    expect(thinkMs(1234.6)).toBe(1235);
    expect(thinkMs(10 * MAX_MS)).toBe(MAX_MS);
    expect(thinkMs(-1)).toBeUndefined();
    expect(thinkMs(Number.NaN)).toBeUndefined();
    expect(thinkMs(undefined)).toBeUndefined();
  });
});

describe("decision log: blackjack direction", () => {
  it.each([
    ["stand", "hit", -1],
    ["hit", "double", -1],
    ["hit", "split", -1],
    ["surrender", "hit", -1],
    ["hit", "stand", 1],
    ["double", "hit", 1],
    ["split", "stand", 1],
    ["insurance", "decline", 1],
    ["stand", "stand", 0],
  ] as const)("%s vs basic strategy's %s → %i", (chosen, best, dir) => {
    expect(bjDirection(chosen, best)).toBe(dir);
  });

  it("has no direction for a double where a split was right", () => {
    expect(bjDirection("double", "split")).toBeUndefined();
  });
});

describe("decision log: rows", () => {
  const spot: CoachSpot = {
    family: "vs-3bet",
    street: "preflop",
    pos: "CO",
    vs: "BTN",
    hand: "AJo",
    chosen: "fold",
    best: "call",
    dir: -1,
    graded: "chart",
    effBb: 100,
    opps: 1,
    ip: false,
    potBb: 12,
    toCallBb: 5.5,
  };

  it("poker rows carry the spot, the hand result in big blinds, and skip unstructured notes", () => {
    const rows = pokerRows(
      [
        { ok: false, cost: 2.1, spot, ms: 4000 },
        { ok: null },
      ],
      { id: "h1", at: 99, mode: "table", net: -25, bb: 10 },
      "s1",
    );
    expect(rows).toEqual([{ at: 99, sid: "s1", game: "poker", mode: "table", hid: "h1", i: 0, ok: false, cost: 2.1, ms: 4000, net: -2.5, poker: spot }]);
  });

  it("blackjack rows measure the result in opening bets", () => {
    const d: Decision = { spot: "soft-18-9", label: "Soft 18 vs 9", kind: "soft", chosen: "stand", correct: "hit", ok: false, cost: 0.03, ms: 900 };
    const [r] = bjRows([d], { id: "r1", at: 5, bet: 100, wagered: 100, payout: 0 }, "s1");
    expect(r).toMatchObject({ game: "blackjack", mode: "bj", hid: "r1", ok: false, cost: 0.03, ms: 900, net: -1 });
    expect(r.bj).toEqual({ family: "soft", key: "soft-18-9", chosen: "stand", best: "hit", dir: -1, bet: 100 });
  });
});

describe("decision log: export", () => {
  it("includes play history but not the name or chips", () => {
    const out = exportDataset({ createdAt: 1, decisions: [row(1, "a")], drills: [], pokerHands: [], bjRounds: [], matches: [] }, Date.UTC(2026, 10, 21));
    expect(out).toMatchObject({ format: "inferno-history", version: 1, exportedAt: "2026-11-21T00:00:00.000Z", counts: { decisions: 1 } });
    expect(out).not.toHaveProperty("name");
    expect(out).not.toHaveProperty("chips");
  });
});
