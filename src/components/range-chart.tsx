"use client";

/**
 * Full-size 13×13 pre-flop opening chart for one position, optionally colored by the
 * player's own accuracy on each hand. Every cell is a button; the parent owns selection.
 */
import { accuracyState, ACCURACY_LABEL, type KeyRecord } from "@/lib/accuracy";
import { codeName, GRID, OPEN_RANGES, type Position } from "@/lib/poker/ranges";
import { ACCURACY_STYLE, AccuracyDot, recordText, type ColorBy } from "./strategy-chart";

export const preflopKey = (pos: Position, code: string) => `pre-${pos}-${code}`;

export interface RangeChartProps {
  pos: Position;
  /** answers keyed "pre-BTN-AKs" (see pokerRecords in lib/accuracy); omit for a plain chart */
  records?: Map<string, KeyRecord>;
  colorBy?: ColorBy;
  selected?: string | null;
  onSelect?: (code: string) => void;
  className?: string;
}

const NO_RECORDS = new Map<string, KeyRecord>();

export function RangeChart({ pos, records = NO_RECORDS, colorBy = "move", selected = null, onSelect, className = "" }: RangeChartProps) {
  const range = OPEN_RANGES[pos];
  return (
    <div
      role="group"
      aria-label={`${pos} opening range`}
      className={`grid gap-px overflow-hidden rounded-xl bg-ash-950 p-px ${className}`}
      style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
    >
      {GRID.flat().map((code) => {
        const open = range.has(code);
        const rec = records.get(preflopKey(pos, code));
        const state = accuracyState(rec);
        const on = code === selected;
        const style =
          colorBy === "accuracy" && state !== "unseen"
            ? ACCURACY_STYLE[state]
            : colorBy === "accuracy"
              ? open
                ? "bg-ash-700 text-ember-300"
                : "bg-ash-850 text-ash-600"
              : open
                ? code.length === 2
                  ? "bg-ember-500 text-ash-950"
                  : "bg-ember-600/85 text-ash-950"
                : "bg-ash-800 text-ash-500";
        return (
          <button
            key={code}
            type="button"
            onClick={() => onSelect?.(code)}
            aria-pressed={on}
            aria-label={`${codeName(code)} from ${pos}: ${open ? "raise" : "fold"}. ${ACCURACY_LABEL[state]}${rec?.seen ? `, ${recordText(rec)}` : ""}.`}
            className={`relative grid aspect-square min-w-0 place-items-center font-display text-[8px] font-bold leading-none tracking-tight transition-transform hover:brightness-110 active:scale-95 sm:text-[11px] ${style} ${
              on ? "z-10 outline outline-2 outline-bone" : ""
            }`}
          >
            <span>
              {code.slice(0, 2)}
              <span className="hidden text-[0.75em] opacity-75 sm:inline">{code.slice(2)}</span>
            </span>
            {colorBy === "move" && <AccuracyDot state={state} />}
          </button>
        );
      })}
    </div>
  );
}
