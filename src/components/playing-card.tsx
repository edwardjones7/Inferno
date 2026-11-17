"use client";

import { motion } from "motion/react";
import { useSyncExternalStore } from "react";
import { cardBackUrl } from "@/game/designs/card-backs";
import { isRed, RANK_LABEL, rankOf, SUIT_SYMBOL, suitOf, type Card } from "@/lib/blackjack/cards";
import { useTableLook } from "@/lib/settings";

interface Props {
  card: Card | null;
  /** seconds before this card slides out of the shoe */
  delay?: number;
  /** seconds before a face-down card flips (when it becomes known) */
  flipDelay?: number;
  /** seconds the flip takes (longer for a slow-motion reveal) */
  flipDuration?: number;
  dim?: boolean;
  small?: boolean;
}

const SIZE = {
  md: "h-[92px] w-[66px] sm:h-[120px] sm:w-[86px] rounded-[10px]",
  sm: "h-[46px] w-[33px] rounded-[5px]",
};

export function PlayingCard({ card, delay = 0, flipDelay = 0, flipDuration = 0.5, dim = false, small = false }: Props) {
  const faceUp = card !== null;
  return (
    <motion.div
      className={`relative shrink-0 [perspective:800px] ${small ? SIZE.sm : SIZE.md}`}
      initial={small ? false : { x: 240, y: -260, rotate: 18, opacity: 0 }}
      animate={{ x: 0, y: 0, rotate: 0, opacity: dim ? 0.45 : 1, filter: dim ? "grayscale(0.9)" : "grayscale(0)" }}
      transition={{ delay, type: "spring", stiffness: 260, damping: 26, filter: { duration: 0.6 }, opacity: { duration: 0.25, delay: dim ? 0 : delay } }}
    >
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        initial={false}
        animate={{ rotateY: faceUp ? 0 : 180 }}
        transition={{ duration: flipDuration, delay: faceUp ? flipDelay : 0, ease: [0.3, 0.7, 0.2, 1] }}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">{card && <Face card={card} small={small} />}</div>
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <Back />
        </div>
      </motion.div>
    </motion.div>
  );
}

function Face({ card, small }: { card: Card; small: boolean }) {
  const red = isRed(card);
  const rank = RANK_LABEL(rankOf(card));
  const suit = SUIT_SYMBOL[suitOf(card)];
  const color = red ? "text-ember-600" : "text-ash-950";
  if (small) {
    return (
      <div className={`flex h-full w-full flex-col items-center justify-center rounded-[inherit] bg-[#f8efe4] font-display leading-none ${color}`}>
        <span className="text-[12px] font-bold">{rank}</span>
        <span className="text-[12px]">{suit}</span>
      </div>
    );
  }
  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-[inherit] font-display ${color}`}
      style={{
        background: "linear-gradient(160deg, #fffaf2 0%, #f6ecdf 55%, #ead9c6 100%)",
        boxShadow: "0 10px 24px -10px rgba(0,0,0,.9), inset 0 0 0 1px rgba(80,40,20,.15)",
      }}
    >
      <div className="absolute left-1.5 top-1.5 flex flex-col items-center leading-none sm:left-2 sm:top-2">
        <span className="text-base font-bold sm:text-xl">{rank}</span>
        <span className="text-sm sm:text-lg">{suit}</span>
      </div>
      <div className="absolute bottom-1.5 right-1.5 flex rotate-180 flex-col items-center leading-none sm:bottom-2 sm:right-2">
        <span className="text-base font-bold sm:text-xl">{rank}</span>
        <span className="text-sm sm:text-lg">{suit}</span>
      </div>
      <span className="absolute inset-0 grid place-items-center text-3xl opacity-90 sm:text-[44px]">{suit}</span>
    </div>
  );
}

/** The back in the player's card design (the same painter as the 3D cards). */
function Back() {
  const { back } = useTableLook();
  const url = useSyncExternalStore(
    noop,
    () => cardBackUrl(back, 192),
    () => null,
  );
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[inherit] bg-[#4d110d] bg-cover bg-center"
      style={{
        backgroundImage: url ? `url(${url})` : undefined,
        boxShadow: "0 10px 24px -10px rgba(0,0,0,.9), inset 0 0 0 1px rgba(203,177,124,.35)",
      }}
    />
  );
}

const noop = () => () => {};
