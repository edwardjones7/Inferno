"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmberBurst } from "@/components/ember-burst";
import { IconCheck, IconChevron, IconLock, IconX } from "@/components/icons";
import { ProBadge, ProLock } from "@/components/pro/pro-badge";
import { Eyebrow, Ring } from "@/components/ui";
import { FREE_LESSONS_PER_TRACK, lessonLocked, paywallReason } from "@/lib/gates";
import { lessonAfter, lessonById, lessonDone, lessonUnlocked, TRACKS, type CheckStep, type Lesson, type Step } from "@/lib/learn";
import { useIsPro } from "@/lib/pro";
import { play } from "@/lib/sound";
import { completeLesson, useHydrated, useProgress } from "@/lib/store";
import { Rich, VisualView } from "../visual";

export function LessonPlayer({ id }: { id: string }) {
  const lesson = lessonById(id)!;
  const p = useProgress();
  const hydrated = useHydrated();
  const pro = useIsPro();
  const [override, setOverride] = useState(false);

  if (!hydrated) return <Frame><div className="panel h-[520px] animate-pulse rounded-[28px]" /></Frame>;

  if (lessonLocked(id, pro)) {
    return (
      <Frame>
        <Header lesson={lesson} />
        <ProLock
          reason={paywallReason.lesson(id)}
          title="Part of the full course"
          secondary={
            <Link href="/train/learn/" className="flex h-10 items-center justify-center rounded-xl text-xs font-semibold text-ash-400 hover:text-bone">
              Back to lessons
            </Link>
          }
        >
          {lesson.blurb} The first {FREE_LESSONS_PER_TRACK} lessons of each track are free; the rest of the course comes with Pro.
        </ProLock>
      </Frame>
    );
  }

  if (!lessonUnlocked(p, id) && !override) {
    const list = TRACKS[lesson.track].lessons;
    const prev = list[list.indexOf(lesson) - 1];
    return (
      <Frame>
        <Header lesson={lesson} />
        <div className="panel rounded-[28px] px-5 py-10 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ash-850 text-ash-400 ring-1 ring-ash-700">
            <IconLock className="h-6 w-6" />
          </span>
          <h2 className="mt-4 font-display text-xl font-black">Not unlocked yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ash-400">
            This lesson builds on <span className="font-semibold text-bone">{prev.title}</span>. Finish that one first.
          </p>
          <div className="mx-auto mt-6 flex max-w-xs flex-col gap-2">
            <Link href={`/train/learn/${prev.id}/`} className="btn-fire flex h-11 items-center justify-center rounded-xl text-sm font-bold">
              Go to {prev.title}
            </Link>
            <button onClick={() => setOverride(true)} className="h-10 rounded-xl text-xs font-semibold text-ash-400 hover:text-bone">
              Open it anyway
            </button>
          </div>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <Player key={lesson.id} lesson={lesson} alreadyDone={lessonDone(p, id)} />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl px-4 pb-10 pt-5 sm:px-6 lg:pt-10">{children}</div>;
}

function Header({ lesson, children }: { lesson: Lesson; children?: React.ReactNode }) {
  const list = TRACKS[lesson.track].lessons;
  return (
    <div className="mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>
            {TRACKS[lesson.track].title} · Lesson {list.indexOf(lesson) + 1} of {list.length}
          </Eyebrow>
          <h1 className="mt-1 font-display text-2xl font-black leading-tight sm:text-3xl">{lesson.title}</h1>
        </div>
        <Link
          href="/train/learn/"
          aria-label="Close lesson"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ash-900 text-ash-400 ring-1 ring-ash-700 hover:text-bone"
        >
          <IconX className="h-4 w-4" />
        </Link>
      </div>
      {children}
    </div>
  );
}

function Player({ lesson, alreadyDone }: { lesson: Lesson; alreadyDone: boolean }) {
  // remember whether this run is a review: completing the lesson flips `alreadyDone` mid-run
  const [review] = useState(alreadyDone);
  const steps = useMemo<Step[]>(() => lesson.steps(), [lesson]);
  const [at, setAt] = useState(0);
  /** step index -> chosen option id */
  const [picks, setPicks] = useState<Record<number, string>>({});
  const finished = at >= steps.length;
  const step = steps[at] as Step | undefined;
  const answered = step?.kind === "check" ? picks[at] : undefined;
  const canContinue = !!step && (step.kind === "explain" || answered !== undefined);

  const checkIdx = steps.flatMap((s, i) => (s.kind === "check" ? [i] : []));
  const right = checkIdx.filter((i) => picks[i] === (steps[i] as CheckStep).answer).length;

  const advance = useCallback(() => {
    if (!canContinue) return;
    if (at === steps.length - 1) {
      completeLesson(lesson.id);
      play("win");
    } else play("click");
    setAt(at + 1);
  }, [at, canContinue, lesson.id, steps.length]);

  const choose = useCallback(
    (optionId: string) => {
      if (!step || step.kind !== "check" || picks[at] !== undefined) return;
      setPicks((p) => ({ ...p, [at]: optionId }));
      play(optionId === step.answer ? "chip" : "lose");
    },
    [at, picks, step],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter" || e.key === "ArrowRight") {
        if (canContinue) {
          e.preventDefault();
          advance();
        }
      } else if (e.key === "ArrowLeft" && at > 0 && !finished) {
        setAt(at - 1);
      } else if (step?.kind === "check" && /^[1-9]$/.test(e.key)) {
        const o = step.options[Number(e.key) - 1];
        if (o) choose(o.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, at, canContinue, choose, finished, step]);

  return (
    <>
      <Header lesson={lesson}>
        <div className="mt-4 flex gap-1" aria-label={`Step ${Math.min(at + 1, steps.length)} of ${steps.length}`}>
          {steps.map((s, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                i < at || finished
                  ? s.kind === "check" && picks[i] !== s.answer
                    ? "bg-ember-800"
                    : "bg-ember-500"
                  : i === at
                    ? "bg-ember-300"
                    : "bg-ash-800"
              }`}
            />
          ))}
        </div>
      </Header>

      <AnimatePresence mode="wait">
        <motion.div
          key={at}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.2 }}
        >
          {finished ? (
            <Finish lesson={lesson} right={right} checks={checkIdx.length} alreadyDone={review} />
          ) : step ? (
            <div className="panel rounded-[28px] p-5 sm:p-6">
              {step.kind === "explain" ? (
                <ExplainView title={step.title} body={step.body}>
                  {step.visual && <VisualView v={step.visual} />}
                </ExplainView>
              ) : (
                <CheckView step={step} picked={answered} onPick={choose} />
              )}

              <div className="mt-5 flex items-center gap-2">
                {at > 0 && (
                  <button
                    onClick={() => setAt(at - 1)}
                    aria-label="Previous step"
                    className="btn-ash grid h-12 w-12 shrink-0 place-items-center rounded-xl"
                  >
                    <IconChevron className="h-4 w-4 rotate-180" />
                  </button>
                )}
                <button
                  onClick={advance}
                  disabled={!canContinue}
                  className="btn-fire flex h-12 flex-1 items-center justify-center gap-1 rounded-xl text-sm font-bold disabled:opacity-35"
                >
                  {step.kind === "check" && answered === undefined ? "Pick an answer" : at === steps.length - 1 ? "Finish lesson" : "Continue"}
                  {canContinue && <IconChevron className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

function ExplainView({ title, body, children }: { title: string; body: string[]; children?: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-xl font-black leading-snug">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ash-200">
        {body.map((para, i) => (
          <p key={i}>
            <Rich text={para} />
          </p>
        ))}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

function CheckView({ step, picked, onPick }: { step: CheckStep; picked: string | undefined; onPick: (id: string) => void }) {
  const done = picked !== undefined;
  const ok = picked === step.answer;
  const short = step.options.every((o) => o.label.length <= 12);
  const cols = short ? (step.options.length === 2 ? "grid-cols-2" : step.options.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3") : "grid-cols-1";
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-ember-400">Quick check</p>
      <h2 className="mt-1 font-display text-lg font-bold leading-snug sm:text-xl">{step.prompt}</h2>
      {step.visual && <div className="mt-4">{<VisualView v={step.visual} />}</div>}
      <div className={`mt-4 grid gap-2 ${cols}`}>
        {step.options.map((o, i) => {
          const isAnswer = done && o.id === step.answer;
          const isWrongPick = done && !ok && o.id === picked;
          return (
            <button
              key={o.id}
              disabled={done}
              onClick={() => onPick(o.id)}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-all ${
                isAnswer
                  ? "bg-emerald-500 text-ash-950 ring-2 ring-emerald-300"
                  : isWrongPick
                    ? "bg-ember-700 text-bone ring-2 ring-ember-400"
                    : "btn-ash"
              } ${done && !isAnswer && !isWrongPick ? "opacity-40" : ""}`}
            >
              {isAnswer && <IconCheck className="h-4 w-4 shrink-0" />}
              {isWrongPick && <IconX className="h-4 w-4 shrink-0" />}
              <span>{o.label}</span>
              {!done && <kbd className="ml-auto hidden rounded bg-ash-950/40 px-1.5 py-0.5 font-mono text-[10px] text-ash-500 sm:inline">{i + 1}</kbd>}
            </button>
          );
        })}
      </div>
      <div aria-live="polite">
        {done && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-4 rounded-2xl px-4 py-3 text-sm ring-1 ${ok ? "bg-emerald-500/10 ring-emerald-500/30" : "bg-ember-500/10 ring-ember-500/30"}`}
          >
            <p className={`font-bold ${ok ? "text-emerald-300" : "text-ember-300"}`}>{ok ? "Correct" : "Not quite"}</p>
            <p className="mt-1 leading-relaxed text-ash-200">{step.why}</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Finish({ lesson, right, checks, alreadyDone }: { lesson: Lesson; right: number; checks: number; alreadyDone: boolean }) {
  const next = lessonAfter(lesson.id);
  const pro = useIsPro();
  const nextLocked = !!next && lessonLocked(next.id, pro);
  const [main, ...more] = lesson.practice;
  return (
    <div className="panel relative overflow-hidden rounded-[28px] p-6 text-center sm:p-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56">
        <EmberBurst seed={right + 3} count={36} />
      </div>
      <div className="absolute -top-20 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,90,31,0.3),transparent)]" />
      <div className="relative">
        <Ring value={checks ? right / checks : 1} size={96} stroke={8}>
          <span className="tabular font-display text-2xl font-black">
            {right}/{checks}
          </span>
        </Ring>
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.24em] text-ember-400">{alreadyDone ? "Lesson reviewed" : "Lesson complete"}</p>
        <h2 className="mt-1 font-display text-2xl font-black">{lesson.title}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ash-400">
          {right === checks ? "Every check right. " : `${right} of ${checks} checks right. `}
          Now make it automatic: drill it until you don&apos;t have to think.
        </p>

        <div className="mx-auto mt-6 flex max-w-sm flex-col gap-2">
          <Link href={main.href} className="btn-fire flex h-12 items-center justify-center gap-1 rounded-xl text-sm font-bold">
            Practice this: {main.label}
            <IconChevron className="h-4 w-4" />
          </Link>
          {more.map((m) => (
            <Link key={m.href} href={m.href} className="btn-ash flex h-11 items-center justify-center rounded-xl text-sm font-bold">
              {m.label}
            </Link>
          ))}
          {next ? (
            <Link href={`/train/learn/${next.id}/`} className="btn-ash flex h-11 items-center justify-center gap-1 rounded-xl text-sm font-bold">
              Next lesson: {next.title}
              {nextLocked ? <ProBadge className="ml-1" /> : <IconChevron className="h-4 w-4" />}
            </Link>
          ) : (
            <p className="mt-1 text-xs font-semibold text-ember-300">That&apos;s the whole {TRACKS[lesson.track].title} track.</p>
          )}
          <Link href="/train/learn/" className="mt-1 h-10 text-xs font-semibold leading-10 text-ash-400 hover:text-bone">
            Back to all lessons
          </Link>
        </div>
      </div>
    </div>
  );
}
