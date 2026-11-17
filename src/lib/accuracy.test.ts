import { describe, expect, it } from "vitest";
import { accuracyState, blackjackRecords, combine, pokerRecords } from "./accuracy";
import type { BjRoundRecord, DrillRecord } from "./store";

const drill = (game: "blackjack" | "poker", key: string, ok: boolean): DrillRecord => ({
  at: 0,
  game,
  key,
  label: key,
  kind: "x",
  correct: "x",
  ok,
});

const round = (decisions: { spot: string; ok: boolean }[]): BjRoundRecord =>
  ({
    id: "r",
    at: 0,
    tableId: "classic",
    bet: 1,
    wagered: 1,
    payout: 0,
    dealer: [],
    hands: [],
    decisions: decisions.map((d) => ({ ...d, label: d.spot, kind: "hard", chosen: "hit", correct: "hit" })),
  }) as BjRoundRecord;

describe("accuracy records", () => {
  it("merges blackjack drills and live decisions, ignoring insurance and poker", () => {
    const map = blackjackRecords({
      drills: [drill("blackjack", "hard-16-10", false), drill("blackjack", "hard-16-10", true), drill("poker", "pre-BTN-AKs", true), drill("blackjack", "insurance", false)],
      bjRounds: [round([{ spot: "hard-16-10", ok: false }, { spot: "insurance", ok: true }, { spot: "soft-18-2", ok: true }])],
    });
    expect(map.get("hard-16-10")).toEqual({ seen: 3, missed: 2 });
    expect(map.get("soft-18-2")).toEqual({ seen: 1, missed: 0 });
    expect(map.has("insurance")).toBe(false);
    expect(map.has("pre-BTN-AKs")).toBe(false);
  });

  it("keeps only pre-flop poker keys", () => {
    const map = pokerRecords({ drills: [drill("poker", "pre-BTN-AKs", false), drill("poker", "sd-Flush", false), drill("blackjack", "hard-9-3", true)] });
    expect([...map.keys()]).toEqual(["pre-BTN-AKs"]);
  });

  it("combines rows and buckets by miss rate", () => {
    const map = new Map([
      ["hard-17-10", { seen: 4, missed: 0 }],
      ["hard-18-10", { seen: 1, missed: 1 }],
    ]);
    expect(combine(map, ["hard-17-10", "hard-18-10", "hard-19-10"])).toEqual({ seen: 5, missed: 1 });
    expect(accuracyState(undefined)).toBe("unseen");
    expect(accuracyState({ seen: 0, missed: 0 })).toBe("unseen");
    expect(accuracyState({ seen: 10, missed: 1 })).toBe("solid");
    expect(accuracyState({ seen: 5, missed: 1 })).toBe("shaky");
    expect(accuracyState({ seen: 5, missed: 2 })).toBe("leak");
  });
});
