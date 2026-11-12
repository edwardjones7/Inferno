"use client";

import { motion } from "motion/react";
import { isRed, RANK_LABEL, rankOf, SUIT_SYMBOL, suitOf, type Card } from "@/lib/blackjack/cards";

interface Props {
  card: Card | null;
  /** seconds before this card slides out of the shoe */
  delay?: number;
  /** seconds before a face-down card flips (when it becomes known) */
  flipDelay?: number;
  dim?: boolean;
  small?: boolean;
}

const SIZE = {
  md: "h-[92px] w-[66px] sm:h-[120px] sm:w-[86px] rounded-[10px]",
  sm: "h-[46px] w-[33px] rounded-[5px]",
};

export function PlayingCard({ card, delay = 0, flipDelay = 0, dim = false, small = false }: Props) {
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
        transition={{ duration: 0.5, delay: faceUp ? flipDelay : 0, ease: [0.3, 0.7, 0.2, 1] }}
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

function Back() {
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[inherit]"
      style={{
        background: "radial-gradient(circle at 50% 60%, #ff5a1f 0%, #b3200c 35%, #3d0805 80%)",
        boxShadow: "0 10px 24px -10px rgba(0,0,0,.9), inset 0 0 0 1px rgba(255,194,75,.35)",
      }}
    >
      <div
        className="absolute inset-[5px] rounded-[6px] border border-ember-300/40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(255,194,75,.12) 0 2px, transparent 2px 9px), repeating-linear-gradient(-45deg, rgba(255,194,75,.12) 0 2px, transparent 2px 9px)",
        }}
      />
      <svg viewBox="0 0 32 32" className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 opacity-90">
        <path
          fill="#ffe1a1"
          d="M16.6 1.5c.9 4.6-1.4 7-3.6 9.6-2 2.3-4.2 4.7-4.2 8.6 0 2.5 1 4.6 2.6 6-1-2.9.4-5.2 2.3-6.8-.2 2.6.9 4 2.6 4.8-.6-3.1 1.2-5.5 3.3-7.3.3 3.4 3.4 4.6 3.4 8.5 0 .3 0 .6-.1.8 1.6-1.4 2.6-3.5 2.6-5.9 0-5.4-4-8.2-5.6-12.2-.9-2.2-1.4-4-3.3-6.1Z"
        />
      </svg>
    </div>
  );
}
