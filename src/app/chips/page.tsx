import type { Metadata } from "next";
import { ChipsScreen } from "./chips-screen";

export const metadata: Metadata = { title: "Chips" };

export default function ChipsPage() {
  return <ChipsScreen />;
}
