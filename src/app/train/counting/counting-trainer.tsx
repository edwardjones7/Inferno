"use client";

import Link from "next/link";
import { ProLock } from "@/components/pro/pro-badge";
import { Segmented } from "@/components/ui";
import { countingLocked, paywallReason } from "@/lib/gates";
import { useIsPro } from "@/lib/pro";
import { useHydrated } from "@/lib/store";
import { useStored } from "@/lib/use-stored";
import { DeckDrill } from "./deck-drill";
import { IndexDrill } from "./index-drill";
import { RunningDrill } from "./running-drill";
import { TrueCountDrill } from "./true-count-drill";

const MODES = [
  { id: "running", label: "Running count" },
  { id: "deck", label: "Deck countdown" },
  { id: "true", label: "True count" },
  { id: "index", label: "Index plays" },
] as const;
type Mode = (typeof MODES)[number]["id"];
const isMode = (v: unknown): v is Mode => MODES.some((m) => m.id === v);

export function CountingTrainer() {
  const [mode, setMode] = useStored<Mode>("inferno:count:mode", "running", isMode);
  const pro = useIsPro();
  const hydrated = useHydrated();
  if (!hydrated) return <div className="panel h-[420px] animate-pulse rounded-[28px]" />;
  if (countingLocked(pro)) {
    return (
      <>
        <ProLock
          reason={paywallReason.counting}
          title="The card counting course"
          secondary={
            <Link href="/train/learn/" className="flex h-10 items-center justify-center rounded-xl text-xs font-semibold text-ash-400 hover:text-bone">
              Start with the free lessons
            </Link>
          }
        >
          Four drills that build on each other: keep the running count, count down a deck against the clock, convert to a true count, then learn the
          index plays that change with it.
        </ProLock>
        <HowHiLoWorks />
      </>
    );
  }
  return (
    <>
      <div className="mb-4 overflow-x-auto no-scrollbar">
        <div className="min-w-[440px]">
          <Segmented label="Counting drill" value={mode} onChange={setMode} options={MODES.map((m) => ({ ...m }))} />
        </div>
      </div>
      {mode === "running" && <RunningDrill />}
      {mode === "deck" && <DeckDrill />}
      {mode === "true" && <TrueCountDrill />}
      {mode === "index" && <IndexDrill />}
      <HowHiLoWorks />
      <p className="mt-3 px-1 text-[11px] text-ash-500">
        Counting is here to show the math behind the game. Even a perfect count is a thin, high-variance edge, and casinos are free to refuse play to counters.
      </p>
    </>
  );
}

function HowHiLoWorks() {
  return (
    <details className="panel group mt-6 rounded-3xl p-5 sm:p-6">
      <summary className="flex cursor-pointer list-none items-center justify-between font-display text-base font-bold">
        How Hi-Lo works
        <span className="text-xs text-ember-400 group-open:hidden">Show</span>
        <span className="hidden text-xs text-ember-400 group-open:inline">Hide</span>
      </summary>
      <div className="mt-4 grid gap-4 text-sm leading-relaxed text-ash-300 md:grid-cols-3">
        <div>
          <h3 className="font-display text-sm font-bold text-bone">1. Tag every card</h3>
          <p className="mt-1">
            <span className="font-bold text-emerald-300">2–6 are +1</span>, <span className="font-bold text-ash-200">7–9 are 0</span>,{" "}
            <span className="font-bold text-ember-300">10s and aces are −1</span>. Add the tags as cards appear: that sum is the running count. A full deck sums to zero.
          </p>
        </div>
        <div>
          <h3 className="font-display text-sm font-bold text-bone">2. Convert to a true count</h3>
          <p className="mt-1">
            +6 means much more with one deck left than with five. Divide the running count by the decks still to be dealt (shoe minus the discard tray). Here we round down: +6 ÷ 4 = +1.5 → +1.
          </p>
        </div>
        <div>
          <h3 className="font-display text-sm font-bold text-bone">3. Use it</h3>
          <p className="mt-1">
            A high true count means extra tens and aces remain: more blackjacks for you, more dealer busts. Bet more when it’s high, and switch a handful of plays (the index plays) when it crosses their thresholds.
          </p>
        </div>
      </div>
    </details>
  );
}
