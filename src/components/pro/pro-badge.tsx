"use client";

import { openPaywall, PRO_NAME } from "@/lib/pro";
import { play } from "@/lib/sound";
import { FlameMark } from "../logo";

/** Small "PRO" tag for things that need the membership. */
export function ProBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-[linear-gradient(180deg,rgb(201_92_38/0.3),rgb(127_40_16/0.3))] py-0.5 pl-1 pr-1.5 font-display text-[10px] leading-none tracking-[0.14em] text-brass-100 ring-1 ring-brass-400/60 ${className}`}
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
    <div className="panel relative overflow-hidden rounded-3xl px-5 py-9 text-center sm:px-8">
      <div aria-hidden className="sunburst pointer-events-none absolute inset-0 rotate-180" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-72 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,90,31,0.28),transparent)]" />
      <span className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ash-950/70 ring-1 ring-ember-500/40 shadow-[0_0_40px_-10px_rgba(255,90,31,0.8)]">
        <FlameMark className="h-8 w-8 animate-flicker" />
      </span>
      <p className="relative mt-4 eyebrow">{PRO_NAME}</p>
      <h2 className="relative mt-1 font-display font-black tracking-tight text-xl leading-tight sm:text-2xl">{title}</h2>
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
