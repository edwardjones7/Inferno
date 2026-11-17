"use client";

import { useSearchParams } from "next/navigation";
import { POKER_DRILLS, type PokerDrill } from "@/lib/poker/drills";
import { PokerTrainer } from "./poker-trainer";

/**
 * `?drill=potodds` opens a specific drill (linked from leak reports). `?pos=BTN` locks the
 * opening-ranges drill to one seat (linked from the charts page). For the response drills,
 * `?drill=vsopen&pos=BB&vs=BTN` locks your seat and the opener (or the 3-bettor for vs3bet).
 */
export function PokerTrainerWithDrill() {
  const params = useSearchParams();
  const d = params.get("drill");
  const pos = params.get("pos")?.toUpperCase() || undefined;
  const vs = params.get("vs")?.toUpperCase() || undefined;
  const drill = POKER_DRILLS.some((x) => x.id === d) ? (d as PokerDrill) : "preflop";
  return <PokerTrainer key={`${drill}-${pos ?? ""}-${vs ?? ""}`} initialDrill={drill} initialPos={pos} initialVs={vs} />;
}
