import type { Metadata } from "next";
import { Suspense } from "react";
import { MatchScreen } from "./match-screen";

export const metadata: Metadata = { title: "Heads-up match" };

export default function MatchPage() {
  return (
    <Suspense fallback={<div className="felt absolute inset-0 animate-pulse" />}>
      <MatchScreen />
    </Suspense>
  );
}
