"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmberBurst } from "@/components/ember-burst";
import { IconCheck, IconFlame, IconX } from "@/components/icons";
import { PlayingCardStatic } from "@/components/playing-card-static";
import { Eyebrow } from "@/components/ui";
import { choiceLabel, gradeSpot, type Decision } from "@/lib/blackjack/coach";
import { DEFAULT_RULES } from "@/lib/blackjack/engine";
import { MOVE_LABEL, spotOf, type Move } from "@/lib/blackjack/strategy";
import { dailyPuzzles, type DailyPuzzle } from "@/lib/daily";
import { gradePoker, type PokerGrade } from "@/lib/poker/drills";
import { play } from "@/lib/sound";
import { recordDrills, today, update, useHydrated, useProgress } from "@/lib/store";
import { streakLength } from "@/lib/streak";
import { choicesFor, Prompt, SpotView } from "../poker/poker-trainer";

type Graded = { kind: "blackjack"; d: Decision } | { kind: "poker"; g: PokerGrade & { answer: string } };

export function DailyPuzzles() {
  const hydrated = useHydrated();
  const p = useProgress();
  const date = useMemo(() => (hydrated ? today() : ""), [hydrated]);
  const puzzles = useMemo(() => (date ? dailyPuzzles(date) : []), [date]);
  const answers = date ? (p.daily[date] ?? []) : [];
  const [graded, setGraded] = useState<Graded | null>(null);
  const [burst, setBurst] = useState(0);
  const current = puzzles[answers.length] as DailyPuzzle | undefined;
  const viewing = graded ? puzzles[answers.length - 1] : current;
  const finished = puzzles.length > 0 && answers.length >= puzzles.length && !graded;

  const save = (ok: boolean, rec: Parameters<typeof recordDrills>[0][number]) => {
    recordDrills([rec]);
    update((d) => {
      d.daily[date] = [...(d.daily[date] ?? []), ok];
    });
    play(ok ? "win" : "lose");
    if (ok) setBurst((b) => b + 1);
  };

  const answerBlackjack = (pz: Extract<DailyPuzzle, { game: "blackjack" }>, move: Move) => {
    const d = gradeSpot(pz.spot.cards, pz.spot.up, pz.legal, DEFAULT_RULES, move);
    setGraded({ kind: "blackjack", d });
    save(d.ok, { game: "blackjack", key: d.spot, label: d.label, kind: d.kind, correct: d.correct, ok: d.ok });
  };

  const answerPoker = (pz: Extract<DailyPuzzle, { game: "poker" }>, id: string) => {
    const g = gradePoker(pz.spot, id);
    setGraded({ kind: "poker", g: { ...g, answer: id } });
    save(g.ok, { game: "poker", key: g.key, label: g.label, kind: pz.spot.kind, correct: g.correct, ok: g.ok });
  };

  if (!hydrated) return <div className="mx-auto mt-10 h-96 max-w-2xl animate-pulse rounded-3xl bg-ash-900" />;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-10 pt-5 sm:px-6 lg:pt-10">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Eyebrow>Daily puzzles</Eyebrow>
          <h1 className="mt-1 font-display text-2xl font-black sm:text-3xl">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </h1>
        </div>
        <div className="flex gap-1.5" aria-label={`${answers.length} of 3 answered`}>
          {puzzles.map((_, i) => (
            <span
              key={i}
              className={`grid h-8 w-8 place-items-center rounded-full ring-1 ${
                answers[i] === true
                  ? "bg-emerald-500 text-ash-950 ring-emerald-300"
                  : answers[i] === false
                    ? "bg-ember-700 text-bone ring-ember-400"
                    : i === answers.length
                      ? "bg-ash-850 text-ember-300 ring-ember-500/60"
                      : "bg-ash-900 text-ash-600 ring-ash-700"
              }`}
            >
              {answers[i] === true ? <IconCheck className="h-4 w-4" /> : answers[i] === false ? <IconX className="h-4 w-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
            </span>
          ))}
        </div>
      </div>

      {finished ? (
        <Summary answers={answers} streak={streakLength(p.streak)} />
      ) : viewing ? (
        <div className="relative mt-5">
          {burst > 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-72">
              <EmberBurst key={burst} seed={burst} count={40} />
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div key={viewing.n} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
              <p className="mb-2 text-sm font-bold text-ash-300">
                Puzzle {viewing.n + 1} · <span className="text-bone">{viewing.title}</span>
              </p>
              {viewing.game === "blackjack" ? (
                <BlackjackPuzzle pz={viewing} graded={graded?.kind === "blackjack" ? graded.d : null} onAnswer={(m) => answerBlackjack(viewing, m)} />
              ) : (
                <PokerPuzzle pz={viewing} graded={graded?.kind === "poker" ? graded.g : null} onAnswer={(id) => answerPoker(viewing, id)} />
              )}
            </motion.div>
          </AnimatePresence>
          {graded && (
            <button
              onClick={() => {
                setGraded(null);
                play("click");
              }}
              className="btn-fire mt-4 h-14 w-full rounded-2xl font-display text-sm font-bold uppercase tracking-wider"
            >
              {answers.length >= puzzles.length ? "See results" : "Next puzzle"}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Verdict({ ok, title, why }: { ok: boolean; title: string; why?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // bring the explanation into view once, when it appears
  // block body: newer browsers return a Promise from scrollIntoView, which React would
  // otherwise treat as the effect's cleanup and crash on unmount
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mt-3 flex gap-3 rounded-2xl px-4 py-3 text-sm ring-1 ${ok ? "bg-emerald-500/10 text-emerald-100 ring-emerald-500/30" : "bg-ember-500/10 text-ember-100 ring-ember-500/40"}`}
    >
      <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${ok ? "bg-emerald-400 text-ash-950" : "bg-ember-500 text-ash-950"}`}>
        {ok ? <IconCheck className="h-4 w-4" /> : <IconX className="h-4 w-4" />}
      </span>
      <span>
        <span className="font-bold">{title}</span> {why && <span className="text-ash-300">{why}</span>}
      </span>
    </motion.div>
  );
}

export function BlackjackPuzzle({ pz, graded, onAnswer }: { pz: Pick<Extract<DailyPuzzle, { game: "blackjack" }>, "spot" | "legal">; graded: Decision | null; onAnswer: (m: Move) => void }) {
  const info = spotOf(pz.spot.cards, pz.spot.up);
  const moves = (["hit", "stand", "double", "split", "surrender"] as Move[]).filter((m) => pz.legal.includes(m));
  return (
    <>
      <div className="felt rounded-3xl px-4 py-6 sm:px-8">
        <div className="flex flex-col items-center">
          <span className="caps-label">Dealer shows</span>
          <div className="mt-2 flex">
            <PlayingCardStatic card={pz.spot.up} />
            <div className="-ml-10 h-[120px] w-[86px] rounded-[10px] bg-gradient-to-br from-ember-600 to-ember-900 ring-1 ring-ember-300/30" />
          </div>
          <span className="mt-5 caps-label">You have · {info.label}</span>
          <div className="mt-2 flex">
            {pz.spot.cards.map((c, i) => (
              <div key={i} className={i ? "-ml-8" : ""}>
                <PlayingCardStatic card={c} />
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-ash-500">6 decks · dealer stands on soft 17 · double after split · late surrender</p>
        </div>
      </div>
      <div className={`mt-3 grid gap-2 ${moves.length > 3 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
        {moves.map((m) => {
          const right = graded && graded.correct === m;
          const wrong = graded && !graded.ok && graded.chosen === m;
          return (
            <button
              key={m}
              disabled={!!graded}
              onClick={() => onAnswer(m)}
              className={`h-14 rounded-2xl font-bold transition-all ${
                right ? "bg-emerald-500 text-ash-950 ring-2 ring-emerald-300" : wrong ? "bg-ember-700 text-bone ring-2 ring-ember-400" : "btn-fire"
              } ${graded && !right && !wrong ? "opacity-40" : ""}`}
            >
              {MOVE_LABEL[m]}
            </button>
          );
        })}
      </div>
      {graded && <Verdict ok={graded.ok} title={graded.ok ? `${choiceLabel(graded.chosen)} is right.` : `The play is ${choiceLabel(graded.correct).toLowerCase()}.`} why={graded.why} />}
    </>
  );
}

export function PokerPuzzle({
  pz,
  graded,
  onAnswer,
}: {
  pz: Pick<Extract<DailyPuzzle, { game: "poker" }>, "spot">;
  graded: (PokerGrade & { answer: string }) | null;
  onAnswer: (id: string) => void;
}) {
  const choices = choicesFor(pz.spot);
  return (
    <>
      <div className="felt rounded-3xl px-4 py-6 sm:px-8">
        <SpotView spot={pz.spot} grade={graded} />
      </div>
      <div className="panel mt-3 rounded-3xl p-4">
        <Prompt spot={pz.spot} />
        <div className={`mt-3 grid gap-2 ${choices.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
          {choices.map((c) => {
            const right = graded && graded.correct === c.id;
            const wrong = graded && !graded.ok && graded.answer === c.id;
            return (
              <button
                key={c.id}
                disabled={!!graded}
                onClick={() => onAnswer(c.id)}
                className={`h-14 rounded-2xl font-bold transition-all ${
                  right ? "bg-emerald-500 text-ash-950 ring-2 ring-emerald-300" : wrong ? "bg-ember-700 text-bone ring-2 ring-ember-400" : "btn-fire"
                } ${graded && !right && !wrong ? "opacity-40" : ""}`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
      {graded && <Verdict ok={graded.ok} title={graded.ok ? "Correct." : "Not quite."} why={graded.why} />}
    </>
  );
}

function Summary({ answers, streak }: { answers: boolean[]; streak: number }) {
  const solved = answers.filter(Boolean).length;
  return (
    <div className="panel mt-6 rounded-[32px] p-6 text-center sm:p-8">
      <IconFlame className="mx-auto h-14 w-14 animate-flicker text-ember-400 drop-shadow-[0_0_20px_rgba(255,122,31,0.8)]" />
      <h2 className="mt-3 font-display text-3xl font-black">
        <span className="molten-text">{solved}/3</span> solved
      </h2>
      <p className="mt-2 text-sm text-ash-400">
        {solved === 3 ? "A clean sweep." : solved ? "Check the misses in your leak report." : "Tough set. Review the explanations and try the drills."} New puzzles at midnight.
      </p>
      <p className="tabular mt-4 text-sm font-bold text-ember-300">
        {streak}-day streak
      </p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <Link href="/train/" className="btn-fire grid h-12 place-items-center rounded-2xl font-bold">
          Keep training
        </Link>
        <Link href="/play/poker/" className="btn-ash grid h-12 place-items-center rounded-2xl font-bold">
          Play a bot
        </Link>
      </div>
    </div>
  );
}
