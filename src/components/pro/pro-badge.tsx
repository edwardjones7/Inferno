"use client";

import { openPaywall, PRO_NAME } from "@/lib/pro";
import { play } from "@/lib/sound";
import { FlameMark } from "../logo";

/** Small "PRO" tag for things that need the membership. */
export function ProBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[linear-gradient(180deg,rgb(255_154_46/0.22),rgb(179_32_12/0.22))] py-0.5 pl-1 pr-1.5 text-[9px] font-black leading-none tracking-[0.16em] text-ember-200 ring-1 ring-ember-400/50 ${className}`}
    >
      <FlameMark className="h-2.5 w-2.5" />
      PRO
    </span>
  );
}

/**
 * In-page stand-in for a Pro screen (a lesson, the counting drills, a Pro bot's match).
 * One quiet card, not a wall: what it is, why it's locked, one way in.
 */
export function ProLock({
  reason,
  title,
  children,
  secondary,
}: {
  reason: string;
  title: string;
  children: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <div className="panel relative overflow-hidden rounded-[28px] px-5 py-9 text-center sm:px-8">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-72 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,90,31,0.28),transparent)]" />
      <span className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ash-950/70 ring-1 ring-ember-500/40 shadow-[0_0_40px_-10px_rgba(255,90,31,0.8)]">
        <FlameMark className="h-8 w-8 animate-flicker" />
      </span>
      <p className="relative mt-4 text-[10px] font-bold uppercase tracking-[0.28em] text-ember-400">{PRO_NAME}</p>
      <h2 className="relative mt-1 font-display text-xl font-black leading-tight sm:text-2xl">{title}</h2>
      <p className="relative mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ash-400">{children}</p>
      <div className="relative mx-auto mt-6 flex max-w-xs flex-col gap-2">
        <button
          onClick={() => {
            play("click");
            openPaywall(reason);
          }}
          className="btn-fire flex h-12 items-center justify-center rounded-xl text-sm font-bold"
        >
          See {PRO_NAME}
        </button>
        {secondary}
      </div>
    </div>
  );
}
