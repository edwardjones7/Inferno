import type { Metadata } from "next";
import { BlackjackTable } from "./table";

export const metadata: Metadata = { title: "Blackjack" };

export default function BlackjackPage() {
  return <BlackjackTable />;
}
