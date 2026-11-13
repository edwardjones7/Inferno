import type { Metadata } from "next";
import { PokerTrainer } from "./poker-trainer";

export const metadata: Metadata = { title: "Poker trainer" };

export default function PokerPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-ember-400">Texas Hold&apos;em</p>
          <h1 className="font-display text-2xl font-black sm:text-3xl">Poker trainer</h1>
        </div>
        <p className="hidden max-w-sm text-right text-xs text-ash-400 sm:block">
          The fundamentals that win at No-Limit Hold&apos;em: opening ranges, pot odds, reading showdowns and feeling equity. Every
          answer graded with exact maths.
        </p>
      </div>
      <PokerTrainer />
    </div>
  );
}
