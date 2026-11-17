"use client";

/**
 * Today's spaced-repetition reviews: every spot you've missed that is due again. Blackjack
 * chart cells and poker concepts are re-dealt here (fresh cards, same concept); counting
 * spots link out to the counting trainer. Answers go through `recordDrills`, which
 * reschedules each card (right → further out, wrong → tomorrow).
 */
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { IconCheck, IconFlame, IconReview } from "@/components/icons";
import { Eyebrow, Meter } from "@/components/ui";
import { gradeSpot, type Decision } from "@/lib/blackjack/coach";
import { spotFromKey, spotLegal, type DrillSpot } from "@/lib/blackjack/drill";
import { DEFAULT_RULES, type ActionType } from "@/lib/blackjack/engine";
import type { Move } from "@/lib/blackjack/strategy";
import { isCountingKind, leakHref } from "@/lib/leak-links";
import { genPokerForKey, gradePoker, type PokerGrade, type PokerSpot } from "@/lib/poker/drills";
import { play } from "@/lib/sound";
import { dueCards, type SrsCard } from "@/lib/srs";
import { getProgress, recordDrills, today, useHydrated } from "@/lib/store";
import { BlackjackPuzzle, PokerPuzzle } from "../daily/daily-puzzles";

type Item =
  | { card: SrsCard; game: "blackjack"; spot: DrillSpot; legal: ActionType[] }
  | { card: SrsCard; game: "poker"; spot: PokerSpot };

type Graded = { game: "blackjack"; d: Decision } | { game: "poker"; g: PokerGrade & { answer: string } };

/** Re-deal each due card; anything we can't rebuild inline goes to the "elsewhere" list. */
function buildSession(): { items: Item[]; elsewhere: SrsCard[] } {
  const items: Item[] = [];
  const elsewhere: SrsCard[] = [];
  for (const card of dueCards(getProgress().srs, today()).slice(0, 30)) {
    if (card.game === "poker") {
      const spot = genPokerForKey(card.key, Math.random);
      if (spot) items.push({ card, game: "poker", spot });
      else elsewhere.push(card);
      continue;
    }
    const spot = isCountingKind(card.kind) ? null : spotFromKey(card.key, Math.random);
    const legal = spot ? spotLegal(spot.cards, spot.up, DEFAULT_RULES) : [];
    if (spot && legal.length) items.push({ card, game: "blackjack", spot, legal });
    else elsewhere.push(card);
  }
  return { items, elsewhere };
}

export function ReviewQueue() {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="mx-auto mt-10 h-96 max-w-2xl animate-pulse rounded-3xl bg-ash-900" />;
  return <Session />;
}

function Session() {
  // snapshot once: answering reschedules cards, which must not reshuffle the session
  const [{ items, elsewhere }] = useState(buildSession);
  const [i, setI] = useState(0);
  const [graded, setGraded] = useState<Graded | null>(null);
  const [right, setRight] = useState(0);
  const item = items[i] as Item | undefined;

  const answerBlackjack = (it: Extract<Item, { game: "blackjack" }>, move: Move) => {
    const d = gradeSpot(it.spot.cards, it.spot.up, it.legal, DEFAULT_RULES, move);
    setGraded({ game: "blackjack", d });
    // grade against the stored key so the card itself is rescheduled
    recordDrills([{ game: "blackjack", key: it.card.key, label: d.label, kind: d.kind, correct: d.correct, ok: d.ok, cost: d.cost }]);
    finish(d.ok);
  };

  const answerPoker = (it: Extract<Item, { game: "poker" }>, id: string) => {
    const g = gradePoker(it.spot, id);
    setGraded({ game: "poker", g: { ...g, answer: id } });
    recordDrills([{ game: "poker", key: it.card.key, label: g.label, kind: it.spot.kind, correct: g.correct, ok: g.ok, cost: g.cost }]);
    finish(g.ok);
  };

  const finish = (ok: boolean) => {
    play(ok ? "chip" : "lose");
    if (ok) setRight((r) => r + 1);
  };

  const next = () => {
    setGraded(null);
    setI((n) => n + 1);
    play("click");
  };

  const total = items.length;
  const done = i >= total;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-10 pt-5 sm:px-6 lg:pt-10">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Eyebrow>Review queue</Eyebrow>
          <h1 className="mt-1 font-display text-2xl font-black sm:text-3xl">{total ? "Spots you missed, back for another try" : "Nothing due today"}</h1>
        </div>
        {total > 0 && (
          <span className="tabular shrink-0 text-sm font-bold text-ash-300">
            {Math.min(i + 1, total)}/{total}
          </span>
        )}
      </div>
      {total > 0 && <Meter value={(Math.min(i + (graded ? 1 : 0), total) / total) * 100} className="mt-3" />}

      {!total ? (
        <Empty elsewhere={elsewhere.length} />
      ) : done ? (
        <Summary right={right} total={total} />
      ) : item ? (
        <div className="mt-5">
          <AnimatePresence mode="wait">
            <motion.div key={i} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
              <p className="mb-2 text-sm font-bold text-ash-300">
                {item.card.label}
                <span className="font-normal text-ash-500">
                  {" "}
                  · missed {item.card.lapses}× {item.card.reps ? `· ${item.card.reps} clean review${item.card.reps > 1 ? "s" : ""}` : ""}
                </span>
              </p>
              {item.game === "blackjack" ? (
                <BlackjackPuzzle pz={item} graded={graded?.game === "blackjack" ? graded.d : null} onAnswer={(m) => answerBlackjack(item, m)} />
              ) : (
                <PokerPuzzle pz={item} graded={graded?.game === "poker" ? graded.g : null} onAnswer={(id) => answerPoker(item, id)} />
              )}
            </motion.div>
          </AnimatePresence>
          {graded && (
            <>
              <NextReview ok={graded.game === "blackjack" ? graded.d.ok : graded.g.ok} />
              <button onClick={next} className="btn-fire mt-4 h-14 w-full rounded-2xl font-display text-sm font-bold uppercase tracking-wider">
                {i + 1 >= total ? "Finish" : "Next spot"}
              </button>
            </>
          )}
        </div>
      ) : null}

      {elsewhere.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-sm font-bold text-ash-300">Also due, practise these in their trainer</h2>
          <ul className="panel mt-2 divide-y divide-ash-800 overflow-hidden rounded-3xl">
            {elsewhere.map((c) => (
              <li key={`${c.game}|${c.key}`}>
                <Link href={leakHref(c)} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-ash-850">
                  <span className="truncate font-semibold">{c.label}</span>
                  <span className="shrink-0 text-xs text-ember-300">Practise →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function NextReview({ ok }: { ok: boolean }) {
  return (
    <p className="mt-2 text-center text-xs text-ash-500">
      {ok ? "Nice. This spot comes back in a few days, then less and less often." : "It'll come back tomorrow. Read the reason above, it's the part that sticks."}
    </p>
  );
}

function Empty({ elsewhere }: { elsewhere: number }) {
  return (
    <div className="panel mt-6 rounded-[32px] p-6 text-center sm:p-8">
      <IconReview className="mx-auto h-12 w-12 text-ash-500" />
      <p className="mt-3 text-sm text-ash-400">
        {elsewhere
          ? "Everything due today lives in another trainer, listed below."
          : "When you miss a spot in a drill, a puzzle or at the table, it lands here the next day and keeps coming back, further apart each time, until you get it right consistently."}
      </p>
      <Link href="/train/" className="btn-fire mt-5 inline-grid h-12 place-items-center rounded-2xl px-6 font-bold">
        Back to training
      </Link>
    </div>
  );
}

function Summary({ right, total }: { right: number; total: number }) {
  return (
    <div className="panel mt-6 rounded-[32px] p-6 text-center sm:p-8">
      {right === total ? (
        <IconFlame className="mx-auto h-14 w-14 animate-flicker text-ember-400 drop-shadow-[0_0_20px_rgba(255,122,31,0.8)]" />
      ) : (
        <IconCheck className="mx-auto h-12 w-12 text-ember-300" />
      )}
      <h2 className="mt-3 font-display text-3xl font-black">
        <span className="molten-text">
          {right}/{total}
        </span>{" "}
        recalled
      </h2>
      <p className="mt-2 text-sm text-ash-400">
        {right === total ? "Clean queue. Those spots won't be back for a while." : "The misses come back tomorrow. The rest are pushed further out."}
      </p>
      <Link href="/train/" className="btn-fire mt-6 inline-grid h-12 place-items-center rounded-2xl px-6 font-bold">
        Keep training
      </Link>
    </div>
  );
}
