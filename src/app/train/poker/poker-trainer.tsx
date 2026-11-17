"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PlayingCardStatic } from "@/components/playing-card-static";
import { ResponseChart, ResponseLegend } from "@/components/response-chart";
import { cardLabel, type Card } from "@/lib/blackjack/cards";
import {
  EQUITY_BUCKETS,
  genPoker,
  genPreflop,
  genVs3bet,
  genVsOpen,
  gradePoker,
  HANDREAD_BUCKETS,
  POKER_DRILLS,
  responsePrompt,
  type PokerDrill,
  type PokerGrade,
  type PokerSpot,
} from "@/lib/poker/drills";
import { outs } from "@/lib/poker/equity";
import { describe } from "@/lib/poker/eval";
import { flopInfo, HAND_CLASS_NAME, handClass, LINES, TEXTURE_NAME, TEXTURES } from "@/lib/poker/postflop";
import { isPosition, isSeat, SEAT_NAME, SEATS, vs3betChart, vsOpenChart, type Seat } from "@/lib/poker/preflop";
import { BEHIND, GRID, handCode, OPEN_RANGES, POSITION_NAME, POSITIONS, rangePercent, type Position } from "@/lib/poker/ranges";
import { play } from "@/lib/sound";
import { bestStreak, leaksOf, recordDrills, useProgress } from "@/lib/store";

interface Choice {
  id: string;
  label: string;
  key: string;
}

export const CHOICES: Record<PokerDrill, Choice[]> = {
  preflop: [
    { id: "raise", label: "Raise", key: "R" },
    { id: "fold", label: "Fold", key: "F" },
  ],
  vsopen: [
    { id: "3bet", label: "3-bet", key: "3" },
    { id: "call", label: "Call", key: "C" },
    { id: "fold", label: "Fold", key: "F" },
  ],
  vs3bet: [
    { id: "4bet", label: "4-bet", key: "4" },
    { id: "call", label: "Call", key: "C" },
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
  texture: TEXTURES.map((t, i) => ({ id: t, label: TEXTURE_NAME[t], key: String(i + 1) })),
  handread: HANDREAD_BUCKETS.map((b, i) => ({ id: b.id, label: b.label, key: String(i + 1) })),
  sizing: [
    { id: "check", label: "Check", key: "C" },
    { id: "33", label: "⅓ pot", key: "1" },
    { id: "66", label: "⅔ pot", key: "2" },
    { id: "100", label: "Pot+", key: "3" },
  ],
  cbet: [
    { id: "bet", label: "C-bet", key: "B" },
    { id: "check", label: "Check", key: "C" },
  ],
};

const FAVOR_CHOICES: Choice[] = [
  { id: "raiser", label: "Pre-flop raiser", key: "R" },
  { id: "caller", label: "Big blind (caller)", key: "C" },
];

/** Answer buttons for one spot: the texture drill asks two kinds of question. */
export const choicesFor = (spot: PokerSpot): Choice[] => (spot.kind === "texture" && spot.q === "favor" ? FAVOR_CHOICES : CHOICES[spot.kind]);

/** Tailwind grid columns for a row of answer buttons. */
export const choiceCols = (n: number) => (n === 2 ? "grid-cols-2" : n === 5 ? "grid-cols-2 sm:grid-cols-5" : n === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4");

/** Drills that move on by themselves after a right answer (the rest have numbers worth reading). */
const AUTO_NEXT: PokerDrill[] = ["preflop", "vsopen", "vs3bet", "equity", "texture"];

const GROUPS = [
  { id: "pre", label: "Pre-flop & maths" },
  { id: "post", label: "Post-flop" },
] as const;


/**
 * `initialPos` pins the opening-ranges drill to one seat (from `?pos=BTN`). For the response
 * drills, `?pos=` is your seat and `?vs=` the opener (facing an open) or the 3-bettor.
 */
export function PokerTrainer({ initialDrill = "preflop", initialPos, initialVs }: { initialDrill?: PokerDrill; initialPos?: string; initialVs?: string }) {
  const [drill, setDrill] = useState<PokerDrill>(initialDrill);
  const [lockPos, setLockPos] = useState<Position | null>(initialDrill === "preflop" && isPosition(initialPos) ? initialPos : null);
  const [lockSpot, setLockSpot] = useState<{ pos?: string; vs?: string } | null>(
    (initialDrill === "vsopen" || initialDrill === "vs3bet") && (initialPos || initialVs) ? { pos: initialPos, vs: initialVs } : null,
  );
  const [spot, setSpot] = useState<(PokerSpot & { n: number }) | null>(null);
  const [grade, setGrade] = useState<(PokerGrade & { answer: string }) | null>(null);
  const [session, setSession] = useState({ n: 0, correct: 0, streak: 0, best: 0 });
  const progress = useProgress();
  const stats = useMemo(() => {
    const mine = progress.drills.filter((d) => d.game === "poker");
    const byDrill = POKER_DRILLS.map((d) => {
      const rows = mine.filter((r) => r.kind === d.id);
      return { drill: d.id, seen: rows.length, correct: rows.filter((r) => r.ok).length };
    });
    return { byDrill, leaks: leaksOf(progress, "poker", 8), bestStreak: bestStreak(mine) };
  }, [progress]);
  const [chartPos, setChartPos] = useState<Position>(isPosition(initialPos) ? initialPos : "BTN");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);


  const deal = useCallback((kind: PokerDrill) => {
    clearTimeout(timer.current);
    const s =
      kind === "preflop" && lockPos
        ? genPreflop(Math.random, lockPos)
        : kind === "vsopen" && lockSpot
          ? genVsOpen(Math.random, { hero: isSeat(lockSpot.pos) ? lockSpot.pos : undefined, opener: isPosition(lockSpot.vs) ? lockSpot.vs : undefined })
          : kind === "vs3bet" && lockSpot
            ? genVs3bet(Math.random, { hero: isPosition(lockSpot.pos) ? lockSpot.pos : undefined, villain: isSeat(lockSpot.vs) ? lockSpot.vs : undefined })
            : genPoker(kind, Math.random);
    setSpot((prev) => ({ ...s, n: (prev?.n ?? 0) + 1 }));
    setGrade(null);
    if (s.kind === "preflop") setChartPos(s.pos);
  }, [lockPos, lockSpot]);

  useEffect(() => {
    queueMicrotask(() => deal(initialDrill));
    return () => clearTimeout(timer.current);
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
      recordDrills([{ game: "poker", key: g.key, label: g.label, kind: spot.kind, correct: g.correct, ok: g.ok, ...(g.cost ? { cost: g.cost } : {}) }]);
      if (g.ok && AUTO_NEXT.includes(drill)) timer.current = setTimeout(() => deal(drill), 900);
    },
    [spot, grade, drill, deal],
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
      const c = (spot ? choicesFor(spot) : CHOICES[drill]).find((x) => x.key.toLowerCase() === k);
      if (c) {
        e.preventDefault();
        answer(c.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, grade, deal, drill, spot]);

  const pickDrill = (d: PokerDrill) => {
    setDrill(d);
    deal(d);
  };

  const acc = session.n ? Math.round((session.correct / session.n) * 100) : 0;
  const choices = spot ? choicesFor(spot) : CHOICES[drill];
  const drillStats = useMemo(() => Object.fromEntries(stats.byDrill.map((d) => [d.drill, d])), [stats]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        {/* drill tabs, grouped so eight drills still fit two short rows on a phone */}
        <div className="mb-3 space-y-2" role="tablist" aria-label="Drill">
          {GROUPS.map((g) => (
            <div key={g.id}>
              <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-ash-500">{g.label}</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {POKER_DRILLS.filter((d) => d.group === g.id).map((d) => (
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
            </div>
          ))}
        </div>
        {drill === "preflop" && lockPos && (
          <div className="mb-3 flex items-center gap-2 text-xs text-ash-300">
            <span className="rounded-full bg-ember-500/15 px-3 py-1 font-bold text-ember-200 ring-1 ring-ember-500/40">Only {POSITION_NAME[lockPos].toLowerCase()} spots</span>
            <button onClick={() => setLockPos(null)} className="text-ash-400 underline underline-offset-2 hover:text-bone">
              All seats
            </button>
          </div>
        )}

        {(drill === "vsopen" || drill === "vs3bet") && lockSpot && (
          <div className="mb-3 flex items-center gap-2 text-xs text-ash-300">
            <span className="rounded-full bg-ember-500/15 px-3 py-1 font-bold text-ember-200 ring-1 ring-ember-500/40">
              Only {lockSpot.pos ?? "any seat"}
              {lockSpot.vs ? ` vs ${lockSpot.vs}` : ""} spots
            </span>
            <button onClick={() => setLockSpot(null)} className="text-ash-400 underline underline-offset-2 hover:text-bone">
              All spots
            </button>
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <Pill label="Answered" value={String(session.n)} />
          <Pill label="Accuracy" value={session.n ? `${acc}%` : "–"} hot={session.n >= 5 && acc >= 90} />
          <Pill label="Streak" value={String(session.streak)} hot={session.streak >= 10} />
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
          <div className={`mt-3 grid gap-2 ${choiceCols(choices.length)}`}>
            {choices.map((c) => {
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
                  {!grade.ok && grade.cost ? <span className="mt-1 block font-semibold text-ember-300">This cost you ~{fmtBb(grade.cost)}.</span> : null}
                </p>
                <button onClick={() => deal(drill)} className="btn-fire h-10 shrink-0 rounded-xl px-5 text-sm font-bold">
                  Next <kbd className="ml-1 rounded bg-ash-950/20 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
                </button>
              </div>
            ) : (
              <p className="text-center text-xs text-ash-500">Keyboard: {choices.map((c) => c.key).join(" · ")}</p>
            )}
          </div>
        </div>
      </div>

      {/* sidebar */}
      <aside className="flex min-w-0 flex-col gap-4">
        {spot && (spot.kind === "vsopen" || spot.kind === "vs3bet") && <ResponsePanel spot={spot} reveal={grade ? handCode(spot.cards[0], spot.cards[1]) : null} />}
        {/* the opening chart only helps the other pre-flop drills */}
        {POKER_DRILLS.find((d) => d.id === drill)?.group === "pre" && drill !== "vsopen" && drill !== "vs3bet" && (<div className="panel rounded-3xl p-5">
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
        </div>)}

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
          {stats.bestStreak > 0 && <p className="mt-3 text-[11px] text-ash-500">Best streak ever: {stats.bestStreak}</p>}
        </div>

        <div className="panel rounded-3xl p-5">
          <h2 className="font-display text-sm font-bold">Your leaks</h2>
          {stats.leaks.length ? (
            <ul className="mt-3 space-y-1">
              {stats.leaks.map((l) => (
                <li key={`${l.key}|${l.correct}`} className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 text-xs">
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

export function Prompt({ spot }: { spot: PokerSpot }) {
  const text =
    spot.kind === "vsopen" || spot.kind === "vs3bet"
      ? responsePrompt(spot)
      : spot.kind === "preflop"
      ? `Folded to you in the ${POSITION_NAME[spot.pos].toLowerCase()} (${spot.pos}). Raise or fold?`
      : spot.kind === "potodds"
        ? `Pot is ${spot.pot}. Villain shoves ${spot.bet}. Call ${spot.bet} to win ${spot.pot + spot.bet}?`
        : spot.kind === "showdown"
          ? "All-in, cards on their backs. Who wins the pot?"
          : spot.kind === "equity"
            ? "All-in pre-flop. How often does your hand win (counting ties as half)?"
            : spot.kind === "texture"
              ? spot.q === "favor"
                ? "Button opened, big blind called. Whose range does this flop hit harder?"
                : "What kind of flop is this?"
              : spot.kind === "handread"
                ? "What share of villain's range is ahead of you right now?"
                : spot.kind === "sizing"
                  ? `You raised pre-flop and it's checked to you${spot.board.length >= 5 ? " on the river" : ""}. Pot ${spot.pot} bb. Your play?`
                  : `You opened the ${spot.pos}, the big blind called and checked. Pot ${spot.pot} bb. C-bet or check?`;
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

export function SpotView({ spot, grade }: { spot: PokerSpot; grade: PokerGrade | null }) {
  if (spot.kind === "vsopen" || spot.kind === "vs3bet") {
    const word: Record<string, string> = { "3bet": "3-bet", "4bet": "4-bet", call: "Call", fold: "Fold" };
    return (
      <div className="flex flex-col items-center gap-5">
        <ActionSeats spot={spot} />
        <Cards cards={spot.cards} label="Your hand" />
        {grade && (
          <span className="rounded-full bg-ash-950/80 px-3 py-1 text-xs font-bold text-ember-200 ring-1 ring-ash-700">
            {String(grade.detail?.code)} · {word[grade.correct] ?? grade.correct}
            {grade.detail?.mixed === "yes" ? " (mixed)" : ""}
          </span>
        )}
      </div>
    );
  }
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
  if (spot.kind === "texture") {
    const i = flopInfo(spot.board);
    return (
      <div className="flex flex-col items-center gap-5 py-6">
        <Cards cards={spot.board} label="Flop" />
        {grade && (
          <div className="flex flex-wrap justify-center gap-2">
            <Tag>{TEXTURE_NAME[i.texture]}</Tag>
            <Tag>{i.favors === "raiser" ? "Favours the raiser" : i.favors === "caller" ? "Favours the caller" : "Neutral"}</Tag>
          </div>
        )}
      </div>
    );
  }
  if (spot.kind === "handread") {
    const l = LINES[spot.line];
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="max-w-md text-center text-xs text-ash-300">{l.text}</p>
        <span className="max-w-md rounded-xl bg-ash-950/70 px-3 py-1.5 text-center font-mono text-[11px] leading-relaxed text-ember-200 ring-1 ring-ash-700">
          Villain&apos;s range: {l.notation}
        </span>
        <Cards cards={spot.board} label="Board" />
        <Cards cards={spot.hero} label={`You · ${describe([...spot.hero, ...spot.board]).name}`} />
        {grade && (
          <div className="w-full max-w-md">
            <Bar label={`Range ahead of you (${grade.detail?.beat} of ${grade.detail?.live} combos)`} value={Number(grade.detail?.share)} tone="ember" />
          </div>
        )}
      </div>
    );
  }
  if (spot.kind === "sizing" || spot.kind === "cbet") {
    const i = flopInfo(spot.board);
    const cls = handClass(spot.hero, spot.board);
    return (
      <div className="flex flex-col items-center gap-4">
        {spot.kind === "cbet" && <Tag>You opened {spot.pos} · big blind called</Tag>}
        <div className="flex flex-col items-center gap-1.5">
          <Cards cards={spot.board} label={spot.board.length >= 5 ? "River" : "Flop"} />
          <span className="tabular rounded-full bg-ash-950/80 px-3 py-1 text-xs font-bold text-ember-200 ring-1 ring-ember-500/40">
            Pot {spot.pot} bb · checked to you
          </span>
        </div>
        <Cards cards={spot.hero} label="You" />
        {grade && (
          <div className="flex w-full max-w-md flex-col items-center gap-2">
            <div className="flex flex-wrap justify-center gap-2">
              {spot.board.length < 5 && <Tag>{TEXTURE_NAME[i.texture]} flop</Tag>}
              <Tag>You have {HAND_CLASS_NAME[cls]}</Tag>
            </div>
            <div className="w-full">
              <Bar label="Equity vs big blind's range" value={Number(grade.detail?.equity)} tone="ember" />
            </div>
          </div>
        )}
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

const fmtBb = (x: number) => `${x >= 10 ? Math.round(x) : x.toFixed(1)} bb`;

function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-ash-950/80 px-3 py-1 text-xs font-bold text-ember-200 ring-1 ring-ash-700">{children}</span>;
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

/** The six seats with the betting so far: who opened, who 3-bet, who folded. */
function ActionSeats({ spot }: { spot: { kind: "vsopen"; hero: Seat; opener: Position } | { kind: "vs3bet"; hero: Position; villain: Seat } }) {
  const tag = (p: Seat): { text: string; state: "you" | "raise" | "folded" | "waiting" } => {
    if (spot.kind === "vsopen") {
      if (p === spot.hero) return { text: `You · ${p}`, state: "you" };
      if (p === spot.opener) return { text: `${p} · ${p === "SB" ? "3bb" : "2.5bb"}`, state: "raise" };
      return SEATS.indexOf(p) < SEATS.indexOf(spot.hero) ? { text: p, state: "folded" } : { text: p, state: "waiting" };
    }
    if (p === spot.hero) return { text: `You · ${p} · open`, state: "you" };
    if (p === spot.villain) return { text: `${p} · 3-bet`, state: "raise" };
    return { text: p, state: "folded" };
  };
  return (
    <div className="relative h-24 w-64 sm:w-80">
      <div className="absolute inset-x-6 inset-y-3 rounded-[999px] border border-ember-500/30 bg-ember-900/20" />
      {SEATS.map((p, i) => {
        const angle = Math.PI * (0.85 + (i / 5) * 1.3);
        const t = tag(p);
        return (
          <span
            key={p}
            className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${
              t.state === "you"
                ? "bg-ember-500 text-ash-950 shadow-[0_0_14px_rgba(255,90,31,0.8)]"
                : t.state === "raise"
                  ? "bg-sky-400 text-ash-950"
                  : t.state === "folded"
                    ? "bg-ash-900 text-ash-600 line-through"
                    : "bg-ash-800 text-ash-200 ring-1 ring-ash-600"
            }`}
            style={{ left: `${50 + Math.cos(angle) * 46}%`, top: `${50 + Math.sin(angle) * 42}%` }}
          >
            {t.text}
          </span>
        );
      })}
    </div>
  );
}

/** Sidebar chart for the response drills; the dealt hand is outlined once answered. */
function ResponsePanel({ spot, reveal }: { spot: { kind: "vsopen"; hero: Seat; opener: Position } | { kind: "vs3bet"; hero: Position; villain: Seat }; reveal: string | null }) {
  const vsOpen = spot.kind === "vsopen";
  const chart = vsOpen ? vsOpenChart(spot.hero, spot.opener)! : vs3betChart(spot.hero, spot.villain)!;
  const raiseLabel = vsOpen ? "3-bet" : "4-bet";
  const title = vsOpen ? `${SEAT_NAME[spot.hero]} vs ${spot.opener} open` : `${POSITION_NAME[spot.hero]} open vs ${spot.villain} 3-bet`;
  return (
    <div className="panel rounded-3xl p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-bold">{title}</h2>
        <span className="tabular shrink-0 text-xs text-ash-400">
          {raiseLabel} {Math.round(rangePercent(chart.raise))}% · call {Math.round(rangePercent(chart.call))}%
        </span>
      </div>
      <ResponseChart chart={chart} raiseLabel={raiseLabel} label={title} selected={reveal} small className="mt-3" />
      <ResponseLegend raiseLabel={raiseLabel} className="mt-2" />
      <p className="mt-2 text-[11px] leading-relaxed text-ash-500">{chart.spec.note}</p>
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
