"use client";

import { useId } from "react";

/**
 * The streak's flame. It grows with the streak: an unlit match head at 0, a small flame for
 * the first week, a full one with a gold core after 7 days, a white-hot core after 30, and a
 * crown of sparks after 100. `dim` draws today's flame cooling (streak alive, goal not met).
 */
export function flameTier(streak: number): 0 | 1 | 2 | 3 | 4 {
  return streak <= 0 ? 0 : streak < 7 ? 1 : streak < 30 ? 2 : streak < 100 ? 3 : 4;
}

export function StreakFlame({ streak, size = 48, dim = false, className = "" }: { streak: number; size?: number; dim?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  const tier = flameTier(streak);

  if (tier === 0) {
    // a spent match: stick and a dark head
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className={className}>
        <rect x="22.5" y="20" width="3" height="22" rx="1" fill="#5a4636" />
        <ellipse cx="24" cy="18" rx="4" ry="5.5" fill="#2b2019" stroke="#4a3a2e" strokeWidth="1" />
      </svg>
    );
  }

  const scale = [0, 0.72, 0.86, 0.96, 1][tier];
  const outer = dim ? ["#6b2a12", "#3a1a0e"] : ["#ff9a2e", "#c9300c"];
  const core = tier >= 3 ? ["#fff7e0", "#ffd36b"] : ["#ffd36b", "#ff7a1f"];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden
      className={`${dim ? "" : "animate-flicker"} ${className}`}
      style={dim ? undefined : { filter: `drop-shadow(0 0 ${4 + tier * 3}px rgba(255,122,31,${0.35 + tier * 0.12}))` }}
    >
      <defs>
        <linearGradient id={`${id}o`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={outer[0]} />
          <stop offset="1" stopColor={outer[1]} />
        </linearGradient>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={core[0]} />
          <stop offset="1" stopColor={core[1]} />
        </linearGradient>
      </defs>
      <g transform={`translate(24 44) scale(${scale}) translate(-24 -44)`}>
        {/* matchstick under the flame */}
        <rect x="22.6" y="34" width="2.8" height="12" rx="1" fill="#8a6a4a" opacity={dim ? 0.6 : 1} />
        <path
          d="M25.2 4c1 5.2-1.6 8-4.2 10.9-2.4 2.7-4.9 5.4-4.9 9.9a8.1 8.1 0 0 0 16.2 0c0-6.2-4.6-9.4-6.4-14-1-2.5-1.5-4.5-.7-6.8Z"
          transform="translate(0 6)"
          fill={`url(#${id}o)`}
        />
        {tier >= 2 && (
          <path
            d="M24.6 16c.5 2.8-.9 4.3-2.2 5.8-1.2 1.4-2.5 2.8-2.5 5.1a4.4 4.4 0 0 0 8.8 0c0-3.3-2.5-5-3.5-7.4-.5-1.3-.8-2.4-.6-3.5Z"
            transform="translate(0 6)"
            fill={`url(#${id}c)`}
            opacity={dim ? 0.4 : 0.95}
          />
        )}
      </g>
      {tier === 4 && !dim && (
        <g fill="#ffd36b">
          <circle cx="12" cy="10" r="1.2" opacity="0.9" />
          <circle cx="36" cy="8" r="1" opacity="0.8" />
          <circle cx="9" cy="22" r="0.9" opacity="0.7" />
          <circle cx="39" cy="20" r="1.1" opacity="0.85" />
          <circle cx="30" cy="3" r="0.8" opacity="0.7" />
        </g>
      )}
    </svg>
  );
}
