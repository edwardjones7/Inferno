"use client";

import { motion } from "motion/react";
import { useId, type CSSProperties } from "react";
import { usePortraitsEnabled, useBotPortrait } from "@/components/bot-portraits/portraits";
import { IconLock } from "@/components/icons";
import { TIER_LABEL, type BotProfile } from "@/lib/poker/roster";
import { SIGIL_SVG } from "@/lib/poker/sigils";

interface AvatarProps {
  bot: BotProfile;
  size?: number;
  /** faded and desaturated (folded, beaten, not yet won) */
  dim?: boolean;
  /** an ember ring: the bot you're about to face */
  ring?: boolean;
  /** not unlocked yet: the portrait is a shadow with a lock on it */
  locked?: boolean;
}

/**
 * A bot's portrait: a lamp-lit photo of its 3D character in a thin brass frame, like a picture
 * pinned to the back-room board. The photo is rendered once per session (see
 * `bot-portraits/portraits.ts`); until it's ready the frame shows the bot's sigil, and without
 * WebGL (where the tables drop to flat 2D) the avatar is the sigil coin.
 */
export function BotAvatar({ bot, size = 56, dim = false, ring = false, locked = false }: AvatarProps) {
  const enabled = usePortraitsEnabled();
  if (!enabled) return <SigilCoin bot={bot} size={size} dim={dim} ring={ring} locked={locked} />;
  return <PortraitFrame bot={bot} width={size} height={size} dim={dim} ring={ring} locked={locked} />;
}

/** The larger, 4:5 portrait for a bot's detail panel. */
export function BotPortrait({ bot, width = 120, ring = false, locked = false }: Omit<AvatarProps, "size" | "dim"> & { width?: number }) {
  const enabled = usePortraitsEnabled();
  if (!enabled) return <SigilCoin bot={bot} size={Math.round(width * 0.8)} dim={false} ring={ring} locked={locked} />;
  return <PortraitFrame bot={bot} width={width} height={Math.round(width * 1.25)} ring={ring} locked={locked} />;
}

/* ------------------------------------------------------------------ photo */

const BRASS = "linear-gradient(145deg, #f3d48a 0%, #a8792f 26%, #5c3d14 50%, #c99a45 74%, #f0d18a 100%)";
const TACK = "radial-gradient(circle at 35% 30%, #fff2c8, #c8962e 45%, #4a2e0c)";

function PortraitFrame({
  bot,
  width,
  height,
  dim = false,
  ring = false,
  locked = false,
}: {
  bot: BotProfile;
  width: number;
  height: number;
  dim?: boolean;
  ring?: boolean;
  locked?: boolean;
}) {
  const url = useBotPortrait(bot, true);
  const tiny = width < 30;
  const big = width >= 100;
  const pad = tiny ? 1 : big ? 3 : 2;
  const radius = tiny ? 999 : big ? 5 : 4;

  // a desk lamp overhead, the bot's colour pooling low in the frame
  const backdrop = `radial-gradient(95% 70% at 42% 16%, #7a4a22 0%, #3a2112 46%, #120a06 100%), linear-gradient(to top, ${bot.colors[1]}40, transparent 50%)`;
  const photo: CSSProperties = {
    // the render is 4:5 head and shoulders; a square avatar crops in closer on the face
    objectPosition: "50% 20%",
    transform: height > width ? "scale(1.08)" : "scale(1.2)",
    transformOrigin: "50% 30%",
    filter: locked ? "brightness(0)" : dim ? "grayscale(1) sepia(0.25) brightness(0.8)" : "sepia(0.3) saturate(0.9) contrast(1.06)",
  };

  return (
    <span
      role="img"
      aria-label={locked ? `${bot.name} (locked)` : bot.name}
      className="relative inline-block shrink-0"
      style={{ width, height }}
    >
      <span
        className="absolute inset-0 block"
        style={{
          padding: pad,
          borderRadius: radius,
          background: BRASS,
          opacity: dim ? 0.5 : 1,
          boxShadow: ring
            ? "0 0 0 2px #ff9a2e, 0 0 20px -2px rgba(255,120,40,0.75)"
            : "0 6px 14px -8px rgba(0,0,0,0.9)",
        }}
      >
        <span
          className="relative block h-full w-full overflow-hidden"
          style={{
            borderRadius: Math.max(0, radius - pad),
            background: backdrop,
            boxShadow: "inset 0 0 0 1px rgba(20,10,4,0.9)",
          }}
        >
          {url ? (
            <motion.img
              src={url}
              alt=""
              draggable={false}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35 }}
              className="absolute inset-0 h-full w-full object-cover"
              style={photo}
            />
          ) : (
            <SigilMark bot={bot} />
          )}
          {/* lamp falloff, a glassy sheen, and a fine inner rule for the deco frame */}
          <span
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 95% at 50% 32%, transparent 52%, rgba(8,4,2,0.72)), linear-gradient(160deg, rgba(255,236,200,0.14), transparent 38%)",
              boxShadow: tiny ? undefined : "inset 0 0 0 1px rgba(20,10,4,0.9), inset 0 0 0 2px rgba(240,200,120,0.22)",
              borderRadius: "inherit",
            }}
          />
          {locked && !tiny && (
            <span className="absolute inset-x-0 bottom-[10%] flex justify-center">
              <span
                className="grid place-items-center rounded-full bg-ash-950/80 text-ember-200 ring-1 ring-ember-300/40"
                style={{ width: Math.max(16, width * 0.3), height: Math.max(16, width * 0.3) }}
              >
                <IconLock className="h-1/2 w-1/2" />
              </span>
            </span>
          )}
        </span>
      </span>
      {/* a brass tack holding the photo up */}
      {width >= 56 && (
        <span
          className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/3 rounded-full"
          style={{ background: TACK, boxShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
        />
      )}
    </span>
  );
}

/** The sigil, faint, while the photo develops. */
function SigilMark({ bot }: { bot: BotProfile }) {
  return (
    <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full" aria-hidden>
      <g
        fill="none"
        stroke="#f0d18a"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.3"
        // static markup from a fixed table of sigils, not user input
        dangerouslySetInnerHTML={{ __html: SIGIL_SVG[bot.sigil] }}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ sigil coin (no WebGL) */

/** A glowing coin with the bot's sigil. Pure SVG, scales to any size. */
function SigilCoin({ bot, size, dim, ring, locked }: { bot: BotProfile; size: number; dim: boolean; ring: boolean; locked: boolean }) {
  const [inner, outer] = bot.colors;
  const id = `av-${bot.id}-${useId()}`;
  const coin = (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`shrink-0 ${dim || locked ? "opacity-40 grayscale" : ""}`}
      role="img"
      aria-label={locked ? `${bot.name} (locked)` : bot.name}
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
  if (!locked || size < 30) return coin;
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {coin}
      <span className="absolute bottom-0 right-0 grid h-5 w-5 place-items-center rounded-full bg-ash-950 text-ash-300 ring-1 ring-ash-600">
        <IconLock className="h-3 w-3" />
      </span>
    </span>
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
