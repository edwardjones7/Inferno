import { describe, expect, it } from "vitest";
import { botDecide } from "./bots";
import { act, newTable, startHand } from "./game";
import type { PokerState } from "./game-types";
import { replayFrames } from "./replay";
import type { PokerHandRecord } from "../store";

function seeded(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Plays one hand with every seat (hero included) driven by the bot logic. */
function playHand(seats: number, seed: number): PokerState {
  const rand = seeded(seed);
  const bots = Array.from({ length: seats - 1 }, (_, i) => ({ name: `Bot${i + 1}`, style: (["tag", "lag", "station", "nit"] as const)[i % 4], skill: 1 }));
  let g = startHand(newTable({ heroName: "You", bots, stack: 1000, sb: 5, bb: 10 }), rand);
  for (let guard = 0; g.street !== "done" && guard < 200; guard++) g = act(g, botDecide(g, g.toAct!, rand));
  return g;
}

const recordOf = (g: PokerState): PokerHandRecord => {
  const shown: Record<number, PokerState["seats"][number]["hole"]> = {};
  if (g.winners.some((w) => w.hand)) for (const s of g.seats) if (!s.folded && s.hole.length === 2) shown[s.id] = s.hole;
  return {
    id: "t",
    at: 0,
    mode: "table",
    bots: [],
    handNo: g.handNo,
    hole: g.seats[0].hole,
    board: g.board,
    shown,
    names: g.seats.map((s) => s.name),
    net: 0,
    bb: g.bb,
    log: g.log,
    notes: [],
  };
};

describe("replayFrames", () => {
  for (const [seats, seeds] of [
    [2, [1, 2, 3, 4, 5, 6, 7, 8]],
    [6, [11, 12, 13, 14, 15, 16, 17, 18]],
  ] as const) {
    for (const seed of seeds) {
      it(`rebuilds a ${seats}-handed hand (seed ${seed})`, () => {
        const g = playHand(seats, seed);
        const frames = replayFrames(recordOf(g));
        const last = frames[frames.length - 1].state;
        // one frame per event plus the opening frame
        expect(frames).toHaveLength(g.log.length + 1);
        expect(last.board).toEqual(g.board);
        expect(last.street).toBe("done");
        expect(last.seats.map((s) => s.folded)).toEqual(g.seats.map((s) => s.folded));
        // chips put in add up to what the winners took
        const paid = last.seats.reduce((n, s) => n + s.totalCommitted, 0);
        expect(paid).toBe(g.winners.reduce((n, w) => n + w.amount, 0));
        // per-seat contributions match the engine
        expect(last.seats.map((s) => s.totalCommitted)).toEqual(g.seats.map((s) => s.totalCommitted));
        expect(last.button).toBe(g.button);
      });
    }
  }

  it("attaches the coach's notes to the decision they were about", () => {
    const g = playHand(2, 3);
    const rec = recordOf(g);
    const heroAction = g.log.findIndex((e) => e.kind === "action" && e.seat === 0);
    if (heroAction < 0) return;
    rec.notes = [{ street: "preflop", ok: true, title: "Good", detail: "", at: heroAction }];
    const frames = replayFrames(rec);
    expect(frames[heroAction + 1].note?.title).toBe("Good");
    expect(frames.filter((f) => f.note)).toHaveLength(1);
  });
});
