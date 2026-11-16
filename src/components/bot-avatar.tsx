"use client";

import { useId } from "react";
import type { BotProfile, Sigil } from "@/lib/poker/roster";

const SIGILS: Record<Sigil, React.ReactNode> = {
  spark: <path d="M32 14l4 12 12 4-12 4-4 12-4-12-12-4 12-4z" />,
  drop: <path d="M32 13c6 9 13 15 13 23a13 13 0 0 1-26 0c0-8 7-14 13-23Zm-4 25a5 5 0 0 0 5 5" />,
  leaf: <path d="M18 44c0-17 12-27 28-27 0 17-10 29-27 29Zm1 1 15-15" />,
  moon: <path d="M38 16a16 16 0 1 0 10 25 13 13 0 0 1-10-25Z" />,
  eye: (
    <>
      <path d="M14 32s7-11 18-11 18 11 18 11-7 11-18 11-18-11-18-11Z" />
      <circle cx="32" cy="32" r="5" />
    </>
  ),
  crown: <path d="M16 42h32l2-20-9 7-9-12-9 12-9-7zM17 47h30" />,
  fang: <path d="M18 18h28l-4 10-5 18-5-14-5 14-5-18z" />,
  sun: (
    <>
      <circle cx="32" cy="32" r="8" />
      <path d="M32 14v6M32 44v6M14 32h6M44 32h6M19.3 19.3l4.3 4.3M40.4 40.4l4.3 4.3M19.3 44.7l4.3-4.3M40.4 23.6l4.3-4.3" />
    </>
  ),
};

/** A bot's portrait: a glowing coin with its sigil. Pure SVG, scales to any size. */
export function BotAvatar({ bot, size = 56, dim = false, ring = false }: { bot: BotProfile; size?: number; dim?: boolean; ring?: boolean }) {
  const [inner, outer] = bot.colors;
  const id = `av-${bot.id}-${useId()}`;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`shrink-0 ${dim ? "opacity-40 grayscale" : ""}`}
      role="img"
      aria-label={bot.name}
    >
      <defs>
        <radialGradient id={`${id}-bg`} cx="0.35" cy="0.3" r="0.85">
          <stop offset="0" stopColor={inner} />
          <stop offset="0.55" stopColor={outer} />
          <stop offset="1" stopColor="#0a0705" />
        </radialGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9b8" stopOpacity="0.9" />
          <stop offset="1" stopColor={outer} stopOpacity="0.6" />
        </linearGradient>
      </defs>
      {ring && <circle cx="32" cy="32" r="31" fill="none" stroke="#ff9a2e" strokeWidth="2" opacity="0.9" />}
      <circle cx="32" cy="32" r={ring ? 28 : 30} fill={`url(#${id}-bg)`} />
      <circle cx="32" cy="32" r={ring ? 27.5 : 29.5} fill="none" stroke={`url(#${id}-rim)`} strokeWidth="1.2" />
      <ellipse cx="26" cy="20" rx="14" ry="7" fill="#fff" opacity="0.12" />
      <g fill="none" stroke="#fff6e8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.92">
        {SIGILS[bot.sigil]}
      </g>
    </svg>
  );
}

export function TierBadge({ tier }: { tier: BotProfile["tier"] }) {
  const tone =
    tier === "Master"
      ? "bg-gradient-to-r from-ember-300 to-ember-500 text-ash-950"
      : tier === "Advanced"
        ? "bg-ember-500/20 text-ember-200 ring-1 ring-ember-500/40"
        : tier === "Intermediate"
          ? "bg-ash-800 text-ash-200 ring-1 ring-ash-600"
          : "bg-ash-900 text-ash-400 ring-1 ring-ash-700";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone}`}>{tier}</span>;
}
