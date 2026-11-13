import type { Metadata } from "next";
import Link from "next/link";
import { PokerTable } from "./poker-table";

export const metadata: Metadata = { title: "Poker table" };

export default function PokerPlayPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-ember-400">No-Limit Hold&apos;em · 6-max</p>
          <h1 className="font-display text-2xl font-black sm:text-3xl">Poker table</h1>
        </div>
        <Link href="/poker" className="btn-ash rounded-xl px-4 py-2 text-sm font-bold">
          Drills →
        </Link>
      </div>
      <PokerTable />
    </div>
  );
}
