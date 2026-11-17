"use client";

import { useEffect, useRef, useState } from "react";
import { PlayingCardStatic } from "@/components/playing-card-static";
import { Segmented } from "@/components/ui";
import { countRecord, fmtCount, gradeRunning, runningCount, shuffledDeck, type CountGrade, type RunningSpot } from "@/lib/blackjack/counting";
import type { Card } from "@/lib/blackjack/cards";
import { play } from "@/lib/sound";
import { recordDrills } from "@/lib/store";
import { useStored } from "@/lib/use-stored";
import { CountPad, EMPTY_TALLY, fmtSecs, Pill, tallied, TallyStrip, useKeys } from "./shared";

type Phase = "setup" | "run" | "answer" | "result";
type Variant = "full" | "burn";

const isMs = (v: unknown): v is string => typeof v === "string" && /^\d+$/.test(v);

/**
 * Count down a deck as fast as you can, tapping (or Space / →) to turn each card.
 * Full deck: the count must end at 0. "Burn one": a card is hidden first, so the final
 * count tells you whether it was high (−1 left behind → +1), neutral or low.
 */
export function DeckDrill() {
  const [variant, setVariant] = useState<Variant>("full");
  const [best, setBest] = useStored<string>("inferno:count:deck-best", "", isMs);
  const [phase, setPhase] = useState<Phase>("setup");
  const [deck, setDeck] = useState<Card[]>([]);
  const [burned, setBurned] = useState<Card | null>(null);
  const [i, setI] = useState(0);
  const [started, setStarted] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [entry, setEntry] = useState("");
  const [grade, setGrade] = useState<CountGrade | null>(null);
  const [tally, setTally] = useState(EMPTY_TALLY);
  const raf = useRef(0);

  // live timer
  useEffect(() => {
    if (phase !== "run") return;
    const tick = () => {
      setElapsed(performance.now() - started);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [phase, started]);

  const start = () => {
    const d = shuffledDeck(Math.random);
    const b = variant === "burn" ? d.pop()! : null;
    setDeck(d);
    setBurned(b);
    setI(0);
    setEntry("");
    setGrade(null);
    setElapsed(0);
    setStarted(performance.now());
    setPhase("run");
    play("card");
  };

  const advance = () => {
    if (phase !== "run") return;
    if (i + 1 >= deck.length) {
      setElapsed(performance.now() - started);
      setPhase("answer");
      return;
    }
    setI(i + 1);
    play("card");
  };

  const submit = () => {
    if (phase !== "answer" || entry === "" || entry === "-") return;
    const spot: RunningSpot = { kind: "count", key: "count-running", cards: deck, answer: runningCount(deck) };
    const g = gradeRunning(spot, Number(entry));
    setGrade(g);
    setPhase("result");
    setTally((t) => tallied(t, g.ok));
    play(g.ok ? "chip" : "lose");
    recordDrills([countRecord(spot, g)]);
    if (g.ok && variant === "full" && (!best || elapsed < Number(best))) setBest(String(Math.round(elapsed)));
  };

  useKeys((key, e) => {
    if (phase === "run" && (key === " " || key === "ArrowRight" || key === "Enter")) {
      e.preventDefault();
      advance();
    } else if (phase === "run" && key === "Escape") setPhase("setup");
    else if ((phase === "setup" || phase === "result") && (key === "Enter" || key === " ")) {
      e.preventDefault();
      start();
    }
  });

  const answer = runningCount(deck);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <TallyStrip t={tally}>
          <Pill label="Best deck" value={best ? fmtSecs(Number(best)) : "–"} hot={!!best && Number(best) < 25000} />
        </TallyStrip>

        <div className="felt relative flex min-h-[380px] flex-col items-center justify-center overflow-hidden rounded-[28px] px-4 py-6 sm:rounded-[40px] sm:px-8">
          {phase === "setup" && (
            <div className="text-center">
              <p className="font-display text-lg font-bold">Deck countdown</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-ash-400">
                {variant === "full"
                  ? "Turn all 52 cards as fast as you can keep the count. A full deck always ends at 0."
                  : "One card is burned face down. Count the other 51: the final count tells you what kind of card it was."}
              </p>
              <button onClick={start} className="btn-fire mt-5 h-14 rounded-xl px-10 text-base font-bold">
                Start the clock
              </button>
              <p className="mt-3 hidden text-[11px] text-ash-500 sm:block">Space or → turns the next card.</p>
            </div>
          )}

          {phase === "run" && (
            <button
              onClick={advance}
              className="flex w-full flex-col items-center gap-4 rounded-3xl py-2 outline-none"
              aria-label="Next card"
            >
              <span className="tabular font-display text-3xl font-black text-bone">{fmtSecs(elapsed)}</span>
              <PlayingCardStatic card={deck[i]} large />
              <span className="tabular text-xs text-ash-500">
                {i + 1}/{deck.length} · tap for the next card
              </span>
            </button>
          )}

          {phase === "answer" && (
            <div className="w-full">
              <p className="mb-1 text-center font-display text-base font-bold">Final count?</p>
              <p className="tabular mb-3 text-center text-xs text-ash-500">Time {fmtSecs(elapsed)}</p>
              <CountPad value={entry} onChange={setEntry} onSubmit={submit} />
            </div>
          )}

          {phase === "result" && grade && (
            <div className="text-center">
              <p className={`font-display text-2xl font-black ${grade.ok ? "text-emerald-300" : "text-ember-300"}`}>
                {grade.ok ? `✓ ${fmtCount(answer)} in ${fmtSecs(elapsed)}` : `The count was ${fmtCount(answer)}`}
              </p>
              {!grade.ok && <p className="mt-1 text-sm text-ash-400">You said {fmtCount(Number(entry))}. Time doesn’t count on a miss.</p>}
              {burned && (
                <div className="mt-4 flex flex-col items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-ash-500">Burned card</span>
                  <PlayingCardStatic card={burned} />
                  <p className="max-w-xs text-xs text-ash-400">
                    {answer > 0 ? "Count ended positive: a high card (10 or ace) was missing." : answer < 0 ? "Count ended negative: a low card (2–6) was missing." : "Count ended at 0: the missing card was a 7, 8 or 9."}
                  </p>
                </div>
              )}
              <button onClick={start} className="btn-fire mt-5 h-12 rounded-xl px-8 text-sm font-bold">
                Again <kbd className="ml-1 hidden rounded bg-ash-950/20 px-1.5 py-0.5 font-mono text-[10px] sm:inline">Enter</kbd>
              </button>
            </div>
          )}
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        <div className="panel rounded-3xl p-5">
          <h2 className="font-display text-sm font-bold">Variant</h2>
          <div className="mt-3">
            <Segmented
              label="Deck variant"
              value={variant}
              onChange={setVariant}
              options={[
                { id: "full", label: "Full deck", disabled: phase === "run" },
                { id: "burn", label: "Burn one", disabled: phase === "run" },
              ]}
            />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ash-500">
            Benchmarks: under 30 seconds is solid, under 20 is casino-ready. Accuracy first; speed comes from seeing cards in cancelling pairs.
          </p>
        </div>
      </aside>
    </div>
  );
}
