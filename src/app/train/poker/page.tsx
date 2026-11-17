import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { PokerTrainerWithDrill } from "./with-drill";

export const metadata: Metadata = { title: "Poker drills" };

export default function PokerTrainerPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-5 sm:px-6 lg:pt-10">
      <PageHeader eyebrow="School · Hold'em" title="Poker drills">
        <p className="hidden max-w-sm text-right text-xs text-ash-400 xl:block">
          Opening ranges, pot odds, reading showdowns and feeling equity. Every answer graded with exact maths.
        </p>
      </PageHeader>
      <Suspense fallback={<div className="panel h-[520px] animate-pulse rounded-3xl" />}>
        <PokerTrainerWithDrill />
      </Suspense>
    </div>
  );
}
