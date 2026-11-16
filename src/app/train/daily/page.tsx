import type { Metadata } from "next";
import { DailyPuzzles } from "./daily-puzzles";

export const metadata: Metadata = { title: "Daily puzzles" };

export default function DailyPage() {
  return <DailyPuzzles />;
}
