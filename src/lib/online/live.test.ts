import { describe, expect, it } from "vitest";
import { seeded } from "../poker/equity";
import {
  applyMove,
  LiveError,
  NEXT_DELAY_MS,
  startGame,
  type BjPublic,
  type BjSecret,
  type Outcome,
  type PokerPrivate,
  type PokerPublic,
  type PokerSecret,
  type SeatInfo,
} from "./live";

const P3: SeatInfo[] = [
  { user: "a", seat: 0, name: "Ada" },
  { user: "b", seat: 1, name: "Bo" },
  { user: "c", seat: 2, name: "Cy" },
];

const pub = (o: Outcome) => o.public as PokerPublic;
const bj = (o: Outcome) => o.public as BjPublic;

/** The user due to act at a poker table. */
const turn = (o: Outcome) => {
  const p = pub(o);
  return p.toAct === null ? null : p.seats[p.toAct].user;
};

const chipsOnTable = (s: PokerSecret) => s.engine.seats.reduce((n, x) => n + x.stack, 0) + s.engine.pot;

describe("live poker", () => {
  it("deals hidden hole cards: each player sees only their own", () => {
    const o = startGame("poker", {}, P3, seeded(1), 0);
    const json = JSON.stringify(o.public);
    for (const s of P3) {
      const hole = (o.private[s.user] as PokerPrivate).hole;
      expect(hole).toHaveLength(2);
      for (const c of hole) expect(json).not.toContain(`"${c}"`);
    }
    expect(pub(o).seats.every((x) => x.dealt)).toBe(true);
    expect(o.closed).toBe(false);
  });

  it("only the player to act may act", () => {
    const o = startGame("poker", {}, P3, seeded(2), 0);
    const other = P3.find((s) => s.user !== turn(o))!.user;
    expect(() => applyMove(o.secret, { kind: "poker", action: { kind: "fold" } }, other, seeded(3), 1)).toThrow(LiveError);
    expect(() => applyMove(o.secret, { kind: "poker", action: { kind: "fold" } }, "stranger", seeded(3), 1)).toThrow(/not at this table/);
  });

  it("plays a hand to the end, logs it face up, and deals the next after the pause", () => {
    let o = startGame("poker", {}, P3, seeded(4), 0);
    let t = 0;
    while (turn(o)) o = applyMove(o.secret, { kind: "poker", action: { kind: "fold" } }, turn(o)!, seeded(5), ++t);
    expect(pub(o).street).toBe("done");
    expect(o.hands).toHaveLength(1);
    expect(o.hands[0].record).toHaveProperty("players");
    const at = pub(o).nextAt!;
    expect(() => applyMove(o.secret, { kind: "next" }, "a", seeded(6), at - 1)).toThrow(/Not yet/);
    const n = applyMove(o.secret, { kind: "next" }, "a", seeded(6), at);
    expect(pub(n).handNo).toBe(2);
    expect(chipsOnTable(n.secret as PokerSecret)).toBe(30_000);
  });

  it("clamps raises into the legal range", () => {
    const o = startGame("poker", {}, P3, seeded(7), 0);
    const L = pub(o).legal!;
    const n = applyMove(o.secret, { kind: "poker", action: { kind: "raise", to: 10 } }, turn(o)!, seeded(8), 1);
    expect(pub(n).currentBet).toBe(L.minRaiseTo);
  });

  it("acts for a player whose clock runs out, but not before", () => {
    const o = startGame("poker", { turn: 30 }, P3, seeded(9), 0);
    expect(() => applyMove(o.secret, { kind: "timeout" }, "a", seeded(1), 29_999)).toThrow(/still time/);
    const who = turn(o)!;
    const n = applyMove(o.secret, { kind: "timeout" }, "a", seeded(1), 30_000);
    const seat = pub(n).seats.find((x) => x.user === who)!;
    expect(seat.folded || seat.lastAction?.startsWith("Check")).toBe(true);
  });

  it("closes the table when everyone else leaves", () => {
    let o = startGame("poker", {}, P3.slice(0, 2), seeded(10), 0);
    o = applyMove(o.secret, { kind: "leave" }, "b", seeded(11), 1);
    // b is auto-folded whenever it's their turn, so the hand finishes without them
    let t = 1;
    while (turn(o)) o = applyMove(o.secret, { kind: "poker", action: { kind: "call" } }, turn(o)!, seeded(12), ++t);
    expect(pub(o).over).toBe(true);
    expect(o.closed).toBe(true);
  });

  it("keeps every chip on the table across many random hands, and never leaks a hole card early", () => {
    const rand = seeded(2026);
    let o = startGame("poker", { stack: 2_000, bb: 100 }, P3, rand, 0);
    let t = 0;
    for (let step = 0; step < 4_000 && !o.closed; step++) {
      t += 100;
      const p = pub(o);
      if (p.street === "done") {
        o = applyMove(o.secret, { kind: "next" }, "a", rand, p.nextAt!);
        t = p.nextAt!;
        continue;
      }
      const L = p.legal!;
      const r = rand();
      const action =
        r < 0.15 ? { kind: "fold" as const } : r < 0.6 || !L.canRaise ? { kind: "call" as const } : { kind: "raise" as const, to: L.minRaiseTo + Math.floor(rand() * (L.maxRaiseTo - L.minRaiseTo)) };
      o = applyMove(o.secret, { kind: "poker", action }, turn(o)!, rand, t);
      expect(chipsOnTable(o.secret as PokerSecret)).toBe(6_000);
      if (pub(o).street !== "done") {
        const json = JSON.stringify(o.public);
        for (const u of ["a", "b", "c"]) for (const c of (o.private[u] as PokerPrivate).hole) expect(json).not.toContain(`"${c}"`);
      }
    }
    expect(o.closed).toBe(true);
  });

  it("needs at least two players", () => {
    expect(() => startGame("poker", {}, P3.slice(0, 1), seeded(1), 0)).toThrow(LiveError);
  });
});

describe("live blackjack", () => {
  const stand = (o: Outcome, user: string, now = 1) => applyMove(o.secret, { kind: "blackjack", action: "stand" }, user, seeded(1), now);

  /** Decline insurance and stand for everyone still playing. */
  function finishAll(o: Outcome, now = 1): Outcome {
    for (const p of bj(o).players) {
      while (true) {
        const v = bj(o).players.find((x) => x.user === p.user)!;
        if (v.phase !== "player" && v.phase !== "insurance") break;
        o = applyMove(o.secret, { kind: "blackjack", action: v.phase === "insurance" ? "decline" : "stand" }, p.user, seeded(1), now);
      }
    }
    return o;
  }

  it("deals everyone against one dealer and hides the hole card until the round settles", () => {
    const o = startGame("blackjack", {}, P3, seeded(20), 0);
    const v = bj(o);
    expect(v.phase === "playing" || v.phase === "settled").toBe(true);
    if (v.phase === "playing") expect(v.dealer[1]).toBeNull();
    const s = o.secret as BjSecret;
    for (const p of s.players) expect(p.round!.dealer.slice(0, 2)).toEqual(s.dealer.slice(0, 2));
  });

  it("plays the dealer once for the table and settles every player against it", () => {
    let o = startGame("blackjack", {}, P3, seeded(21), 0);
    o = finishAll(o);
    const v = bj(o);
    expect(v.phase).toBe("settled");
    expect(v.dealer.every((c) => c !== null)).toBe(true);
    const s = o.secret as BjSecret;
    for (const p of s.players) expect(p.round!.dealer).toEqual(s.dealer);
    expect(o.hands).toHaveLength(1);
  });

  it("lets players act at the same time, in any order", () => {
    for (let seed = 30; seed < 60; seed++) {
      let o = startGame("blackjack", {}, P3, seeded(seed), 0);
      if (bj(o).phase !== "playing") continue;
      const order = ["c", "a", "b"];
      for (const u of order) {
        const v = bj(o).players.find((x) => x.user === u)!;
        if (v.phase === "player") o = stand(o, u);
      }
      o = finishAll(o);
      expect(bj(o).phase).toBe("settled");
    }
  });

  it("grades each decision with the coach, privately", () => {
    for (let seed = 60; seed < 120; seed++) {
      const o = startGame("blackjack", {}, P3, seeded(seed), 0);
      const me = bj(o).players.find((x) => x.user === "a")!;
      if (me.phase !== "player") continue;
      const n = stand(o, "a");
      const notes = (n.private.a as { notes: unknown[] }).notes;
      expect(notes).toHaveLength(1);
      expect((n.private.b as { notes: unknown[] }).notes).toHaveLength(0);
      return;
    }
    throw new Error("no playable deal found");
  });

  it("moves table chips by exactly what each round paid", () => {
    const rand = seeded(77);
    let o = startGame("blackjack", { bet: 25, stack: 1_000 }, P3, rand, 0);
    for (let round = 0; round < 60 && !o.closed; round++) {
      // random but legal play
      for (let guard = 0; guard < 60 && bj(o).phase === "playing"; guard++) {
        for (const p of bj(o).players) {
          if (p.phase !== "player" && p.phase !== "insurance") continue;
          const a = p.legal[Math.floor(rand() * p.legal.length)];
          o = applyMove(o.secret, { kind: "blackjack", action: a }, p.user, rand, round * 10_000);
        }
      }
      expect(bj(o).phase).toBe("settled");
      const s = o.secret as BjSecret;
      for (const p of s.players) if (p.round) expect(p.stack).toBe(p.before - p.round.wagered + p.round.payout);
      for (const p of s.players) expect(p.stack).toBeGreaterThanOrEqual(0);
      if (o.closed) break;
      o = applyMove(o.secret, { kind: "next" }, "a", rand, bj(o).nextAt!);
    }
  });

  it("stands for players who run out of time", () => {
    for (let seed = 120; seed < 160; seed++) {
      const o = startGame("blackjack", { turn: 30 }, P3, seeded(seed), 0);
      if (bj(o).phase !== "playing") continue;
      expect(() => applyMove(o.secret, { kind: "timeout" }, "a", seeded(1), 29_000)).toThrow(/still time/);
      const n = applyMove(o.secret, { kind: "timeout" }, "a", seeded(1), 30_000);
      expect(bj(n).phase).toBe("settled");
      return;
    }
  });

  it("closes when nobody can cover the bet", () => {
    let o = startGame("blackjack", {}, P3.slice(0, 1), seeded(5), 0);
    o = applyMove(o.secret, { kind: "leave" }, "a", seeded(1), 1);
    expect(bj(o).phase).toBe("settled");
    expect(o.closed).toBe(true);
  });

  it("rejects a move after the player's round is done", () => {
    let o = startGame("blackjack", {}, P3, seeded(21), 0);
    o = finishAll(o);
    expect(() => stand(o, "a")).toThrow(LiveError);
  });

  it("rejects a raise of the next round before the pause", () => {
    let o = startGame("blackjack", {}, P3, seeded(21), 0);
    o = finishAll(o, 5);
    expect(() => applyMove(o.secret, { kind: "next" }, "a", seeded(1), 5 + NEXT_DELAY_MS - 1)).toThrow(/Not yet/);
  });
});
