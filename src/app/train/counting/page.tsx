import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { CountingTrainer } from "./counting-trainer";

export const metadata: Metadata = { title: "Card counting" };

export default function CountingPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-5 sm:px-6 lg:pt-10">
      <PageHeader eyebrow="School · Blackjack · Advanced" title="Card counting">
        <p className="hidden max-w-sm text-right text-xs text-ash-400 sm:block">
          Hi-Lo from the ground up: keep the count, convert it, and learn the plays it changes. For understanding the math, not a system to beat the house.
        </p>
      </PageHeader>
      <CountingTrainer />
    </div>
  );
}
