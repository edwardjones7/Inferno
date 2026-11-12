"use client";

import { AnimatePresence, motion } from "motion/react";
import { formatUsd } from "@/lib/currency";
import type { Outcome } from "./timing";

export function TotalBadge({
  total,
  soft,
  bust,
  active,
  hiddenHole,
}: {
  total: number | null;
  soft?: boolean;
  bust?: boolean;
  active?: boolean;
  hiddenHole?: boolean;
}) {
  if (total === null) return <span className="inline-block h-7 w-10 animate-pulse rounded-full bg-ash-800" />;
  const label = soft && total < 21 && !hiddenHole ? `${total - 10}/${total}` : String(total);
  return (
    <span
      className={`tabular inline-flex h-7 min-w-10 items-center justify-center rounded-full px-2.5 text-sm font-bold ring-1 ${
        bust
          ? "bg-ash-800 text-ash-400 ring-ash-600 line-through"
          : total === 21
            ? "bg-ember-500 text-ash-950 ring-ember-300"
            : active
              ? "bg-ash-950 text-ember-200 ring-ember-400"
              : "bg-ash-950/80 text-bone ring-ash-600"
      }`}
    >
      {label}
      {hiddenHole && <span className="ml-1 text-ash-500">+?</span>}
    </span>
  );
}

export function ResultTag({ result, payoutUsd, betUsd }: { result: string; payoutUsd: number; betUsd: number }) {
  const net = payoutUsd - betUsd;
  const map: Record<string, string> = {
    blackjack: "bg-gradient-to-b from-ember-300 to-ember-500 text-ash-950",
    win: "bg-ember-500 text-ash-950",
    push: "bg-ash-600 text-bone",
    lose: "bg-ash-800 text-ash-400",
    surrender: "bg-ash-800 text-ash-300",
  };
  return (
    <motion.span
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`tabular inline-flex h-7 items-center rounded-full px-3 text-xs font-bold uppercase tracking-wider ${map[result]}`}
    >
      {result === "lose" ? "Lose" : result} {net !== 0 && formatUsd(net, { sign: true })}
    </motion.span>
  );
}

/** The big "You win / Push / Bust" card shown when a hand settles. */
export function OutcomeBanner({ result, roundId }: { result: Outcome | null; roundId: string }) {
  return (
    <AnimatePresence>
      {result && (
        <motion.div
          key={roundId}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <div className="rounded-2xl bg-ash-950/85 px-7 py-3 text-center ring-1 ring-ash-600/60 backdrop-blur-md">
            <p
              className={`font-display text-2xl font-black uppercase tracking-wider sm:text-3xl ${
                result.tone === "win" ? "molten-text" : result.tone === "push" ? "text-ash-200" : "text-ash-400"
              }`}
            >
              {result.title}
            </p>
            <p
              className={`tabular mt-0.5 text-sm font-semibold ${
                result.tone === "win" ? "text-ember-300" : result.tone === "push" ? "text-ash-300" : "text-ash-500"
              }`}
            >
              {result.net === 0 ? "Stake returned" : formatUsd(result.net, { sign: true })}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
