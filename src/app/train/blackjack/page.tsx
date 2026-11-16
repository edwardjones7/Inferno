import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { TrainerWithFocus } from "./with-focus";

export const metadata: Metadata = { title: "Blackjack drills" };

export default function BlackjackTrainerPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-5 sm:px-6 lg:pt-10">
      <PageHeader eyebrow="Train · Blackjack" title="Strategy drills">
        <p className="hidden max-w-sm text-right text-xs text-ash-400 sm:block">
          Rapid-fire opening decisions graded against basic strategy for the table you pick.
        </p>
      </PageHeader>
      <Suspense fallback={<div className="panel h-[520px] animate-pulse rounded-3xl" />}>
        <TrainerWithFocus />
      </Suspense>
    </div>
  );
}
