"use client";

import { useSearchParams } from "next/navigation";
import { POKER_DRILLS, type PokerDrill } from "@/lib/poker/drills";
import { POSITIONS, type Position } from "@/lib/poker/ranges";
import { PokerTrainer } from "./poker-trainer";

/**
 * `?drill=potodds` opens a specific drill (linked from leak reports). `?pos=BTN` locks the
 * opening-ranges drill to one seat (linked from the charts page).
 */
export function PokerTrainerWithDrill() {
  const params = useSearchParams();
  const d = params.get("drill");
  const p = params.get("pos")?.toUpperCase();
  const drill = POKER_DRILLS.some((x) => x.id === d) ? (d as PokerDrill) : "preflop";
  const pos = POSITIONS.includes(p as Position) ? (p as Position) : undefined;
  return <PokerTrainer key={`${drill}-${pos ?? ""}`} initialDrill={drill} initialPos={pos} />;
}
