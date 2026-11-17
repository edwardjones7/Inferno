"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Segmented } from "@/components/ui";
import { betUnits, countRecord, edgeAt, fmtCount, gradeTrueCount, trueCountSpot, type CountGrade, type TrueCountSpot } from "@/lib/blackjack/counting";
import { play } from "@/lib/sound";
import { recordDrills } from "@/lib/store";
import { EMPTY_TALLY, Pill, tallied, TallyStrip, useKeys } from "./shared";

type Show = "number" | "tray";

export function TrueCountDrill() {
  const [show, setShow] = useState<Show>("number");
  const [spot, setSpot] = useState<(TrueCountSpot & { n: number }) | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [grade, setGrade] = useState<CountGrade | null>(null);
  const [tally, setTally] = useState(EMPTY_TALLY);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const next = useCallback(() => {
    clearTimeout(timer.current);
    setSpot((prev) => ({ ...trueCountSpot(Math.random), n: (prev?.n ?? 0) + 1 }));
    setPicked(null);
    setGrade(null);
  }, []);

  useEffect(() => {
    queueMicrotask(next);
    return () => clearTimeout(timer.current);
  }, [next]);

  const answer = (v: number) => {
    if (!spot || grade) return;
    const g = gradeTrueCount(spot, v);
    setPicked(v);
    setGrade(g);
    setTally((t) => tallied(t, g.ok));
    play(g.ok ? "chip" : "lose");
    recordDrills([countRecord(spot, g)]);
    if (g.ok) timer.current = setTimeout(next, 1400);
  };

  useKeys((key, e) => {
    if (!spot) return;
    const n = Number(key);
    if (!grade && n >= 1 && n <= spot.choices.length) {
      e.preventDefault();
      answer(spot.choices[n - 1]);
    } else if (grade && (key === "Enter" || key === " ")) {
      e.preventDefault();
      next();
    }
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <TallyStrip t={tally}>
          <Pill label="Best streak" value={String(tally.best)} />
        </TallyStrip>

        <div className="felt relative overflow-hidden rounded-[28px] px-4 pb-6 pt-5 sm:rounded-[40px] sm:px-8">
          <AnimatePresence mode="wait">
            {spot && (
              <motion.div
                key={spot.n}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center sm:gap-10"
              >
                <div className="text-center">
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-ash-500">Running count</span>
                  <p className="tabular mt-1 font-display text-6xl font-black molten-text">{fmtCount(spot.running)}</p>
                </div>
                <Tray spot={spot} showNumber={show === "number"} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="panel mt-4 rounded-3xl p-4 sm:p-5">
          <p className="mb-3 text-center text-xs text-ash-500">True count = running count ÷ decks remaining, rounded down.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {spot?.choices.map((c, i) => {
              const isCorrect = grade && c === spot.answer;
              const isWrong = grade && !grade.ok && c === picked;
              return (
                <button
                  key={c}
                  disabled={!!grade}
                  onClick={() => answer(c)}
                  className={`tabular flex h-16 items-center justify-center gap-2 rounded-xl font-display text-2xl font-bold transition-all ${
                    isCorrect ? "bg-emerald-500 text-ash-950 ring-2 ring-emerald-300" : isWrong ? "bg-ember-700 text-bone ring-2 ring-ember-400" : "btn-ash"
                  } ${grade && !isCorrect && !isWrong ? "opacity-40" : ""}`}
                >
                  {fmtCount(c)}
                  <kbd className="hidden rounded bg-ash-950/30 px-1.5 py-0.5 font-mono text-[10px] font-normal sm:inline">{i + 1}</kbd>
                </button>
              );
            })}
          </div>
          <div className="mt-3 min-h-[60px]" aria-live="polite">
            {grade && spot && (
              <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
                <p className="flex-1 text-sm text-ash-300">
                  <span className={`font-bold ${grade.ok ? "text-emerald-300" : "text-ember-100"}`}>{grade.ok ? "✓ " : ""}{grade.why}</span>{" "}
                  Bet {betUnits(spot.answer)} unit{betUnits(spot.answer) === 1 ? "" : "s"} here (edge ≈ {edgeAt(spot.answer) > 0 ? "+" : ""}
                  {edgeAt(spot.answer)}%).
                </p>
                {!grade.ok && (
                  <button onClick={next} className="btn-fire h-10 shrink-0 rounded-xl px-5 text-sm font-bold">
                    Next <kbd className="ml-1 hidden rounded bg-ash-950/20 px-1.5 py-0.5 font-mono text-[10px] sm:inline">Enter</kbd>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        <div className="panel rounded-3xl p-5">
          <h2 className="font-display text-sm font-bold">Decks remaining</h2>
          <div className="mt-3">
            <Segmented
              label="How decks remaining is shown"
              value={show}
              onChange={setShow}
              options={[
                { id: "number", label: "Show number" },
                { id: "tray", label: "Eyeball tray" },
              ]}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ash-500">
            At a real table nobody tells you. Read the discard tray (decks played) and subtract from the six-deck shoe, to the nearest half deck.
          </p>
        </div>
        <BetRamp />
      </aside>
    </div>
  );
}

/** Discard tray beside the shoe: played cards stack up from the bottom, half-deck ticks on the side. */
function Tray({ spot, showNumber }: { spot: TrueCountSpot; showNumber: boolean }) {
  const played = spot.decks - spot.decksRemaining;
  const H = 168;
  const perDeck = H / spot.decks;
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-ash-500">Discard tray</span>
      <div className="mt-2 flex items-end gap-2">
        <div className="relative w-16 overflow-hidden rounded-md bg-ash-950/80 ring-1 ring-ash-600" style={{ height: H }} aria-hidden>
          <div
            className="absolute inset-x-1 bottom-1 rounded-sm"
            style={{
              height: Math.max(2, played * perDeck - 2),
              background: "repeating-linear-gradient(0deg, #f6ecdf 0 1px, #d8c6b2 1px 2px)",
              boxShadow: "0 0 14px -4px rgba(255,90,31,.6)",
            }}
          />
        </div>
        <div className="relative w-6" style={{ height: H }} aria-hidden>
          {Array.from({ length: spot.decks * 2 + 1 }, (_, k) => (
            <span
              key={k}
              className={`absolute left-0 h-px ${k % 2 === 0 ? "w-3 bg-ash-400" : "w-1.5 bg-ash-600"}`}
              style={{ bottom: k * (perDeck / 2) }}
            />
          ))}
        </div>
      </div>
      <p className="tabular mt-2 text-sm font-bold text-bone">
        {showNumber ? `${spot.decksRemaining} deck${spot.decksRemaining === 1 ? "" : "s"} left` : `of ${spot.decks} decks`}
      </p>
      <span className="sr-only">{`${played} decks played, ${spot.decksRemaining} remaining`}</span>
    </div>
  );
}

export function BetRamp() {
  const rows = [1, 2, 3, 4, 5, 6, 7];
  return (
    <div className="panel rounded-3xl p-5">
      <h2 className="font-display text-sm font-bold">Bet ramp (1–12 units)</h2>
      <table className="tabular mt-3 w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-ash-500">
            <th className="pb-1 font-bold">True count</th>
            <th className="pb-1 font-bold">Bet</th>
            <th className="pb-1 text-right font-bold">Edge</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t} className="border-t border-ash-800">
              <td className="py-1">{t === 1 ? "≤ +1" : t === 7 ? "+7 or more" : fmtCount(t)}</td>
              <td className="py-1 font-bold text-bone">{betUnits(t)}u</td>
              <td className={`py-1 text-right ${edgeAt(t) > 0 ? "text-emerald-300" : "text-ash-400"}`}>
                {t === 1 ? "≈ 0%" : `+${edgeAt(t)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-relaxed text-ash-500">Each +1 of true count is worth roughly +0.5% to the player.</p>
    </div>
  );
}
