"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PlayingCardStatic } from "@/components/playing-card-static";
import { Segmented } from "@/components/ui";
import {
  countRecord,
  fmtCount,
  gradeIndex,
  INDEX_MOVE_LABEL,
  INDEX_PLAYS,
  indexRule,
  indexSpot,
  indexSpotLabel,
  type CountGrade,
  type IndexMove,
  type IndexSpot,
} from "@/lib/blackjack/counting";
import { play } from "@/lib/sound";
import { recordDrills } from "@/lib/store";
import { EMPTY_TALLY, Pill, tallied, TallyStrip, useKeys } from "./shared";

type Group = "all" | "i18" | "fab4";

const BUTTONS: { move: IndexMove; key: string; label: string }[] = [
  { move: "hit", key: "H", label: "Hit" },
  { move: "stand", key: "S", label: "Stand" },
  { move: "double", key: "D", label: "Double" },
  { move: "split", key: "P", label: "Split" },
  { move: "surrender", key: "R", label: "Surrender" },
];
const INSURANCE_BUTTONS: { move: IndexMove; key: string; label: string }[] = [
  { move: "insurance", key: "Y", label: "Take insurance" },
  { move: "no-insurance", key: "N", label: "No insurance" },
];
const KEYMAP: Record<string, IndexMove> = { h: "hit", s: "stand", d: "double", p: "split", r: "surrender", y: "insurance", n: "no-insurance" };

function generate(group: Group): IndexSpot {
  const pool = INDEX_PLAYS.filter((p) => group === "all" || p.group === group);
  return indexSpot(Math.random, pool[Math.floor(Math.random() * pool.length)]);
}

export function IndexDrill() {
  const [group, setGroup] = useState<Group>("all");
  const [spot, setSpot] = useState<(IndexSpot & { n: number }) | null>(null);
  const [chosen, setChosen] = useState<IndexMove | null>(null);
  const [grade, setGrade] = useState<CountGrade | null>(null);
  const [tally, setTally] = useState(EMPTY_TALLY);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const next = useCallback((g: Group) => {
    clearTimeout(timer.current);
    setSpot((prev) => ({ ...generate(g), n: (prev?.n ?? 0) + 1 }));
    setChosen(null);
    setGrade(null);
  }, []);

  useEffect(() => {
    queueMicrotask(() => next("all"));
    return () => clearTimeout(timer.current);
  }, [next]);

  const answer = (m: IndexMove) => {
    if (!spot || grade || !spot.legal.includes(m)) return;
    const g = gradeIndex(spot, m);
    setChosen(m);
    setGrade(g);
    setTally((t) => tallied(t, g.ok));
    play(g.ok ? "chip" : "lose");
    recordDrills([countRecord(spot, g)]);
    // deviations are worth reading even when right, so only auto-advance on basic plays
    if (g.ok && !spot.deviation) timer.current = setTimeout(() => next(group), 900);
  };

  useKeys((key, e) => {
    const m = KEYMAP[key.toLowerCase()];
    if (m && !grade) {
      e.preventDefault();
      answer(m);
    } else if (grade && (key === "Enter" || key === " ")) {
      e.preventDefault();
      next(group);
    }
  });

  const insurance = spot?.play.spot === "insurance";
  const buttons = insurance ? INSURANCE_BUTTONS : BUTTONS;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <TallyStrip t={tally}>
          <Pill label="Best" value={String(tally.best)} />
        </TallyStrip>

        <div className="felt relative overflow-hidden rounded-[28px] px-4 pb-6 pt-5 sm:rounded-[40px] sm:px-8">
          <p className="text-center eyebrow text-ember-400/70">
            6 decks · S17 · DAS · {spot?.rules.surrender ? "Late surrender" : "No surrender"}
          </p>
          <AnimatePresence mode="wait">
            {spot && (
              <motion.div
                key={spot.n}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="flex flex-col items-center"
              >
                <span className="mt-3 rounded-full bg-ember-500/15 px-4 py-1.5 font-display text-base font-black text-ember-200 ring-1 ring-ember-500/50">
                  True count <span className="tabular">{fmtCount(spot.trueCount)}</span>
                </span>
                <span className="mt-4 caps-label">Dealer shows</span>
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
                  {insurance ? "Insurance?" : indexSpotLabel(spot.play)}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="panel mt-4 rounded-3xl p-4 sm:p-5">
          <div className={`grid gap-2 ${insurance ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-5"}`}>
            {buttons.map(({ move, key, label }) => {
              const allowed = !!spot?.legal.includes(move);
              const isCorrect = grade && spot?.answer === move;
              const isWrong = grade && !grade.ok && chosen === move;
              return (
                <button
                  key={move}
                  disabled={!allowed || !!grade}
                  onClick={() => answer(move)}
                  className={`flex h-14 items-center justify-center gap-1.5 rounded-xl font-bold transition-all ${
                    isCorrect
                      ? "bg-emerald-500 text-ash-950 ring-2 ring-emerald-300"
                      : isWrong
                        ? "bg-ember-700 text-bone ring-2 ring-ember-400"
                        : move === "hit" || move === "stand" || move === "insurance"
                          ? "btn-fire"
                          : "btn-ash"
                  } ${grade && !isCorrect && !isWrong ? "opacity-40" : ""}`}
                >
                  {label}
                  <kbd className="hidden rounded bg-ash-950/30 px-1.5 py-0.5 font-mono text-[10px] sm:inline">{key}</kbd>
                </button>
              );
            })}
          </div>

          <div className="mt-3 min-h-[52px]" aria-live="polite">
            {grade && spot ? (
              <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
                <p className="flex-1 text-sm text-ash-300">
                  <span className={`font-bold ${grade.ok ? "text-emerald-300" : "text-ember-100"}`}>
                    {grade.ok ? "✓ " : ""}
                    {INDEX_MOVE_LABEL[spot.answer]}
                    {spot.deviation ? " (deviation)." : " (basic strategy)."}
                  </span>{" "}
                  {grade.why}
                </p>
                {!(grade.ok && !spot.deviation) && (
                  <button onClick={() => next(group)} className="btn-fire h-10 shrink-0 rounded-xl px-5 text-sm font-bold">
                    Next <kbd className="ml-1 hidden rounded bg-ash-950/20 px-1.5 py-0.5 font-mono text-[10px] sm:inline">Enter</kbd>
                  </button>
                )}
              </div>
            ) : (
              <p className="text-center text-xs text-ash-500">Play the hand for this count. Keys: H S D P R, Y/N for insurance.</p>
            )}
          </div>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        <div className="panel rounded-3xl p-5">
          <h2 className="font-display text-sm font-bold">Index set</h2>
          <div className="mt-3">
            <Segmented
              label="Index set"
              value={group}
              onChange={(g) => {
                setGroup(g);
                next(g);
              }}
              options={[
                { id: "all", label: "All 22" },
                { id: "i18", label: "Illustrious 18" },
                { id: "fab4", label: "Fab 4" },
              ]}
            />
          </div>
        </div>
        <IndexTable />
      </aside>
    </div>
  );
}

function IndexTable() {
  return (
    <details className="panel group rounded-3xl p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between font-display text-sm font-bold">
        Index chart
        <span className="text-xs text-ember-400 group-open:hidden">Show</span>
        <span className="hidden text-xs text-ember-400 group-open:inline">Hide</span>
      </summary>
      <table className="mt-3 w-full text-xs">
        <tbody>
          {INDEX_PLAYS.map((p, i) => (
            <tr key={p.id} className={`border-t border-ash-800 ${i === 18 ? "border-t-ember-500/40" : ""}`}>
              <td className="py-1 pr-2 font-semibold text-bone">
                {indexSpotLabel(p)}
                {p.group === "fab4" && <span className="ml-1 text-[9px] text-ember-400">LS</span>}
              </td>
              <td className="py-1 text-ash-300">{indexRule(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-relaxed text-ash-500">
        Six-deck S17 numbers. LS rows apply when late surrender is offered. Under H17 a few shift by about one.
      </p>
    </details>
  );
}
