import type { Metadata } from "next";
import { BlackjackTable } from "./table";

export const metadata: Metadata = { title: "Blackjack" };

export default function BlackjackPage() {
  return (
    <div className="mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-6">
      <div className="mb-4 hidden items-end justify-between gap-4 lg:flex">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-ember-400">Play &amp; learn</p>
          <h1 className="font-display text-3xl font-black">Blackjack</h1>
        </div>
        <p className="text-right text-xs text-ash-400">
          6 decks · fresh shuffle every hand
          <br />
          Every decision graded by the coach
        </p>
      </div>
      <BlackjackTable />
    </div>
  );
}
