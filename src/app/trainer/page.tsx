import type { Metadata } from "next";
import { Suspense } from "react";
import { Trainer } from "./trainer";

export const metadata: Metadata = { title: "Strategy trainer" };

export default function TrainerPage({ searchParams }: PageProps<"/trainer">) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-ember-400">Trainer</p>
          <h1 className="font-display text-2xl font-black sm:text-3xl">Strategy drills</h1>
        </div>
        <p className="hidden max-w-sm text-right text-xs text-ash-400 sm:block">
          Rapid-fire opening decisions graded against basic strategy for the table you pick. No money, no waiting for the dealer.
        </p>
      </div>
      <Suspense fallback={<div className="panel h-[520px] animate-pulse rounded-3xl" />}>
        <WithFocus searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function WithFocus({ searchParams }: { searchParams: PageProps<"/trainer">["searchParams"] }) {
  const sp = await searchParams;
  const spot = Array.isArray(sp.spot) ? sp.spot[0] : sp.spot;
  const focus = spot && /^(hard|soft|pair)-\d{1,2}-\d{1,2}$/.test(spot) ? spot : null;
  return <Trainer key={focus ?? "all"} focus={focus} />;
}
