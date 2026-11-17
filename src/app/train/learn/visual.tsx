"use client";

import { Fragment } from "react";
import { MiniCard, PlayingCardStatic } from "@/components/playing-card-static";
import type { Visual } from "@/lib/learn";
import { GRID, OPEN_RANGES, POSITION_NAME, rangePercent } from "@/lib/poker/ranges";

/** Paragraph text with `**bold**` emphasis. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <strong key={i} className="font-bold text-ember-200">
            {p}
          </strong>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

export function VisualView({ v }: { v: Visual }) {
  switch (v.kind) {
    case "cards":
      return <CardsVisual v={v} />;
    case "bars":
      return (
        <figure className="rounded-2xl bg-ash-950/60 p-4 ring-1 ring-ash-800">
          <div className="space-y-1.5">
            {v.bars.map((b) => (
              <div key={b.label} className="flex items-center gap-2.5 text-xs">
                <span className="w-16 shrink-0 truncate font-bold text-ash-300 sm:w-20">{b.label}</span>
                <span className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-md bg-ash-800">
                  <span
                    className={`absolute inset-y-0 left-0 rounded-md ${b.hot ? "bg-gradient-to-r from-ember-600 to-ember-400" : "bg-ash-600"}`}
                    style={{ width: `${Math.max(2, Math.min(100, b.value))}%` }}
                  />
                  {b.note && <span className="absolute inset-y-0 right-2 flex items-center text-[10px] text-ash-400">{b.note}</span>}
                </span>
                <span className={`tabular w-9 shrink-0 text-right font-bold ${b.hot ? "text-ember-300" : "text-ash-300"}`}>{Math.round(b.value)}%</span>
              </div>
            ))}
          </div>
          {v.caption && <figcaption className="mt-3 text-[11px] text-ash-500">{v.caption}</figcaption>}
        </figure>
      );
    case "table":
      return (
        <div className="overflow-hidden rounded-2xl ring-1 ring-ash-800">
          {v.head && (
            <div className="flex justify-between gap-3 bg-ash-900 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-ash-500">
              <span>{v.head[0]}</span>
              <span className="text-right">{v.head[1]}</span>
            </div>
          )}
          <ul className="divide-y divide-ash-800 bg-ash-950/50">
            {v.rows.map((r, i) => (
              <li key={i} className={`flex items-center gap-3 px-3.5 py-2.5 text-sm ${r.hot ? "bg-ember-500/[0.07]" : ""}`}>
                <span className="min-w-0 flex-1">
                  <span className={`block font-semibold ${r.hot ? "text-ember-200" : "text-bone"}`}>{r.left}</span>
                  {r.cards && (
                    <span className="mt-1 flex gap-0.5">
                      {r.cards.map((c, j) => (
                        <MiniCard key={j} card={c} />
                      ))}
                    </span>
                  )}
                </span>
                <span className="max-w-[55%] text-right text-xs text-ash-300 sm:text-sm">{r.right}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "range":
      return <RangeGrid pos={v.pos} highlight={v.highlight} />;
    case "formula":
      return (
        <div className="rounded-2xl bg-gradient-to-br from-ember-500/12 to-ember-900/10 px-4 py-5 text-center ring-1 ring-ember-500/30">
          <p className="font-display text-base font-bold leading-snug text-ember-200 sm:text-lg">{v.text}</p>
          {v.note && <p className="mt-1.5 text-xs text-ash-400">{v.note}</p>}
        </div>
      );
  }
}

function CardsVisual({ v }: { v: Extract<Visual, { kind: "cards" }> }) {
  const normal = v.size === "normal";
  return (
    <div className={`felt flex flex-col items-center gap-3 rounded-[24px] px-3 py-4 ${normal ? "sm:py-5" : ""}`}>
      {v.rows.map((row, i) => (
        <div key={i} className="flex flex-col items-center">
          {row.label && <span className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-ash-500">{row.label}</span>}
          <div className={`flex ${normal ? "" : "flex-wrap justify-center gap-1.5"}`}>
            {row.cards.map((c, j) =>
              normal ? (
                <div key={j} className={j ? "-ml-10" : ""}>
                  <PlayingCardStatic card={c} />
                </div>
              ) : (
                <PlayingCardStatic key={j} card={c} small />
              ),
            )}
          </div>
          {row.note && <span className="tabular mt-1.5 text-[11px] font-semibold text-ember-300">{row.note}</span>}
        </div>
      ))}
    </div>
  );
}

function RangeGrid({ pos, highlight }: { pos: keyof typeof OPEN_RANGES; highlight?: string }) {
  const range = OPEN_RANGES[pos];
  return (
    <figure className="rounded-2xl bg-ash-950/60 p-2.5 ring-1 ring-ash-800 sm:p-3">
      <div className="grid grid-cols-13 gap-[2px]">
        {GRID.flat().map((code) => {
          const on = range.has(code);
          const pair = code.length === 2;
          return (
            <span
              key={code}
              title={code}
              className={`grid aspect-square place-items-center rounded-[3px] font-display text-[7px] font-bold leading-none sm:text-[9px] ${
                code === highlight
                  ? "bg-bone text-ash-950 ring-2 ring-ember-300"
                  : on
                    ? pair
                      ? "bg-ember-400 text-ash-950"
                      : "bg-ember-600/85 text-ember-200"
                    : "bg-ash-800/70 text-ash-600"
              }`}
            >
              {code.slice(0, 2)}
            </span>
          );
        })}
      </div>
      <figcaption className="mt-2.5 flex items-center justify-between text-[11px] text-ash-500">
        <span>
          {POSITION_NAME[pos]} ({pos}) opens
        </span>
        <span className="tabular font-bold text-ember-300">{Math.round(rangePercent(range))}% of hands</span>
      </figcaption>
    </figure>
  );
}
