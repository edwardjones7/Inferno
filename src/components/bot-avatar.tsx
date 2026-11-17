"use client";

import { useId } from "react";
import { TIER_LABEL, type BotProfile } from "@/lib/poker/roster";
import { SIGIL_SVG } from "@/lib/poker/sigils";

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
      {/* static markup from a fixed table of sigils, not user input */}
      <g
        fill="none"
        stroke="#fff6e8"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.92"
        dangerouslySetInnerHTML={{ __html: SIGIL_SVG[bot.sigil] }}
      />
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
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone}`}>{TIER_LABEL[tier]}</span>;
}
