import type { Metadata } from "next";
import { Suspense } from "react";
import { getTable } from "@/server/casino";
import { currentUserId } from "@/server/session";
import { BlackjackTable } from "./table";

export const metadata: Metadata = { title: "Blackjack" };

export default function BlackjackPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-ember-400">Play &amp; train</p>
          <h1 className="font-display text-2xl font-black sm:text-3xl">Blackjack</h1>
        </div>
        <p className="hidden text-right text-xs text-ash-400 sm:block">
          6 decks · fresh shuffle every hand
          <br />
          RTP up to 99.7% with perfect play
        </p>
      </div>
      <Suspense fallback={<TableSkeleton />}>
        <Table />
      </Suspense>
    </div>
  );
}

async function Table() {
  const userId = await currentUserId();
  const initial = userId ? await getTable(userId) : null;
  return <BlackjackTable initial={initial} />;
}

function TableSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
      <div>
        <div className="felt h-[520px] animate-pulse rounded-[44px]" />
        <div className="panel mt-4 h-24 rounded-3xl" />
      </div>
      <div className="panel h-72 rounded-3xl" />
    </div>
  );
}
