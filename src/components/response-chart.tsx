"use client";

/**
 * 13×13 pre-flop chart for a spot where someone has already raised: each hand is a raise
 * (3-bet or 4-bet), a call or a fold. Optionally colored by the player's own accuracy.
 * Every cell is a button when `onSelect` is given; the parent owns selection.
 */
import { accuracyState, ACCURACY_LABEL, type KeyRecord } from "@/lib/accuracy";
import { actionOf, type ResponseAction, type ResponseChart as Chart } from "@/lib/poker/preflop";
import { codeName, GRID } from "@/lib/poker/ranges";
import { ACCURACY_STYLE, AccuracyDot, recordText, type ColorBy } from "./strategy-chart";

export const RESPONSE_STYLE: Record<ResponseAction, string> = {
  raise: "bg-ember-500 text-ash-950",
  call: "bg-sky-400 text-ash-950",
  fold: "bg-ash-800 text-ash-500",
};

export interface ResponseChartProps {
  chart: Chart;
  /** "3-bet" or "4-bet": what a raise means in this spot */
  raiseLabel: string;
  /** spot name for screen readers, e.g. "Big blind vs button open" */
  label: string;
  /** record key for a hand code (e.g. "vo-BB-BTN-AKs"); records are looked up with it */
  keyFor?: (code: string) => string;
  records?: Map<string, KeyRecord>;
  colorBy?: ColorBy;
  selected?: string | null;
  onSelect?: (code: string) => void;
  /** compact cells for sidebars */
  small?: boolean;
  className?: string;
}

const NO_RECORDS = new Map<string, KeyRecord>();

export function ResponseChart({
  chart,
  raiseLabel,
  label,
  keyFor,
  records = NO_RECORDS,
  colorBy = "move",
  selected = null,
  onSelect,
  small = false,
  className = "",
}: ResponseChartProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`grid gap-px overflow-hidden ${small ? "rounded-lg" : "rounded-xl"} bg-ash-950 p-px ${className}`}
      style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
    >
      {GRID.flat().map((code) => {
        const act = actionOf(chart, code);
        const rec = keyFor ? records.get(keyFor(code)) : undefined;
        const state = accuracyState(rec);
        const on = code === selected;
        const mixed = chart.mixed.has(code);
        const style =
          colorBy === "accuracy" && state !== "unseen"
            ? ACCURACY_STYLE[state]
            : colorBy === "accuracy"
              ? act === "fold"
                ? "bg-ash-850 text-ash-600"
                : "bg-ash-700 text-ember-300"
              : RESPONSE_STYLE[act];
        const word = act === "raise" ? raiseLabel : act;
        const text = (
          <span>
            {code.slice(0, 2)}
            {!small && <span className="hidden text-[0.75em] opacity-75 sm:inline">{code.slice(2)}</span>}
          </span>
        );
        const cls = `relative grid aspect-square min-w-0 place-items-center font-display font-bold leading-none tracking-tight ${
          small ? "text-[7px] sm:text-[8px]" : "text-[8px] sm:text-[11px]"
        } ${style} ${on ? "z-10 outline outline-2 outline-bone" : ""}`;
        const mixMark = mixed && colorBy === "move" ? <span aria-hidden className="absolute bottom-0 left-0 right-0 h-[2px] bg-ash-950/40" /> : null;
        if (!onSelect)
          return (
            <span key={code} title={`${code}: ${word}${mixed ? " (mixed)" : ""}`} className={cls}>
              {text}
              {mixMark}
            </span>
          );
        return (
          <button
            key={code}
            type="button"
            onClick={() => onSelect(code)}
            aria-pressed={on}
            aria-label={`${codeName(code)}: ${word}${mixed ? ", mixed" : ""}. ${ACCURACY_LABEL[state]}${rec?.seen ? `, ${recordText(rec)}` : ""}.`}
            className={`${cls} transition-transform hover:brightness-110 active:scale-95`}
          >
            {text}
            {mixMark}
            {colorBy === "move" && <AccuracyDot state={state} />}
          </button>
        );
      })}
    </div>
  );
}

export function ResponseLegend({ raiseLabel, className = "" }: { raiseLabel: string; className?: string }) {
  const item = (cls: string, text: string) => (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={`h-3 w-3 rounded ${cls.split(" ")[0]} ${cls.includes("ash-800") ? "ring-1 ring-ash-700" : ""}`} /> {text}
    </span>
  );
  return (
    <div className={`flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] font-semibold text-ash-400 ${className}`}>
      {item(RESPONSE_STYLE.raise, raiseLabel.charAt(0).toUpperCase() + raiseLabel.slice(1))}
      {item(RESPONSE_STYLE.call, "Call")}
      {item(RESPONSE_STYLE.fold, "Fold")}
      <span className="flex items-center gap-1.5 text-ash-500">
        <span aria-hidden className="relative h-3 w-3 rounded bg-ash-600">
          <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-ash-950/60" />
        </span>
        Underline: solvers mix it
      </span>
    </div>
  );
}
