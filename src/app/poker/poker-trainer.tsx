"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { pokerStatsAction, recordPokerAction } from "@/app/actions";
import { PlayingCardStatic } from "@/components/playing-card-static";
import { cardLabel, type Card } from "@/lib/blackjack/cards";
import { EQUITY_BUCKETS, genPoker, gradePoker, POKER_DRILLS, type PokerDrill, type PokerGrade, type PokerSpot } from "@/lib/poker/drills";
import { outs } from "@/lib/poker/equity";
import { describe } from "@/lib/poker/eval";
import { BEHIND, GRID, handCode, OPEN_RANGES, POSITION_NAME, POSITIONS, rangePercent, type Position } from "@/lib/poker/ranges";
import { play } from "@/lib/sound";
import type { PokerStats } from "@/server/casino";

interface Choice {
  id: string;
  label: string;
  key: string;
}

const CHOICES: Record<PokerDrill, Choice[]> = {
  preflop: [
    { id: "raise", label: "Raise", key: "R" },
    { id: "fold", label: "Fold", key: "F" },
  ],
  potodds: [
    { id: "call", label: "Call", key: "C" },
    { id: "fold", label: "Fold", key: "F" },
  ],
  showdown: [
    { id: "0", label: "Hand A", key: "1" },
    { id: "1", label: "Hand B", key: "2" },
    { id: "2", label: "Hand C", key: "3" },
    { id: "split", label: "Split pot", key: "S" },
  ],
  equity: EQUITY_BUCKETS.map((b, i) => ({ id: b.id, label: b.label, key: String(i + 1) })),
};

const FLUSH_EVERY = 8;

export function PokerTrainer() {
  const [drill, setDrill] = useState<PokerDrill>("preflop");
  const [spot, setSpot] = useState<(PokerSpot & { n: number }) | null>(null);
  const [grade, setGrade] = useState<(PokerGrade & { answer: string }) | null>(null);
  const [session, setSession] = useState({ n: 0, correct: 0, streak: 0, best: 0 });
  const [stats, setStats] = useState<PokerStats | null>(null);
  const [chartPos, setChartPos] = useState<Position>("BTN");
  const pending = useRef<{ spot: PokerSpot; answer: string }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const refresh = useCallback(() => void pokerStatsAction().then((r) => r.ok && setStats(r.data)), []);
  const flush = useCallback(
    (thenRefresh: boolean) => {
      const batch = pending.current.splice(0);
      if (!batch.length) return;
      void recordPokerAction(batch).then((r) => {
        if (!r.ok) toast.error(r.error);
        else if (thenRefresh) refresh();
      });
    },
    [refresh],
  );

  const deal = useCallback((kind: PokerDrill) => {
    clearTimeout(timer.current);
    const s = genPoker(kind, Math.random);
    setSpot((prev) => ({ ...s, n: (prev?.n ?? 0) + 1 }));
    setGrade(null);
    if (s.kind === "preflop") setChartPos(s.pos);
  }, []);

  useEffect(() => {
    queueMicrotask(() => deal("preflop"));
    refresh();
    const onHide = () => document.visibilityState === "hidden" && flush(false);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      clearTimeout(timer.current);
      flush(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  }, []);

  const answer = useCallback(
    (id: string) => {
      if (!spot || grade) return;
      const g = gradePoker(spot, id);
      setGrade({ ...g, answer: id });
      setSession((s) => {
        const streak = g.ok ? s.streak + 1 : 0;
        return { n: s.n + 1, correct: s.correct + (g.ok ? 1 : 0), streak, best: Math.max(s.best, streak) };
      });
      play(g.ok ? "chip" : "lose");
      const { n, ...plain } = spot;
      void n;
      pending.current.push({ spot: plain as PokerSpot, answer: id });
      if (pending.current.length >= FLUSH_EVERY) flush(true);
      if (g.ok && drill !== "potodds" && drill !== "showdown") timer.current = setTimeout(() => deal(drill), 900);
    },
    [spot, grade, drill, flush, deal],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if ((k === "enter" || k === " ") && grade) {
        e.preventDefault();
        deal(drill);
        return;
      }
      const c = CHOICES[drill].find((x) => x.key.toLowerCase() === k);
      if (c) {
        e.preventDefault();
        answer(c.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, grade, deal, drill]);

  const pickDrill = (d: PokerDrill) => {
    setDrill(d);
    deal(d);
  };

  const acc = session.n ? Math.round((session.correct / session.n) * 100) : 0;
  const drillStats = useMemo(() => Object.fromEntries((stats?.byDrill ?? []).map((d) => [d.drill, d])), [stats]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        {/* drill tabs */}
        <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="tablist" aria-label="Drill">
          {POKER_DRILLS.map((d) => (
            <button
              key={d.id}
              role="tab"
              aria-selected={drill === d.id}
              onClick={() => pickDrill(d.id)}
              className={`rounded-xl px-3 py-2 text-left transition-colors ${drill === d.id ? "bg-ember-500 text-ash-950" : "panel text-ash-200 hover:text-bone"}`}
            >
              <span className="block text-sm font-bold">{d.label}</span>
              <span className={`hidden text-[11px] leading-tight sm:block ${drill === d.id ? "text-ash-950/70" : "text-ash-500"}`}>{d.blurb}</span>
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <Pill label="Answered" value={String(session.n)} />
          <Pill label="Accuracy" value={session.n ? `${acc}%` : "–"} hot={session.n >= 5 && acc >= 90} />
          <Pill label="Streak" value={`${session.streak >= 5 ? "🔥 " : ""}${session.streak}`} hot={session.streak >= 10} />
          <Pill label="Best" value={String(session.best)} />
        </div>

        {/* felt */}
        <div className="felt relative min-h-[340px] overflow-hidden rounded-[28px] px-4 py-6 sm:rounded-[40px] sm:px-8">
          <AnimatePresence mode="wait">
            {spot && (
              <motion.div
                key={spot.n}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <SpotView spot={spot} grade={grade} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* answers */}
        <div className="panel mt-4 rounded-3xl p-4 sm:p-5">
          {spot && <Prompt spot={spot} />}
          <div className={`mt-3 grid gap-2 ${CHOICES[drill].length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
            {CHOICES[drill].map((c) => {
              const isCorrect = grade && grade.correct === c.id;
              const isWrong = grade && !grade.ok && grade.answer === c.id;
              return (
                <button
                  key={c.id}
                  disabled={!!grade}
                  onClick={() => answer(c.id)}
                  className={`flex h-14 items-center justify-center gap-1.5 rounded-xl font-bold transition-all ${
                    isCorrect ? "bg-emerald-500 text-ash-950 ring-2 ring-emerald-300" : isWrong ? "bg-ember-700 text-bone ring-2 ring-ember-400" : "btn-fire"
                  } ${grade && !isCorrect && !isWrong ? "opacity-40" : ""}`}
                >
                  {c.label}
                  <kbd className="hidden rounded bg-ash-950/25 px-1.5 py-0.5 font-mono text-[10px] sm:inline">{c.key}</kbd>
                </button>
              );
            })}
          </div>
          <div className="mt-3 min-h-[56px]" aria-live="polite">
            {grade ? (
              <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
                <p className={`flex-1 text-sm ${grade.ok ? "text-emerald-200" : "text-ember-100"}`}>
                  <span className="font-bold">{grade.ok ? "✓ Correct. " : "✗ Not quite. "}</span>
                  <span className="text-ash-300">{grade.why}</span>
                </p>
                <button onClick={() => deal(drill)} className="btn-fire h-10 shrink-0 rounded-xl px-5 text-sm font-bold">
                  Next <kbd className="ml-1 rounded bg-ash-950/20 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
                </button>
              </div>
            ) : (
              <p className="text-center text-xs text-ash-500">Keyboard: {CHOICES[drill].map((c) => c.key).join(" · ")}</p>
            )}
          </div>
        </div>
      </div>

      {/* sidebar */}
      <aside className="flex min-w-0 flex-col gap-4">
        <div className="panel rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold">Opening chart</h2>
            <span className="tabular text-xs text-ash-400">{Math.round(rangePercent(OPEN_RANGES[chartPos]))}% of hands</span>
          </div>
          <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Position">
            {POSITIONS.map((p) => (
              <button
                key={p}
                role="radio"
                aria-checked={chartPos === p}
                onClick={() => setChartPos(p)}
                className={`flex-1 rounded-lg py-1.5 text-[11px] font-bold ${chartPos === p ? "bg-ember-500 text-ash-950" : "bg-ash-800 text-ash-300 hover:text-bone"}`}
              >
                {p}
              </button>
            ))}
          </div>
          <RangeGrid pos={chartPos} highlight={spot?.kind === "preflop" && grade ? handCode(spot.cards[0], spot.cards[1]) : null} />
          <p className="mt-2 text-[11px] leading-relaxed text-ash-500">
            Simplified 100bb 6-max raise-first-in ranges. {POSITION_NAME[chartPos]}: {BEHIND[chartPos]} player{BEHIND[chartPos] > 1 ? "s" : ""} left to act.
          </p>
        </div>

        <div className="panel rounded-3xl p-5">
          <h2 className="font-display text-sm font-bold">Your accuracy</h2>
          <ul className="mt-3 space-y-2.5">
            {POKER_DRILLS.map((d) => {
              const s = drillStats[d.id];
              const a = s && s.seen ? Math.round((s.correct / s.seen) * 100) : null;
              return (
                <li key={d.id}>
                  <div className="flex justify-between text-xs">
                    <span className="text-ash-300">{d.label}</span>
                    <span className="tabular text-ash-400">{a === null ? "–" : `${a}% · ${s!.seen}`}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ash-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-ember-600 to-ember-300" style={{ width: `${a ?? 0}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          {stats && stats.bestStreak > 0 && <p className="mt-3 text-[11px] text-ash-500">Best streak ever: {stats.bestStreak}</p>}
        </div>

        <div className="panel rounded-3xl p-5">
          <h2 className="font-display text-sm font-bold">Your leaks</h2>
          {stats && stats.leaks.length ? (
            <ul className="mt-3 space-y-1">
              {stats.leaks.map((l) => (
                <li key={l.key} className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 text-xs">
                  <span className="min-w-0 truncate text-ash-200">{l.label}</span>
                  <span className="tabular shrink-0 text-ember-300">
                    {l.misses}/{l.seen}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-ash-400">Answer a few spots and your weak areas show up here.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ spot views */

function Prompt({ spot }: { spot: PokerSpot }) {
  const text =
    spot.kind === "preflop"
      ? `Folded to you in the ${POSITION_NAME[spot.pos].toLowerCase()} (${spot.pos}). Raise or fold?`
      : spot.kind === "potodds"
        ? `Pot is $${spot.pot}. Villain shoves $${spot.bet}. Call $${spot.bet} to win $${spot.pot + spot.bet}?`
        : spot.kind === "showdown"
          ? "All-in, cards on their backs. Who wins the pot?"
          : "All-in pre-flop. How often does your hand win (counting ties as half)?";
  return <p className="text-center text-sm font-semibold text-bone">{text}</p>;
}

function Cards({ cards, dim = false, label }: { cards: readonly Card[]; dim?: boolean; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {label && <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-ash-400">{label}</span>}
      <div className={`flex gap-1 sm:gap-1.5 ${dim ? "opacity-45 grayscale" : ""}`}>
        {cards.map((c) => (
          <PlayingCardStatic key={c} card={c} small />
        ))}
      </div>
    </div>
  );
}

function SpotView({ spot, grade }: { spot: PokerSpot; grade: PokerGrade | null }) {
  if (spot.kind === "preflop") {
    return (
      <div className="flex flex-col items-center gap-5">
        <Seats pos={spot.pos} />
        <Cards cards={spot.cards} label="Your hand" />
        {grade && <span className="rounded-full bg-ash-950/80 px-3 py-1 text-xs font-bold text-ember-200 ring-1 ring-ash-700">{String(grade.detail?.code)}</span>}
      </div>
    );
  }
  if (spot.kind === "potodds") {
    const o = grade ? outs(spot.hero, spot.villain, spot.board) : [];
    const heroNow = describe([...spot.hero, ...spot.board]).name;
    const villNow = describe([...spot.villain, ...spot.board]).name;
    return (
      <div className="flex flex-col items-center gap-4">
        <Cards cards={spot.villain} label={`Villain · ${villNow}`} />
        <div className="flex flex-col items-center gap-1.5">
          <Cards cards={spot.board} />
          <span className="tabular rounded-full bg-ash-950/80 px-3 py-1 text-xs font-bold text-ember-200 ring-1 ring-ember-500/40">
            Pot ${spot.pot} · shove ${spot.bet}
          </span>
        </div>
        <Cards cards={spot.hero} label={`You · ${heroNow}`} />
        {grade && (
          <div className="w-full max-w-md space-y-2">
            <Bar label="Your equity" value={Number(grade.detail?.equity)} tone="ember" />
            <Bar label="Equity needed" value={Number(grade.detail?.need)} tone="ash" />
            {o.length > 0 && (
              <p className="text-center text-[11px] text-ash-400">
                Outs ({o.length}): <span className="tabular text-ash-200">{o.map((c) => cardLabel(c)).join("  ")}</span>
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
  if (spot.kind === "showdown") {
    const names = ["A", "B", "C"];
    const d = spot.hands.map((h) => describe([...h, ...spot.board]));
    const best = Math.max(...d.map((x) => x.score));
    return (
      <div className="flex flex-col items-center gap-5">
        <Cards cards={spot.board} label="Board" />
        <div className="grid w-full grid-cols-3 gap-2 sm:gap-6">
          {spot.hands.map((h, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <Cards cards={h} label={`Hand ${names[i]}`} dim={!!grade && d[i].score !== best} />
              {grade && (
                <span className={`text-center text-[11px] font-semibold ${d[i].score === best ? "text-emerald-300" : "text-ash-500"}`}>{d[i].name}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-5">
      <Cards cards={spot.villain} label="Villain" />
      <span className="font-display text-xs font-bold uppercase tracking-[0.3em] text-ember-400/80">vs</span>
      <Cards cards={spot.hero} label="You" />
      {grade && (
        <div className="w-full max-w-md">
          <Bar label="Your equity" value={Number(grade.detail?.equity)} tone="ember" />
        </div>
      )}
    </div>
  );
}

function Bar({ label, value, tone }: { label: string; value: number; tone: "ember" | "ash" }) {
  return (
    <div>
      <div className="flex justify-between text-[11px]">
        <span className="text-ash-400">{label}</span>
        <span className="tabular font-bold text-bone">{value.toFixed(1)}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-ash-950/80">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, value)}%` }}
          className={`h-full rounded-full ${tone === "ember" ? "bg-gradient-to-r from-ember-600 to-ember-300" : "bg-ash-400"}`}
        />
      </div>
    </div>
  );
}

/** Six seats around a mini table; earlier seats shown folded. */
function Seats({ pos }: { pos: Position }) {
  const order: (Position | "BB")[] = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
  const me = order.indexOf(pos);
  return (
    <div className="relative h-24 w-64 sm:w-80">
      <div className="absolute inset-x-6 inset-y-3 rounded-[999px] border border-ember-500/30 bg-ember-900/20" />
      {order.map((p, i) => {
        const angle = Math.PI * (0.85 + (i / 5) * 1.3);
        const x = 50 + Math.cos(angle) * 46;
        const y = 50 + Math.sin(angle) * 42;
        const state = i < me ? "folded" : i === me ? "you" : "waiting";
        return (
          <span
            key={p}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              state === "you"
                ? "bg-ember-500 text-ash-950 shadow-[0_0_14px_rgba(255,90,31,0.8)]"
                : state === "folded"
                  ? "bg-ash-900 text-ash-600 line-through"
                  : "bg-ash-800 text-ash-200 ring-1 ring-ash-600"
            }`}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            {state === "you" ? `You · ${p}` : p}
          </span>
        );
      })}
    </div>
  );
}

function RangeGrid({ pos, highlight }: { pos: Position; highlight: string | null }) {
  const range = OPEN_RANGES[pos];
  return (
    <div className="mt-3 grid grid-cols-13 gap-px overflow-hidden rounded-lg bg-ash-950 p-px" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
      {GRID.flat().map((code) => {
        const on = range.has(code);
        const hit = code === highlight;
        return (
          <span
            key={code}
            title={code}
            className={`grid aspect-square place-items-center text-[7px] font-bold leading-none sm:text-[8px] ${
              hit ? "bg-bone text-ash-950 ring-2 ring-ember-300" : on ? (code.length === 2 ? "bg-ember-500 text-ash-950" : "bg-ember-600/85 text-ash-950") : "bg-ash-800 text-ash-500"
            }`}
          >
            {code.replace(/[so]$/, "")}
          </span>
        );
      })}
    </div>
  );
}

function Pill({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <span className={`tabular flex items-center gap-1.5 rounded-full px-3 py-1.5 ring-1 ${hot ? "bg-ember-500/15 ring-ember-500/50" : "bg-ash-900 ring-ash-700"}`}>
      <span className="text-ash-500">{label}</span>
      <span className={`font-bold ${hot ? "text-ember-200" : "text-bone"}`}>{value}</span>
    </span>
  );
}
