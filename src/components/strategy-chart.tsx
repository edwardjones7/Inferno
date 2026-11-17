"use client";

import { useMemo } from "react";

/**
 * Basic-strategy reference chart (hard totals, soft totals, pairs × dealer upcard) for a
 * given rule set, optionally colored by the player's own accuracy on each cell. Every
 * cell is a button; the parent owns selection and shows the details.
 */
import { combine, accuracyState, ACCURACY_LABEL, type AccuracyState, type KeyRecord } from "@/lib/accuracy";
import { spotFromKey, spotLegal } from "@/lib/blackjack/drill";
import type { Rules } from "@/lib/blackjack/engine";
import { basicStrategy, explain, MOVE_LABEL, spotOf, type Move, type SpotKind } from "@/lib/blackjack/strategy";

export type ColorBy = "move" | "accuracy";

/* ------------------------------------------------------------------ chart data */

export const DEALERS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
export const upLabel = (d: number) => (d === 11 ? "A" : String(d));

export interface ChartRow {
  kind: SpotKind;
  /** value used for the cell key and the representative hand */
  value: number;
  /** every stored total this row stands for (e.g. "17+" covers hard 17 to 21) */
  values: number[];
  /** short row header, e.g. "16", "A,7", "8,8" */
  head: string;
  /** spoken/long name, e.g. "Hard 16", "Soft 18", "8,8" */
  name: string;
}

const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
const pairHead = (v: number) => (v === 1 ? "A,A" : v === 10 ? "10,10" : `${v},${v}`);

export const CHART_SECTIONS: { kind: SpotKind; title: string; rows: ChartRow[] }[] = [
  {
    kind: "hard",
    title: "Hard totals",
    rows: range(8, 17).map((v) => ({
      kind: "hard",
      value: v,
      values: v === 8 ? range(4, 8) : v === 17 ? range(17, 21) : [v],
      head: v === 8 ? "≤8" : v === 17 ? "17+" : String(v),
      name: v === 8 ? "Hard 8 or less" : v === 17 ? "Hard 17+" : `Hard ${v}`,
    })),
  },
  {
    kind: "soft",
    title: "Soft totals",
    rows: range(13, 20).map((v) => ({ kind: "soft", value: v, values: [v], head: `A,${v - 11}`, name: `Soft ${v}` })),
  },
  {
    kind: "pair",
    title: "Pairs",
    rows: [...range(2, 10), 1].map((v) => ({ kind: "pair", value: v, values: [v], head: pairHead(v), name: pairHead(v) })),
  },
];

export const cellKey = (row: ChartRow, dealer: number) => `${row.kind}-${row.value}-${dealer}`;

export interface ChartCell {
  key: string;
  row: ChartRow;
  dealer: number;
  /** "Hard 16 vs 10" */
  label: string;
  /** stored spot keys whose answers count towards this cell */
  recordKeys: string[];
}

/** Look up a chart cell by its key ("hard-16-10"); null if the key isn't on the chart. */
export function chartCell(key: string): ChartCell | null {
  const [kind, v, d] = key.split("-");
  const dealer = Number(d);
  const row = CHART_SECTIONS.find((s) => s.kind === kind)?.rows.find((r) => r.value === Number(v));
  if (!row || !DEALERS.includes(dealer as (typeof DEALERS)[number])) return null;
  return { key, row, dealer, label: `${row.name} vs ${upLabel(dealer)}`, recordKeys: row.values.map((x) => `${row.kind}-${x}-${dealer}`) };
}

export interface ChartPlay {
  move: Move;
  /** what to do when the move isn't allowed (double/surrender after the first two cards) */
  fallback?: Move;
  /** chart notation: "H", "S", "P", "Dh", "Ds", "Rh", "Rs", "Rp" */
  code: string;
  /** one-line reason, from the coach */
  why: string;
}

const LETTER: Record<Move, string> = { hit: "H", stand: "S", double: "D", split: "P", surrender: "R" };

/** The correct play for a chart cell under these rules, from a representative hand. */
export function chartPlay(key: string, rules: Rules): ChartPlay | null {
  const spot = spotFromKey(key, () => 0);
  if (!spot) return null;
  const legal = spotLegal(spot.cards, spot.up, rules);
  const move = basicStrategy(spot.cards, spot.up, legal, rules);
  let fallback: Move | undefined;
  if (move === "double" || move === "surrender") {
    // later in the hand neither double nor surrender is available
    fallback = basicStrategy(spot.cards, spot.up, legal.filter((a) => a !== "double" && a !== "surrender"), rules);
  }
  return { move, fallback, code: LETTER[move] + (fallback ? LETTER[fallback].toLowerCase() : ""), why: explain(spotOf(spot.cards, spot.up), move) };
}

/** Every cell's play for a rule set, keyed by cell key. */
export function buildChart(rules: Rules): Map<string, ChartPlay> {
  const out = new Map<string, ChartPlay>();
  for (const s of CHART_SECTIONS)
    for (const row of s.rows)
      for (const d of DEALERS) {
        const key = cellKey(row, d);
        const play = chartPlay(key, rules);
        if (play) out.set(key, play);
      }
  return out;
}

export function playText(p: ChartPlay): string {
  return p.fallback ? `${MOVE_LABEL[p.move]}, otherwise ${MOVE_LABEL[p.fallback].toLowerCase()}` : MOVE_LABEL[p.move];
}

/* ------------------------------------------------------------------ styling */

export const MOVE_STYLE: Record<Move, string> = {
  hit: "bg-ash-700 text-ash-200",
  stand: "bg-ember-300 text-ash-950",
  double: "bg-ember-500 text-ash-950",
  split: "bg-sky-400 text-ash-950",
  surrender: "bg-ember-800 text-ember-100",
};

export const ACCURACY_STYLE: Record<AccuracyState, string> = {
  unseen: "bg-ash-850 text-ash-500",
  solid: "bg-emerald-500/85 text-ash-950",
  shaky: "bg-ember-300 text-ash-950",
  leak: "bg-ember-600 text-bone",
};

/** small corner marker shown in "move" mode so accuracy is still visible */
export const ACCURACY_DOT: Record<Exclude<AccuracyState, "unseen">, string> = {
  solid: "bg-emerald-400",
  shaky: "bg-ember-200",
  leak: "bg-ember-600",
};

export function recordText(r: KeyRecord): string {
  if (!r.seen) return "not seen yet";
  return `${r.seen - r.missed} of ${r.seen} right`;
}

export function AccuracyDot({ state }: { state: AccuracyState }) {
  if (state === "unseen") return null;
  return <span aria-hidden className={`absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-ash-950 sm:h-2 sm:w-2 ${ACCURACY_DOT[state]}`} />;
}

function LegendItem({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={`h-3 w-3 rounded ${cls}`} />
      {label}
    </span>
  );
}

export function AccuracyLegend({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] font-semibold text-ash-400 ${className}`}>
      {(Object.keys(ACCURACY_STYLE) as AccuracyState[]).map((s) => (
        <LegendItem key={s} cls={ACCURACY_STYLE[s].split(" ")[0]} label={ACCURACY_LABEL[s]} />
      ))}
    </div>
  );
}

export function MoveLegend({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] font-semibold text-ash-400 ${className}`}>
      {(Object.keys(MOVE_STYLE) as Move[]).map((m) => (
        <LegendItem key={m} cls={MOVE_STYLE[m].split(" ")[0]} label={`${LETTER[m]} ${MOVE_LABEL[m]}`} />
      ))}
      <span className="text-ash-500">Small letter: play if not allowed</span>
    </div>
  );
}

/* ------------------------------------------------------------------ chart */

export interface StrategyChartProps {
  /** table rules the plays are computed for */
  rules: Rules;
  /** per spot key answers (see blackjackRecords in lib/accuracy); omit for a plain chart */
  records?: Map<string, KeyRecord>;
  colorBy?: ColorBy;
  /** which sections to show (default: hard, soft, pairs) */
  kinds?: SpotKind[];
  selected?: string | null;
  onSelect?: (key: string) => void;
  className?: string;
}

const NO_RECORDS = new Map<string, KeyRecord>();

export function StrategyChart({ rules, records = NO_RECORDS, colorBy = "move", kinds, selected = null, onSelect, className = "" }: StrategyChartProps) {
  const chart = useMemo(() => buildChart(rules), [rules]);
  const sections = kinds ? CHART_SECTIONS.filter((s) => kinds.includes(s.kind)) : CHART_SECTIONS;
  const cols = { gridTemplateColumns: "minmax(2.4rem, auto) repeat(10, minmax(0, 1fr))" };

  return (
    <div className={`flex flex-col gap-5 ${className}`}>
      {sections.map((s) => (
        <section key={s.kind} aria-label={s.title}>
          <h3 className="mb-2 font-display text-sm font-bold">{s.title}</h3>
          <div className="grid gap-[3px]" style={cols}>
            <span className="grid place-items-center text-[9px] font-bold uppercase tracking-wider text-ash-500">You</span>
            {DEALERS.map((d) => (
              <span key={d} className="tabular grid h-6 place-items-center text-[11px] font-bold text-ember-300/80">
                {upLabel(d)}
              </span>
            ))}
            {s.rows.map((row) => (
              <Row key={row.head} row={row} chart={chart} records={records} colorBy={colorBy} selected={selected} onSelect={onSelect} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Row({
  row,
  chart,
  records,
  colorBy,
  selected,
  onSelect,
}: {
  row: ChartRow;
  chart: Map<string, ChartPlay>;
  records: Map<string, KeyRecord>;
  colorBy: ColorBy;
  selected: string | null;
  onSelect?: (key: string) => void;
}) {
  return (
    <>
      <span className="tabular flex items-center pr-1 text-[11px] font-bold text-ash-300">{row.head}</span>
      {DEALERS.map((d) => {
        const key = cellKey(row, d);
        const play = chart.get(key);
        if (!play) return <span key={d} />;
        const rec = combine(records, row.values.map((v) => `${row.kind}-${v}-${d}`));
        const state = accuracyState(rec);
        const on = key === selected;
        const style = colorBy === "accuracy" ? ACCURACY_STYLE[state] : MOVE_STYLE[play.move];
        return (
          <button
            key={d}
            type="button"
            onClick={() => onSelect?.(key)}
            aria-pressed={on}
            aria-label={`${row.name} vs ${upLabel(d)}: ${playText(play)}. ${ACCURACY_LABEL[state]}${rec.seen ? `, ${recordText(rec)}` : ""}.`}
            className={`relative grid h-7 min-w-0 place-items-center rounded-[5px] font-display text-[11px] font-bold leading-none transition-transform hover:brightness-110 active:scale-95 sm:h-8 sm:text-xs ${style} ${
              on ? "z-10 outline outline-2 outline-offset-1 outline-bone" : ""
            }`}
          >
            <span>
              {play.code[0]}
              {play.code[1] && <span className="text-[8px] opacity-80 sm:text-[9px]">{play.code[1]}</span>}
            </span>
            {colorBy === "move" && <AccuracyDot state={state} />}
          </button>
        );
      })}
    </>
  );
}
