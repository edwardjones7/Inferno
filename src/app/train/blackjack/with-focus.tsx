"use client";

import { useSearchParams } from "next/navigation";
import { Trainer } from "./trainer";

/** `?spot=hard-16-10` focuses the trainer on one chart cell (linked from leak reports). */
export function TrainerWithFocus() {
  const spot = useSearchParams().get("spot");
  const focus = spot && /^(hard|soft|pair)-\d{1,2}-\d{1,2}$/.test(spot) ? spot : null;
  return <Trainer key={focus ?? "all"} focus={focus} />;
}
