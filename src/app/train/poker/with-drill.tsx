"use client";

import { useSearchParams } from "next/navigation";
import { POKER_DRILLS, type PokerDrill } from "@/lib/poker/drills";
import { PokerTrainer } from "./poker-trainer";

/** `?drill=potodds` opens a specific drill (linked from leak reports). */
export function PokerTrainerWithDrill() {
  const d = useSearchParams().get("drill");
  const drill = POKER_DRILLS.some((x) => x.id === d) ? (d as PokerDrill) : "preflop";
  return <PokerTrainer key={drill} initialDrill={drill} />;
}
