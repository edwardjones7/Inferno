"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconChevron, IconX } from "@/components/icons";
import { preflopKey, RangeChart } from "@/components/range-chart";
import { ResponseChart, ResponseLegend, RESPONSE_STYLE } from "@/components/response-chart";
import {
  ACCURACY_STYLE,
  AccuracyLegend,
  buildChart,
  CHART_SECTIONS,
  chartCell,
  DEALERS,
  MOVE_STYLE,
  MoveLegend,
  playText,
  recordText,
  StrategyChart,
  type ColorBy,
} from "@/components/strategy-chart";
import { Segmented } from "@/components/ui";
import { accuracyState, ACCURACY_LABEL, blackjackRecords, combine, pokerRecords, type AccuracyState, type KeyRecord } from "@/lib/accuracy";
import { spotFromKey, spotLegal } from "@/lib/blackjack/drill";
import type { Rules } from "@/lib/blackjack/engine";
import { formatEV, moveEVs } from "@/lib/blackjack/ev";
import { MOVE_LABEL, type Move } from "@/lib/blackjack/strategy";
import { isTableId, TABLE_IDS, TABLES } from "@/lib/blackjack/tables";
import {
  actionOf,
  explainVs3bet,
  explainVsOpen,
  isPosition as isPos,
  isSeat,
  openerInPosition,
  SEAT_NAME,
  SEATS,
  seatIndex,
  vs3betChart,
  vsOpenChart,
  type ResponseChart as Chart,
  type Seat,
} from "@/lib/poker/preflop";
import { codeName, combosOf, OPEN_RANGES, POSITION_NAME, POSITIONS, rangePercent, GRID, type Position } from "@/lib/poker/ranges";
import { useProgress } from "@/lib/store";
import { useStored } from "@/lib/use-stored";

type Tab = "blackjack" | "poker";
const isTab = (v: unknown): v is Tab => v === "blackjack" || v === "poker";
const isColorBy = (v: unknown): v is ColorBy => v === "move" || v === "accuracy";
const isPosition = isPos;
type PokerView = "open" | "vsopen" | "vs3bet";
const isPokerView = (v: unknown): v is PokerView => v === "open" || v === "vsopen" || v === "vs3bet";

export function Charts() {
  const sp = useSearchParams();
  const router = useRouter();
  const t = sp.get("tab");
  const tab: Tab = isTab(t) ? t : "blackjack";
  const setTab = (next: Tab) => router.replace(`/train/charts/?tab=${next}`, { scroll: false });
  const [colorBy, setColorBy] = useStored("inferno:charts:color", "move", isColorBy);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 sm:w-72">
          <Segmented
            label="Chart"
            value={tab}
            onChange={setTab}
            options={[
              { id: "blackjack", label: "Blackjack" },
              { id: "poker", label: "Poker" },
            ]}
          />
        </div>
        <div className="flex min-w-0 items-center gap-2 sm:ml-auto">
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.18em] text-ash-500">Color by</span>
          <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
            <Segmented
              label="Color by"
              value={colorBy}
              onChange={setColorBy}
              options={[
                { id: "move", label: tab === "poker" ? "Range" : "Move" },
                { id: "accuracy", label: "My accuracy" },
              ]}
            />
          </div>
        </div>
      </div>
      {tab === "blackjack" ? <BlackjackCharts colorBy={colorBy} /> : <PokerCharts colorBy={colorBy} viewParam={sp.get("view")} />}
    </div>
  );
}

/* ------------------------------------------------------------------ blackjack */

function BlackjackCharts({ colorBy }: { colorBy: ColorBy }) {
  const [tableId, setTableId] = useStored("inferno:table", "classic", isTableId);
  const table = TABLES[tableId];
  const progress = useProgress();
  const records = useMemo(() => blackjackRecords(progress), [progress]);
  const chart = useMemo(() => buildChart(table.rules), [table]);
  const [selected, setSelected] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<AccuracyState, number> = { unseen: 0, solid: 0, shaky: 0, leak: 0 };
    for (const s of CHART_SECTIONS)
      for (const row of s.rows) for (const d of DEALERS) c[accuracyState(combine(records, row.values.map((v) => `${row.kind}-${v}-${d}`)))]++;
    return c;
  }, [records]);

  const cell = selected ? chartCell(selected) : null;
  const play = selected ? chart.get(selected) : undefined;
  const rec = cell ? combine(records, cell.recordKeys) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="panel min-w-0 rounded-[28px] p-3 sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            aria-label="Table rules"
            value={tableId}
            onChange={(e) => setTableId(e.target.value as typeof tableId)}
            className="h-10 w-full rounded-xl border border-ash-600/70 bg-ash-950 px-3 text-sm text-bone outline-none focus:border-ember-500 sm:w-auto"
          >
            {TABLE_IDS.map((id) => (
              <option key={id} value={id}>
                {TABLES[id].name} — {TABLES[id].short}
              </option>
            ))}
          </select>
          <p className="text-[11px] leading-snug text-ash-500 sm:ml-1">Dealer upcard across the top, your hand down the side.</p>
        </div>
        <StrategyChart rules={table.rules} records={records} colorBy={colorBy} selected={selected} onSelect={setSelected} />
        <div className="mt-4 border-t border-ash-800 pt-3">
          {colorBy === "accuracy" ? <AccuracyLegend /> : <MoveLegend />}
          <Counts counts={counts} />
        </div>
      </div>

      <DetailPanel open={!!selected} onClose={() => setSelected(null)} empty="Tap any cell to see the play, the reason behind it and your record.">
        {cell && play && rec && (
          <>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ash-500">{table.name}</p>
            <h2 className="mt-1 font-display text-xl font-black">{cell.label}</h2>
            <div className="mt-3 flex items-center gap-3">
              <span className={`grid h-12 min-w-12 place-items-center rounded-xl px-2 font-display text-lg font-black ${MOVE_STYLE[play.move]}`}>{play.code}</span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ash-500">Correct play</p>
                <p className="font-semibold text-bone">{playText(play)}</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ash-300">{play.why}</p>
            <EvBreakdown spotKey={cell.key} rules={table.rules} best={play.move} />
            <RecordBox rec={rec} />
            <Link
              href={`/train/blackjack/?spot=${cell.key}`}
              className="pressable mt-4 flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-ember-500 text-sm font-bold text-ash-950"
            >
              Drill this spot <IconChevron className="h-4 w-4" />
            </Link>
          </>
        )}
      </DetailPanel>
    </div>
  );
}

/** Expected value of every legal play on a representative hand for this cell. */
function EvBreakdown({ spotKey, rules, best }: { spotKey: string; rules: Rules; best: Move }) {
  const rows = useMemo(() => {
    const spot = spotFromKey(spotKey, () => 0);
    if (!spot) return [];
    const evs = moveEVs(spot.cards, spot.up, rules, spotLegal(spot.cards, spot.up, rules));
    return (Object.entries(evs) as [Move, number][]).sort((a, b) => b[1] - a[1]);
  }, [spotKey, rules]);
  if (!rows.length) return null;
  return (
    <div className="mt-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ash-500">Expected value per bet</p>
      <ul className="tabular mt-1.5 space-y-1">
        {rows.map(([m, ev]) => (
          <li key={m} className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${m === best ? "bg-ember-500/15 ring-1 ring-ember-500/40" : "bg-ash-950/50"}`}>
            <span className={m === best ? "font-bold text-ember-200" : "text-ash-300"}>{MOVE_LABEL[m]}</span>
            <span className={`font-bold ${ev >= 0 ? "text-emerald-300" : "text-ash-300"}`}>{formatEV(ev)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ poker */

/** Opening charts, plus the response charts for facing an open and facing a 3-bet. `?view=vsopen` picks one. */
function PokerCharts({ colorBy, viewParam }: { colorBy: ColorBy; viewParam: string | null }) {
  const [stored, setStored] = useStored<PokerView>("inferno:charts:pview", "open", isPokerView);
  const router = useRouter();
  const view: PokerView = isPokerView(viewParam) ? viewParam : stored;
  const setView = (v: PokerView) => {
    setStored(v);
    if (viewParam) router.replace(`/train/charts/?tab=poker&view=${v}`, { scroll: false });
  };
  return (
    <div>
      <div className="mb-3">
        <Segmented
          label="Spot"
          value={view}
          onChange={setView}
          options={[
            { id: "open", label: "Opening" },
            { id: "vsopen", label: "Facing an open" },
            { id: "vs3bet", label: "Facing a 3-bet" },
          ]}
        />
      </div>
      {view === "open" ? <OpeningCharts colorBy={colorBy} /> : view === "vsopen" ? <VsOpenCharts colorBy={colorBy} /> : <Vs3betCharts colorBy={colorBy} />}
    </div>
  );
}

function OpeningCharts({ colorBy }: { colorBy: ColorBy }) {
  const [pos, setPos] = useStored<Position>("inferno:charts:pos", "BTN", isPosition);
  const progress = useProgress();
  const records = useMemo(() => pokerRecords(progress), [progress]);
  const [selected, setSelected] = useState<string | null>(null);
  const range = OPEN_RANGES[pos];

  const counts = useMemo(() => {
    const c: Record<AccuracyState, number> = { unseen: 0, solid: 0, shaky: 0, leak: 0 };
    for (const code of GRID.flat()) c[accuracyState(records.get(preflopKey(pos, code)))]++;
    return c;
  }, [records, pos]);

  const rec = selected ? (records.get(preflopKey(pos, selected)) ?? { seen: 0, missed: 0 }) : null;
  const everywhere = selected ? combine(records, POSITIONS.map((p) => preflopKey(p, selected))) : null;
  const openers = selected ? POSITIONS.filter((p) => OPEN_RANGES[p].has(selected)) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="panel min-w-0 rounded-[28px] p-3 sm:p-5">
        <Segmented label="Position" value={pos} onChange={setPos} options={POSITIONS.map((p) => ({ id: p, label: p }))} />
        <div className="mb-3 mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-semibold text-bone">
            {POSITION_NAME[pos]} <span className="text-ash-500">· raise first in</span>
          </p>
          <p className="tabular text-xs text-ash-400">
            Opens <span className="font-bold text-ember-300">{rangePercent(range).toFixed(1)}%</span> of hands
          </p>
        </div>
        <RangeChart pos={pos} records={records} colorBy={colorBy} selected={selected} onSelect={setSelected} />
        <p className="mt-2 text-[11px] text-ash-500">Suited hands above the diagonal, offsuit below, pairs on it.</p>
        <div className="mt-3 border-t border-ash-800 pt-3">
          {colorBy === "accuracy" ? (
            <AccuracyLegend />
          ) : (
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] font-semibold text-ash-400">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-3 rounded bg-ember-500" /> Raise
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-3 rounded bg-ash-800 ring-1 ring-ash-700" /> Fold
              </span>
              <span className="text-ash-500">Dot: your record on that hand</span>
            </div>
          )}
          <Counts counts={counts} />
        </div>
      </div>

      <DetailPanel open={!!selected} onClose={() => setSelected(null)} empty="Tap any hand to see where it opens and how you've played it.">
        {selected && rec && everywhere && (
          <>
            <p className="tabular text-[10px] font-bold uppercase tracking-[0.2em] text-ash-500">
              {selected} · {combosOf(selected)} combos
            </p>
            <h2 className="mt-1 font-display text-xl font-black capitalize">{codeName(selected)}</h2>
            <div className="mt-3 flex items-center gap-3">
              <span
                className={`grid h-12 min-w-12 place-items-center rounded-xl px-3 font-display text-sm font-black ${
                  range.has(selected) ? "bg-ember-500 text-ash-950" : "bg-ash-800 text-ash-300 ring-1 ring-ash-700"
                }`}
              >
                {range.has(selected) ? "Raise" : "Fold"}
              </span>
              <p className="min-w-0 text-sm text-ash-300">
                {range.has(selected) ? "Open-raise" : "Fold"} when it&apos;s folded to you in the {POSITION_NAME[pos].toLowerCase()}.
              </p>
            </div>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-ash-500">Opens from</p>
            <div className="mt-1.5 flex gap-1.5">
              {POSITIONS.map((p) => (
                <span
                  key={p}
                  className={`flex-1 rounded-lg py-1.5 text-center text-[11px] font-bold ring-1 ${
                    openers.includes(p) ? "bg-ember-500/15 text-ember-200 ring-ember-500/50" : "bg-ash-900 text-ash-600 ring-ash-800"
                  } ${p === pos ? "outline outline-1 outline-offset-1 outline-bone/60" : ""}`}
                >
                  {p}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-ash-400">
              {openers.length === 0
                ? "Never an open from any seat: fold it."
                : openers.length === POSITIONS.length
                  ? "Strong enough to open from every seat."
                  : `Opens from the ${openers[0]} and later.`}
            </p>
            <RecordBox rec={rec} extra={everywhere.seen > rec.seen ? `All positions: ${recordText(everywhere)}` : undefined} />
            <Link
              href={`/train/poker/?drill=preflop&pos=${pos}`}
              className="pressable mt-4 flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-ember-500 text-sm font-bold text-ash-950"
            >
              Drill this position <IconChevron className="h-4 w-4" />
            </Link>
          </>
        )}
      </DetailPanel>
    </div>
  );
}

/* ------------------------------------------------------------------ poker: facing raises */

const HEROES_VS_OPEN: Seat[] = ["HJ", "CO", "BTN", "SB", "BB"];
const isHeroVsOpen = (v: unknown): v is Seat => isSeat(v) && v !== "UTG";

function VsOpenCharts({ colorBy }: { colorBy: ColorBy }) {
  const [hero, setHero] = useStored<Seat>("inferno:charts:vo-hero", "BB", isHeroVsOpen);
  const [openerPick, setOpener] = useStored<Position>("inferno:charts:vo-opener", "BTN", isPosition);
  const openers = POSITIONS.filter((p) => seatIndex(p) < seatIndex(hero));
  const opener = openers.includes(openerPick) ? openerPick : openers[openers.length - 1];
  const chart = vsOpenChart(hero, opener)!;
  const keyFor = useCallback((code: string) => `vo-${hero}-${opener}-${code}`, [hero, opener]);
  return (
    <ResponseView
      colorBy={colorBy}
      chart={chart}
      raiseLabel="3-bet"
      title={`${SEAT_NAME[hero]} vs ${POSITION_NAME[opener].toLowerCase()} open`}
      keyFor={keyFor}
      explain={(code) => explainVsOpen(hero, opener, code).why}
      drillHref={`/train/poker/?drill=vsopen&pos=${hero}&vs=${opener}`}
      pickers={
        <>
          <Picker label="You" value={hero} options={HEROES_VS_OPEN} onChange={setHero} />
          <Picker label="Opener" value={opener} options={openers} onChange={setOpener} />
        </>
      }
    />
  );
}

function Vs3betCharts({ colorBy }: { colorBy: ColorBy }) {
  const [hero, setHero] = useStored<Position>("inferno:charts:v3-hero", "CO", isPosition);
  const [villainPick, setVillain] = useStored<Seat>("inferno:charts:v3-villain", "BTN", isSeat);
  const villains = SEATS.filter((v) => seatIndex(v) > seatIndex(hero));
  const villain = villains.includes(villainPick) ? villainPick : villains[0];
  const chart = vs3betChart(hero, villain)!;
  const keyFor = useCallback((code: string) => `v3-${hero}-${villain}-${code}`, [hero, villain]);
  const ip = openerInPosition(hero, villain);
  return (
    <ResponseView
      colorBy={colorBy}
      chart={chart}
      raiseLabel="4-bet"
      title={`${POSITION_NAME[hero]} open vs ${SEAT_NAME[villain].toLowerCase()} 3-bet · ${ip ? "in position" : "out of position"}`}
      keyFor={keyFor}
      explain={(code) => explainVs3bet(hero, villain, code).why}
      drillHref={`/train/poker/?drill=vs3bet&pos=${hero}&vs=${villain}`}
      onlyIn={OPEN_RANGES[hero]}
      pickers={
        <>
          <Picker label="You opened" value={hero} options={POSITIONS} onChange={setHero} />
          <Picker label="3-bettor" value={villain} options={villains} onChange={setVillain} />
        </>
      }
    />
  );
}

function Picker<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="w-20 shrink-0 text-[11px] font-bold uppercase tracking-[0.16em] text-ash-500">{label}</span>
      <div className="min-w-0 flex-1">
        <Segmented label={label} value={value} onChange={onChange} options={options.map((o) => ({ id: o, label: o }))} />
      </div>
    </div>
  );
}

function ResponseView({
  colorBy,
  chart,
  raiseLabel,
  title,
  keyFor,
  explain,
  drillHref,
  pickers,
  onlyIn,
}: {
  colorBy: ColorBy;
  chart: Chart;
  raiseLabel: string;
  title: string;
  keyFor: (code: string) => string;
  explain: (code: string) => string;
  drillHref: string;
  pickers: React.ReactNode;
  /** hands outside this set never reach the spot (facing a 3-bet you only hold hands you opened) */
  onlyIn?: Set<string>;
}) {
  const progress = useProgress();
  const records = useMemo(() => pokerRecords(progress), [progress]);
  const [selected, setSelected] = useState<string | null>(null);
  const counts = useMemo(() => {
    const c: Record<AccuracyState, number> = { unseen: 0, solid: 0, shaky: 0, leak: 0 };
    for (const code of GRID.flat()) c[accuracyState(records.get(keyFor(code)))]++;
    return c;
  }, [records, keyFor]);
  const act = selected ? actionOf(chart, selected) : null;
  const rec = selected ? (records.get(keyFor(selected)) ?? { seen: 0, missed: 0 }) : null;
  const word = (a: string) => (a === "raise" ? raiseLabel : a.charAt(0).toUpperCase() + a.slice(1));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="panel min-w-0 rounded-[28px] p-3 sm:p-5">
        <div className="space-y-2">{pickers}</div>
        <div className="mb-3 mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-semibold text-bone">{title}</p>
          <p className="tabular text-xs text-ash-400">
            {raiseLabel} <span className="font-bold text-ember-300">{rangePercent(chart.raise).toFixed(1)}%</span> · call{" "}
            <span className="font-bold text-sky-300">{rangePercent(chart.call).toFixed(1)}%</span>
          </p>
        </div>
        <ResponseChart chart={chart} raiseLabel={raiseLabel} label={title} keyFor={keyFor} records={records} colorBy={colorBy} selected={selected} onSelect={setSelected} />
        <p className="mt-2 text-[11px] leading-relaxed text-ash-500">{chart.spec.note}</p>
        <div className="mt-3 border-t border-ash-800 pt-3">
          {colorBy === "accuracy" ? <AccuracyLegend /> : <ResponseLegend raiseLabel={raiseLabel} />}
          <Counts counts={counts} />
          <p className="mt-1 text-[11px] text-ash-500">6-max, 100bb, opens 2.5bb (small blind 3bb). Simplified from solver-style charts: each hand shows its main play.</p>
        </div>
      </div>

      <DetailPanel open={!!selected} onClose={() => setSelected(null)} empty="Tap any hand to see the play, why, and how you've done on it.">
        {selected && act && rec && (
          <>
            <p className="tabular text-[10px] font-bold uppercase tracking-[0.2em] text-ash-500">
              {selected} · {combosOf(selected)} combos
            </p>
            <h2 className="mt-1 font-display text-xl font-black capitalize">{codeName(selected)}</h2>
            <div className="mt-3 flex items-center gap-3">
              <span className={`grid h-12 min-w-12 place-items-center rounded-xl px-3 font-display text-sm font-black ${RESPONSE_STYLE[act]} ${act === "fold" ? "ring-1 ring-ash-700" : ""}`}>
                {word(act)}
              </span>
              {chart.mixed.has(selected) && <span className="rounded-full bg-ash-800 px-2.5 py-1 text-[11px] font-bold text-ash-300">Mixed spot</span>}
            </div>
            {onlyIn && !onlyIn.has(selected) ? (
              <p className="mt-3 text-sm leading-relaxed text-ash-300">You wouldn&apos;t open {selected} from this seat, so you never face a 3-bet with it.</p>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-ash-300">{explain(selected)}</p>
            )}
            <RecordBox rec={rec} />
            <Link href={drillHref} className="pressable mt-4 flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-ember-500 text-sm font-bold text-ash-950">
              Drill this spot <IconChevron className="h-4 w-4" />
            </Link>
          </>
        )}
      </DetailPanel>
    </div>
  );
}

/* ------------------------------------------------------------------ shared */

function Counts({ counts }: { counts: Record<AccuracyState, number> }) {
  const seen = counts.solid + counts.shaky + counts.leak;
  return (
    <p className="tabular mt-2 text-[11px] text-ash-500">
      {seen === 0
        ? "You haven't answered any of these spots yet. Drill or play with the coach on to fill the chart in."
        : `${seen} spots seen · ${counts.solid} solid · ${counts.shaky} shaky · ${counts.leak} leaks`}
    </p>
  );
}

function RecordBox({ rec, extra }: { rec: KeyRecord; extra?: string }) {
  const state = accuracyState(rec);
  return (
    <div className="mt-4 rounded-2xl bg-ash-950/60 p-3 ring-1 ring-ash-800">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ash-500">Your record</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ACCURACY_STYLE[state]}`}>{ACCURACY_LABEL[state]}</span>
      </div>
      <div className="tabular mt-2 flex gap-5">
        <div>
          <p className="font-display text-2xl font-black">{rec.seen}</p>
          <p className="text-[11px] text-ash-500">seen</p>
        </div>
        <div>
          <p className={`font-display text-2xl font-black ${rec.missed ? "text-ember-400" : ""}`}>{rec.missed}</p>
          <p className="text-[11px] text-ash-500">missed</p>
        </div>
        {rec.seen > 0 && (
          <div>
            <p className="font-display text-2xl font-black">{Math.round(((rec.seen - rec.missed) / rec.seen) * 100)}%</p>
            <p className="text-[11px] text-ash-500">right</p>
          </div>
        )}
      </div>
      {extra && <p className="tabular mt-2 text-[11px] text-ash-500">{extra}</p>}
    </div>
  );
}

/** Side panel on desktop, bottom sheet on phones (only while something is selected). */
function DetailPanel({ open, onClose, empty, children }: { open: boolean; onClose: () => void; empty: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {open && <div aria-hidden onClick={onClose} className="fixed inset-0 z-50 bg-ash-950/60 backdrop-blur-[2px] lg:hidden" />}
      <aside
        aria-label="Spot details"
        aria-live="polite"
        className={`${open ? "fixed" : "hidden"} inset-x-0 bottom-0 z-50 max-h-[78vh] overflow-y-auto rounded-t-[28px] border-t border-ash-700 bg-ash-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-24px_60px_-20px_rgba(0,0,0,0.9)] animate-rise lg:sticky lg:top-6 lg:z-auto lg:block lg:max-h-none lg:self-start lg:overflow-visible lg:rounded-[28px] lg:border-t-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:animate-none`}
      >
        <div className="lg:panel lg:rounded-[28px] lg:p-5">
          {open ? (
            <div className="relative">
              <div aria-hidden className="mx-auto -mt-2 mb-3 h-1 w-10 rounded-full bg-ash-700 lg:hidden" />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close details"
                className="absolute -right-1 -top-1 grid h-9 w-9 place-items-center rounded-full text-ash-400 hover:bg-ash-800 hover:text-bone"
              >
                <IconX className="h-4 w-4" />
              </button>
              {children}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-ash-400">{empty}</p>
          )}
        </div>
      </aside>
    </>
  );
}
