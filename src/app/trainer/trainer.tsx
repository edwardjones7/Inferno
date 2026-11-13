"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { recordDrillAction, trainingAction } from "@/app/actions";
import { PlayingCardStatic } from "@/components/playing-card-static";
import { gradeSpot, type Decision } from "@/lib/blackjack/coach";
import { DRILL_CATEGORIES, generateSpot, spotFromKey, spotLegal, type DrillCategory, type DrillSpot } from "@/lib/blackjack/drill";
import type { ActionType } from "@/lib/blackjack/engine";
import { MOVE_LABEL, spotLabel, spotOf, type Move } from "@/lib/blackjack/strategy";
import { isTableId, TABLE_IDS, TABLES } from "@/lib/blackjack/tables";
import { play } from "@/lib/sound";
import { useStored } from "@/lib/use-stored";
import type { TrainingStats } from "@/server/casino";

const MOVES: { move: Move; key: string }[] = [
  { move: "hit", key: "H" },
  { move: "stand", key: "S" },
  { move: "double", key: "D" },
  { move: "split", key: "P" },
  { move: "surrender", key: "R" },
];
const KEYMAP: Record<string, Move> = { h: "hit", s: "stand", d: "double", p: "split", r: "surrender" };
const FLUSH_EVERY = 10;

interface Answered {
  decision: Decision;
}

export function Trainer({ focus }: { focus: string | null }) {
  const [tableId, setTableId] = useStored("inferno:table", "classic", isTableId);
  const table = TABLES[tableId];
  const [category, setCategory] = useState<DrillCategory>("all");
  const [spot, setSpot] = useState<(DrillSpot & { n: number }) | null>(null);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [session, setSession] = useState({ n: 0, correct: 0, streak: 0, best: 0 });
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const pending = useRef<{ cards: string[]; up: string; action: string }[]>([]);
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const leakKeys = useMemo(() => (stats?.leaks ?? []).filter((l) => l.spot !== "insurance").map((l) => l.spot), [stats]);

  const refreshStats = useCallback(() => {
    void trainingAction().then((r) => r.ok && setStats(r.data));
  }, []);

  const flush = useCallback(
    (thenRefresh: boolean) => {
      const batch = pending.current.splice(0);
      if (!batch.length) return;
      void recordDrillAction(tableId, batch).then((r) => {
        if (!r.ok) toast.error(r.error);
        else if (thenRefresh) refreshStats();
      });
    },
    [tableId, refreshStats],
  );

  const next = useCallback(() => {
    clearTimeout(advanceTimer.current);
    const s = focus ? spotFromKey(focus, Math.random) : null;
    setSpot((prev) => ({ ...(s ?? generateSpot(category, Math.random, leakKeys)), n: (prev?.n ?? 0) + 1 }));
    setAnswered(null);
  }, [category, focus, leakKeys]);

  // first spot + stats on mount; save anything unsent when leaving
  useEffect(() => {
    queueMicrotask(next);
    refreshStats();
    const onHide = () => document.visibilityState === "hidden" && flush(false);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      clearTimeout(advanceTimer.current);
      flush(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  }, []);

  const legal = useMemo(() => (spot ? spotLegal(spot.cards, spot.up, table.rules) : []), [spot, table]);
  const info = spot ? spotOf(spot.cards, spot.up) : null;

  const answer = useCallback(
    (move: Move) => {
      if (!spot || answered || !legal.includes(move)) return;
      const decision = gradeSpot(spot.cards, spot.up, legal, table.rules, move as ActionType);
      setAnswered({ decision });
      setSession((s) => {
        const streak = decision.ok ? s.streak + 1 : 0;
        return { n: s.n + 1, correct: s.correct + (decision.ok ? 1 : 0), streak, best: Math.max(s.best, streak) };
      });
      play(decision.ok ? "chip" : "lose");
      pending.current.push({ cards: [...spot.cards], up: spot.up, action: move });
      if (pending.current.length >= FLUSH_EVERY) flush(true);
      if (decision.ok) advanceTimer.current = setTimeout(next, 650);
    },
    [spot, answered, legal, table, flush, next],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (KEYMAP[k]) {
        e.preventDefault();
        answer(KEYMAP[k]);
      } else if ((k === "enter" || k === " ") && answered) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, answered, next]);

  const pickCategory = (c: DrillCategory) => {
    setCategory(c);
    clearTimeout(advanceTimer.current);
    // regenerate with the new category right away
    setSpot((prev) => ({ ...generateSpot(c, Math.random, leakKeys), n: (prev?.n ?? 0) + 1 }));
    setAnswered(null);
  };

  const accuracy = session.n ? Math.round((session.correct / session.n) * 100) : 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        {/* session strip */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <Pill label="Answered" value={String(session.n)} />
          <Pill label="Accuracy" value={session.n ? `${accuracy}%` : "–"} hot={session.n >= 5 && accuracy >= 90} />
          <Pill label="Streak" value={`${session.streak}`} hot={session.streak >= 10} flame={session.streak >= 5} />
          <Pill label="Best" value={`${session.best}`} />
          {focus && (
            <Link href="/trainer" className="ml-auto rounded-full bg-ember-500/15 px-3 py-1.5 font-semibold text-ember-200 ring-1 ring-ember-500/40 hover:bg-ember-500/25">
              Focused: {spotLabel(focus)} ✕
            </Link>
          )}
        </div>

        {/* the spot */}
        <div className="felt relative overflow-hidden rounded-[28px] px-4 pb-6 pt-5 sm:rounded-[40px] sm:px-8">
          <p className="text-center font-display text-[10px] font-bold uppercase tracking-[0.3em] text-ember-400/70">
            {table.name} · {table.short}
          </p>
          <AnimatePresence mode="wait">
            {spot && info && (
              <motion.div
                key={spot.n}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="flex flex-col items-center"
              >
                <span className="mt-4 text-[10px] font-bold uppercase tracking-[0.3em] text-ash-500">Dealer shows</span>
                <div className="mt-2 flex">
                  <PlayingCardStatic card={spot.up} />
                  <div className="-ml-12 h-[120px] w-[86px] rounded-[10px] bg-[radial-gradient(circle_at_50%_60%,#ff5a1f,#b3200c_40%,#3d0805_85%)] shadow-[0_24px_40px_-16px_rgba(0,0,0,.95)] ring-1 ring-ember-300/40" />
                </div>
                <div className="my-5 h-px w-2/3 max-w-sm bg-gradient-to-r from-transparent via-ember-500/40 to-transparent" />
                <div className="flex">
                  <PlayingCardStatic card={spot.cards[0]} />
                  <div className="-ml-10">
                    <PlayingCardStatic card={spot.cards[1]} />
                  </div>
                </div>
                <span className="mt-3 rounded-full bg-ash-950/80 px-3 py-1 text-sm font-bold text-bone ring-1 ring-ash-700">
                  {info.kind === "pair" ? `Pair of ${info.value === 1 ? "aces" : info.value === 10 ? "tens" : `${info.value}s`}` : `${info.kind === "soft" ? "Soft" : "Hard"} ${info.value}`}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* choices */}
        <div className="panel mt-4 rounded-3xl p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {MOVES.map(({ move, key }) => {
              const allowed = legal.includes(move);
              const d = answered?.decision;
              const isCorrect = d && d.correct === move;
              const isWrongPick = d && !d.ok && d.chosen === move;
              return (
                <button
                  key={move}
                  disabled={!allowed || !!answered}
                  onClick={() => answer(move)}
                  className={`flex h-14 items-center justify-center gap-1.5 rounded-xl font-bold transition-all ${
                    isCorrect
                      ? "bg-emerald-500 text-ash-950 ring-2 ring-emerald-300"
                      : isWrongPick
                        ? "bg-ember-700 text-bone ring-2 ring-ember-400"
                        : move === "hit" || move === "stand"
                          ? "btn-fire"
                          : "btn-ash"
                  } ${answered && !isCorrect && !isWrongPick ? "opacity-40" : ""}`}
                >
                  {MOVE_LABEL[move]}
                  <kbd className="hidden rounded bg-ash-950/30 px-1.5 py-0.5 font-mono text-[10px] sm:inline">{key}</kbd>
                </button>
              );
            })}
          </div>

          <div className="mt-3 min-h-[52px]" aria-live="polite">
            {answered ? (
              answered.decision.ok ? (
                <p className="text-center text-sm font-semibold text-emerald-300">✓ {MOVE_LABEL[answered.decision.correct as Move]} — correct</p>
              ) : (
                <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
                  <p className="flex-1 text-sm text-ember-100">
                    <span className="font-bold">{answered.decision.label}: {MOVE_LABEL[answered.decision.correct as Move].toLowerCase()}.</span>{" "}
                    <span className="text-ash-300">{answered.decision.why}</span>
                  </p>
                  <button onClick={next} className="btn-fire h-10 shrink-0 rounded-xl px-5 text-sm font-bold">
                    Next <kbd className="ml-1 rounded bg-ash-950/20 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
                  </button>
                </div>
              )
            ) : (
              <p className="text-center text-xs text-ash-500">Pick the basic-strategy play. Keys: H S D P R.</p>
            )}
          </div>
        </div>
      </div>

      {/* sidebar */}
      <aside className="flex min-w-0 flex-col gap-4">
        <div className="panel rounded-3xl p-5">
          <h2 className="font-display text-sm font-bold">Table rules</h2>
          <select
            aria-label="Table rules"
            value={tableId}
            onChange={(e) => {
              flush(true);
              setTableId(e.target.value as typeof tableId);
            }}
            className="mt-3 h-10 w-full rounded-xl border border-ash-600/70 bg-ash-950 px-3 text-sm text-bone outline-none focus:border-ember-500"
          >
            {TABLE_IDS.map((id) => (
              <option key={id} value={id}>
                {TABLES[id].name} — {TABLES[id].short}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[11px] leading-relaxed text-ash-500">{table.blurb}</p>
        </div>

        {!focus && (
          <div className="panel rounded-3xl p-5">
            <h2 className="font-display text-sm font-bold">Drill</h2>
            <div className="mt-3 grid gap-1" role="radiogroup" aria-label="Drill category">
              {DRILL_CATEGORIES.map((c) => {
                const off = c.id === "leaks" && leakKeys.length === 0;
                return (
                  <button
                    key={c.id}
                    role="radio"
                    aria-checked={category === c.id}
                    disabled={off}
                    onClick={() => pickCategory(c.id)}
                    className={`rounded-xl px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                      category === c.id ? "bg-ember-500/12 ring-1 ring-ember-500/60" : "hover:bg-ash-800"
                    }`}
                  >
                    <span className="block text-sm font-bold">{c.label}</span>
                    <span className="block text-[11px] text-ash-500">{off ? "Answer a few spots first." : c.blurb}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="panel rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold">Your leaks</h2>
            <Link href="/profile" className="text-xs font-semibold text-ember-400 hover:text-ember-300">
              Report →
            </Link>
          </div>
          {stats && stats.leaks.length ? (
            <ul className="mt-3 space-y-1.5">
              {stats.leaks.slice(0, 6).map((l) => (
                <li key={`${l.spot}|${l.correct}`}>
                  {l.spot === "insurance" ? (
                    <span className="flex items-center justify-between rounded-xl px-2 py-1.5 text-xs">
                      <span>Taking insurance</span>
                      <span className="tabular text-ember-300">{l.misses}×</span>
                    </span>
                  ) : (
                    <Link
                      href={`/trainer?spot=${l.spot}`}
                      className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-xs transition-colors hover:bg-ash-800"
                    >
                      <span className="truncate">
                        <span className="font-semibold text-bone">{l.label}</span>
                        <span className="text-ash-500"> → {MOVE_LABEL[l.correct as Move]?.toLowerCase() ?? l.correct}</span>
                      </span>
                      <span className="tabular shrink-0 text-ember-300">
                        {l.misses}/{l.seen}
                      </span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-ash-400">No leaks yet. Play hands with Coach on, or drill a few spots.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function Pill({ label, value, hot, flame }: { label: string; value: string; hot?: boolean; flame?: boolean }) {
  return (
    <span className={`tabular flex items-center gap-1.5 rounded-full px-3 py-1.5 ring-1 ${hot ? "bg-ember-500/15 ring-ember-500/50" : "bg-ash-900 ring-ash-700"}`}>
      <span className="text-ash-500">{label}</span>
      <span className={`font-bold ${hot ? "text-ember-200" : "text-bone"}`}>
        {flame ? "🔥 " : ""}
        {value}
      </span>
    </span>
  );
}
