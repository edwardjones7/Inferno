"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ChipDot } from "@/components/earn";
import { Meter } from "@/components/ui";
import { rewardedAdsAvailable } from "@/lib/ads";
import { formatChips } from "@/lib/chips";
import { useIsPro } from "@/lib/pro";
import { play } from "@/lib/sound";
import { repairWithAd, StreakError, useStreak } from "@/lib/streak-actions";
import { StreakFlame } from "./streak-flame";

export function IconFreeze({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className={className} aria-hidden>
      <path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2 3-2M9 20l3-2 3 2M4 10.5l3.4-.4L6 7M20 10.5l-3.4-.4L18 7M4 13.5l3.4.4L6 17M20 13.5l-3.4.4L18 17" />
    </svg>
  );
}

/** Home's streak card: today's goal, the flame, freezes, the next milestone and any repair offer. */
export function StreakCard({ className = "" }: { className?: string }) {
  const pro = useIsPro();
  const v = useStreak(pro);
  const [busy, setBusy] = useState(false);
  const left = Math.max(0, v.goal - v.todayXp);

  const headline = !v.ready
    ? " "
    : v.metToday
      ? `${v.streak}-day streak`
      : v.streak
        ? `${v.streak} day${v.streak === 1 ? "" : "s"}, still burning`
        : "No streak yet";
  const sub = !v.ready
    ? " "
    : v.metToday
      ? "Goal met. Come back tomorrow to keep it going."
      : v.streak
        ? `${left} XP before midnight keeps it lit.`
        : `Earn ${v.goal} XP today to light it. A lesson does it.`;

  const repair = async () => {
    setBusy(true);
    try {
      const n = await repairWithAd();
      if (n) {
        play("win");
        toast.success(`Streak repaired: ${n} days`);
      } else toast("No reward this time. Try again, or earn double your goal today.");
    } catch (e) {
      toast.error(e instanceof StreakError ? e.message : "Couldn't repair the streak");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`panel relative min-w-0 overflow-hidden rounded-3xl p-5 ${v.atRisk || v.repair ? "ring-1 ring-ember-500/40" : ""} ${className}`}>
      {v.streak > 0 && <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[radial-gradient(closest-side,rgba(255,90,31,0.22),transparent)]" />}
      <div className="relative flex items-center gap-4">
        <span
          className={`grid h-[68px] w-[68px] shrink-0 place-items-center rounded-2xl ring-1 ${
            v.streak ? "bg-ember-500/12 ring-ember-500/40" : "bg-ash-850 ring-ash-700"
          }`}
        >
          <StreakFlame streak={v.streak} dim={v.atRisk} size={54} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Daily goal</p>
          <p className="tabular mt-1 font-display text-lg font-bold">{headline}</p>
          <p className="text-xs text-ash-400">{sub}</p>
        </div>
      </div>

      <div className="relative mt-4">
        <div className="mb-1.5 flex items-baseline justify-between text-[11px] font-bold">
          <span className="text-ash-400">Today</span>
          <span className={`tabular ${v.metToday ? "text-emerald-300" : "text-ember-200"}`}>
            {Math.min(v.todayXp, v.goal)} / {v.goal} XP
          </span>
        </div>
        <Meter value={v.goal ? v.todayXp / v.goal : 0} />
      </div>

      {v.repair && (
        <div className="relative mt-4 rounded-2xl bg-ember-700/15 p-3 ring-1 ring-ember-500/40">
          <p className="text-sm font-bold text-bone">Your {v.repair.length}-day streak went out</p>
          <p className="mt-0.5 text-xs text-ash-300">
            Repair it today: {rewardedAdsAvailable() ? "watch a short ad, or " : ""}earn {v.goal * 2} XP (double your goal).
          </p>
          {rewardedAdsAvailable() && (
            <button disabled={busy} onClick={() => void repair()} className="btn-fire mt-2.5 rounded-xl px-3.5 py-2 text-xs font-bold disabled:opacity-60">
              {busy ? "Loading…" : "Watch an ad to repair"}
            </button>
          )}
        </div>
      )}

      <div className="relative mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-sky-200/90" title="A freeze covers a missed day automatically">
          <IconFreeze className="h-4 w-4" />
          {v.freezes}/{v.freezeCap} freezes
        </span>
        {v.next && (
          <span className="flex items-center gap-1.5 font-semibold text-ash-400">
            Next: {v.next.days} days
            <span className="tabular inline-flex items-center gap-1 text-ember-200">
              <ChipDot className="h-3 w-3" />+{formatChips(v.next.chips)}
            </span>
          </span>
        )}
        {!v.metToday && v.ready && (
          <Link href="/train/" className="btn-fire rounded-xl px-3.5 py-2 text-xs font-bold">
            Keep it lit
          </Link>
        )}
      </div>
    </div>
  );
}
