import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { Charts } from "./charts";

export const metadata: Metadata = {
  title: "Strategy charts",
  description: "Blackjack basic strategy and poker opening ranges, colored by how well you know each spot.",
};

export default function ChartsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-5 sm:px-6 lg:pt-10">
      <PageHeader eyebrow="School · Charts" title="Know the chart cold">
        <p className="hidden max-w-sm text-right text-xs text-ash-400 sm:block">
          Every correct play, colored by your own record. Tap a spot to see why, then drill it.
        </p>
      </PageHeader>
      <Suspense fallback={<div className="panel h-[560px] animate-pulse rounded-3xl" />}>
        <Charts />
      </Suspense>
    </div>
  );
}
