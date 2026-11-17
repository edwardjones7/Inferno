"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { MiniCard, PlayingCardStatic } from "@/components/playing-card-static";
import { Segmented } from "@/components/ui";
import { countRecord, fmtCount, gradeRunning, hiLo, runningSpot, type CountGrade, type RunningSpot } from "@/lib/blackjack/counting";
import { play } from "@/lib/sound";
import { recordDrills } from "@/lib/store";
import { useStored } from "@/lib/use-stored";
import { CountPad, EMPTY_TALLY, Pill, Tag, tallied, TallyStrip, useKeys } from "./shared";

const SPEEDS = ["2000", "1500", "1000", "750", "500"] as const;
type Speed = (typeof SPEEDS)[number];
const LENGTHS = ["10", "20", "30"] as const;
type Length = (typeof LENGTHS)[number];

const isSpeed = (v: unknown): v is Speed => SPEEDS.includes(v as Speed);
const isLength = (v: unknown): v is Length => LENGTHS.includes(v as Length);
const isGroup = (v: unknown): v is "1" | "2" => v === "1" || v === "2";
const isMs = (v: unknown): v is string => typeof v === "string" && /^\d+$/.test(v);

type Phase = "setup" | "flash" | "answer" | "result";

export function RunningDrill() {
  const [speed, setSpeed] = useStored<Speed>("inferno:count:speed", "1000", isSpeed);
  const [group, setGroup] = useStored<"1" | "2">("inferno:count:group", "1", isGroup);
  const [length, setLength] = useStored<Length>("inferno:count:length", "20", isLength);
  const [bestMs, setBestMs] = useStored<string>("inferno:count:best-ms", "", isMs);
  const [phase, setPhase] = useState<Phase>("setup");
  const [spot, setSpot] = useState<RunningSpot | null>(null);
  const [step, setStep] = useState(0);
  const [entry, setEntry] = useState("");
  const [grade, setGrade] = useState<CountGrade | null>(null);
  const [tally, setTally] = useState(EMPTY_TALLY);

  const per = Number(group);
  const steps = spot ? Math.ceil(spot.cards.length / per) : 0;
  const msPerCard = Number(speed) / per;

  // advance the flash
  useEffect(() => {
    if (phase !== "flash" || !spot) return;
    const t = setTimeout(() => {
      if (step + 1 >= steps) setPhase("answer");
      else {
        setStep(step + 1);
        play("card");
      }
    }, Number(speed));
    return () => clearTimeout(t);
  }, [phase, spot, step, steps, speed]);

  const start = () => {
    setSpot(runningSpot(Math.random, Number(length)));
    setStep(0);
    setEntry("");
    setGrade(null);
    setPhase("flash");
    play("card");
  };

  const submit = () => {
    if (!spot || phase !== "answer" || entry === "" || entry === "-") return;
    const g = gradeRunning(spot, Number(entry));
    setGrade(g);
    setPhase("result");
    setTally((t) => tallied(t, g.ok));
    play(g.ok ? "chip" : "lose");
    recordDrills([countRecord(spot, g)]);
    if (g.ok && (!bestMs || msPerCard < Number(bestMs))) setBestMs(String(Math.round(msPerCard)));
  };

  useKeys((key, e) => {
    if ((phase === "setup" || phase === "result") && (key === "Enter" || key === " ")) {
      e.preventDefault();
      start();
    } else if (phase === "flash" && key === "Escape") setPhase("setup");
  });

  const shown = spot ? spot.cards.slice(step * per, step * per + per) : [];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <TallyStrip t={tally}>
          <Pill label="Best speed" value={bestMs ? `${(Number(bestMs) / 1000).toFixed(2)}s/card` : "–"} />
        </TallyStrip>

        <div className="felt relative flex min-h-[340px] flex-col items-center justify-center overflow-hidden rounded-[28px] px-4 py-6 sm:rounded-[40px] sm:px-8">
          {phase === "setup" && (
            <div className="text-center">
              <p className="font-display text-lg font-bold">Keep the running count</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-ash-400">
                {length} cards, {(msPerCard / 1000).toFixed(2).replace(/0$/, "")}s per card{per === 2 ? ", two at a time" : ""}. Then enter the count.
              </p>
              <button onClick={start} className="btn-fire mt-5 h-14 rounded-xl px-10 text-base font-bold">
                Deal <kbd className="ml-1 hidden rounded bg-ash-950/20 px-1.5 py-0.5 font-mono text-[10px] sm:inline">Enter</kbd>
              </button>
            </div>
          )}

          {phase === "flash" && (
            <>
              <p className="tabular absolute left-5 top-4 text-[11px] font-bold text-ash-500">
                {Math.min(spot!.cards.length, (step + 1) * per)}/{spot!.cards.length}
              </p>
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, scale: 0.9, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: Math.min(0.12, msPerCard / 4000) }}
                  className="flex gap-3"
                >
                  {shown.map((c, i) => (
                    <PlayingCardStatic key={i} card={c} large />
                  ))}
                </motion.div>
              </AnimatePresence>
              <p className="absolute bottom-4 text-[11px] text-ash-600">Esc to stop</p>
            </>
          )}

          {phase === "answer" && (
            <div className="w-full">
              <p className="mb-3 text-center font-display text-base font-bold">What’s the running count?</p>
              <CountPad value={entry} onChange={setEntry} onSubmit={submit} />
            </div>
          )}

          {phase === "result" && spot && grade && (
            <div className="w-full text-center">
              <p className={`font-display text-2xl font-black ${grade.ok ? "text-emerald-300" : "text-ember-300"}`}>
                {grade.ok ? `✓ ${fmtCount(spot.answer)}` : `It was ${fmtCount(spot.answer)}`}
              </p>
              {!grade.ok && <p className="mt-1 text-sm text-ash-400">You said {fmtCount(Number(entry))}.</p>}
              <Review cards={spot.cards} />
              <button onClick={start} className="btn-fire mt-5 h-12 rounded-xl px-8 text-sm font-bold">
                Next run <kbd className="ml-1 hidden rounded bg-ash-950/20 px-1.5 py-0.5 font-mono text-[10px] sm:inline">Enter</kbd>
              </button>
            </div>
          )}
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        <div className="panel rounded-3xl p-5">
          <h2 className="font-display text-sm font-bold">Speed per flash</h2>
          <div className="mt-3">
            <Segmented
              label="Seconds per flash"
              value={speed}
              onChange={setSpeed}
              options={SPEEDS.map((s) => ({ id: s, label: `${Number(s) / 1000}s`, disabled: phase === "flash" }))}
            />
          </div>
          <h2 className="mt-4 font-display text-sm font-bold">Cards per flash</h2>
          <div className="mt-3">
            <Segmented
              label="Cards per flash"
              value={group}
              onChange={setGroup}
              options={[
                { id: "1", label: "One", disabled: phase === "flash" },
                { id: "2", label: "Pairs", disabled: phase === "flash" },
              ]}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ash-500">
            Pairs mode trains cancelling: a 5 and a king net to zero, so you only carry what’s left.
          </p>
          <h2 className="mt-4 font-display text-sm font-bold">Run length</h2>
          <div className="mt-3">
            <Segmented
              label="Cards per run"
              value={length}
              onChange={setLength}
              options={LENGTHS.map((l) => ({ id: l, label: `${l} cards`, disabled: phase === "flash" }))}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

/** Every card with its tag and the count after it, so a miss shows where it slipped. */
function Review({ cards }: { cards: readonly RunningSpot["cards"][number][] }) {
  const after: number[] = [];
  for (const c of cards) after.push((after.at(-1) ?? 0) + hiLo(c));
  return (
    <ol className="mx-auto mt-4 flex max-w-lg flex-wrap justify-center gap-1.5">
      {cards.map((c, i) => {
        const rc = after[i];
        return (
          <li key={i} className="flex flex-col items-center gap-0.5 rounded-lg bg-ash-950/60 px-1 py-1">
            <MiniCard card={c} />
            <Tag v={hiLo(c)} />
            <span className="tabular text-[9px] text-ash-400">{fmtCount(rc)}</span>
          </li>
        );
      })}
    </ol>
  );
}
