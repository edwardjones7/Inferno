import type { Metadata } from "next";
import { Suspense } from "react";
import { MatchScreen } from "./match-screen";

export const metadata: Metadata = { title: "Heads-up match" };

export default function MatchPage() {
  return (
    <div className="mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-6">
      <Suspense fallback={<div className="felt h-[min(58dvh,460px)] animate-pulse rounded-[28px]" />}>
        <MatchScreen />
      </Suspense>
    </div>
  );
}
