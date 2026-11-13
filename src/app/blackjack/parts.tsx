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
          <div className="rounded-2xl bg-ash-950/92 px-7 py-3 text-center ring-1 ring-ash-600/60 shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
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

/** Thermometer for the session streak: ash-blue when cold, molten when hot. */
export function HeatMeter({ heat }: { heat: number }) {
  const pct = ((heat + 1) / 2) * 100;
  const label = heat > 0.66 ? "On fire" : heat > 0.2 ? "Heating up" : heat < -0.66 ? "Ice cold" : heat < -0.2 ? "Cooling" : "Warm";
  return (
    <div
      className="pointer-events-none flex items-center gap-2 rounded-full bg-ash-950/85 px-3 py-1.5 ring-1 ring-ash-700/80"
      role="meter"
      aria-label="Streak heat"
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={Number(heat.toFixed(2))}
      aria-valuetext={label}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ash-400">Heat</span>
      <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-gradient-to-r from-sky-400/70 via-ash-500 to-ember-400 sm:w-28">
        <motion.span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bone shadow-[0_0_10px_rgba(255,194,75,0.9)]"
          animate={{ left: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
        />
      </span>
      <span className={`text-[11px] font-bold ${heat > 0.2 ? "text-ember-300" : heat < -0.2 ? "text-sky-300" : "text-ash-300"}`}>{label}</span>
    </div>
  );
}
