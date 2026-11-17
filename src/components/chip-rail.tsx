"use client";

import { useRef, useState } from "react";
import { Chip, CHIP_VALUES } from "@/components/chip";
import { formatChips } from "@/lib/chips";

/**
 * The player's chips. Tap one to bet it, or drag it up onto the table: it's tossed onto
 * your bet spot when you let go above the rail. Shared by blackjack and poker.
 */
export function ChipRail({ onChip, disabled }: { onChip: (v: number) => void; disabled: boolean }) {
  const rail = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ v: number; x: number; y: number; moved: boolean; over: boolean } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const overTable = (y: number) => {
    const top = rail.current?.getBoundingClientRect().top ?? 0;
    return y < top - 24;
  };

  return (
    <>
      <div ref={rail} className="flex items-center justify-center gap-1.5 sm:gap-3" role="group" aria-label="Chips">
        {CHIP_VALUES.map((v) => (
          <button
            key={v}
            disabled={disabled}
            aria-label={`Bet a ${formatChips(v)} chip`}
            onPointerDown={(e) => {
              if (disabled) return;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              start.current = { x: e.clientX, y: e.clientY };
              setDrag({ v, x: e.clientX, y: e.clientY, moved: false, over: false });
            }}
            onPointerMove={(e) => {
              const s = start.current;
              if (!s) return;
              const moved = Math.hypot(e.clientX - s.x, e.clientY - s.y) > 6;
              setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, moved: d.moved || moved, over: overTable(e.clientY) } : d));
            }}
            onPointerUp={(e) => {
              const d = drag;
              start.current = null;
              setDrag(null);
              if (!d) return;
              // a tap bets the chip; a drag bets it only when dropped onto the table
              if (!d.moved || overTable(e.clientY)) onChip(v);
            }}
            onPointerCancel={() => {
              start.current = null;
              setDrag(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onChip(v);
              }
            }}
            className={`touch-none rounded-full transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-400 disabled:opacity-40 ${
              drag?.v === v && drag.moved ? "scale-90 opacity-40" : "hover:-translate-y-1 active:scale-95"
            }`}
          >
            <Chip value={v} size={50} />
          </button>
        ))}
      </div>
      {/* the chip under the finger while dragging */}
      {drag?.moved && (
        <div
          aria-hidden
          className="pointer-events-none fixed left-0 top-0 z-50"
          style={{ transform: `translate3d(${drag.x - 30}px, ${drag.y - 30}px, 0) scale(${drag.over ? 1.12 : 1})`, transition: "scale 120ms" }}
        >
          <div className={drag.over ? "drop-shadow-[0_0_18px_rgba(255,140,40,0.9)]" : "drop-shadow-[0_12px_14px_rgba(0,0,0,0.7)]"}>
            <Chip value={drag.v} size={60} />
          </div>
        </div>
      )}
    </>
  );
}
