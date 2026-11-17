"use client";

import Link from "next/link";
import { IconBolt, IconCalendar, IconChevron, IconFlame, IconReview, IconSpade, IconTrain } from "@/components/icons";
import { Meter, PageHeader, Ring, SectionTitle, Sparkline } from "@/components/ui";
import { DRILL_CATEGORIES } from "@/lib/blackjack/drill";
import { MOVE_LABEL, type Move } from "@/lib/blackjack/strategy";
import { nextLesson, trackProgress, TRACK_IDS, TRACKS } from "@/lib/learn";
import { isCountingKind, leakHref } from "@/lib/leak-links";
import { POKER_DRILLS } from "@/lib/poker/drills";
import { ratingTitle } from "@/lib/rating";
import { dueCards } from "@/lib/srs";
import { accuracy, leaksOf, today, useHydrated, useProgress } from "@/lib/store";

export function TrainHub() {
  const p = useProgress();
  const hydrated = useHydrated();
  const done = hydrated ? (p.daily[today()] ?? []).length : 0;
  const t = p.ratings.training;
  const bj = p.drills.filter((d) => d.game === "blackjack" && !isCountingKind(d.kind));
  const counting = p.drills.filter((d) => d.game === "blackjack" && isCountingKind(d.kind));
  const due = hydrated ? dueCards(p.srs, today()).length : 0;
  const pk = p.drills.filter((d) => d.game === "poker");
  const leaks = hydrated ? leaksOf(p, undefined, 5) : [];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-5 sm:px-6 lg:pt-10">
      <PageHeader eyebrow="Train" title="Sharpen every decision" />

      <div className="grid gap-3 md:grid-cols-[1.2fr_1fr]">
        <Link href="/train/daily/" className="panel pressable relative overflow-hidden rounded-[28px] p-5 ring-1 ring-ember-500/30 sm:p-6">
          <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[radial-gradient(closest-side,rgba(255,90,31,0.3),transparent)]" />
          <div className="relative flex items-center gap-5">
            <Ring value={done / 3} size={84} stroke={7}>
              <span className="tabular font-display text-xl font-bold">{done}/3</span>
            </Ring>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-ember-400">
                <IconCalendar className="h-3.5 w-3.5" /> Daily puzzles
              </p>
              <h2 className="mt-1 font-display text-xl font-black">{done === 3 ? "Done for today" : "Today's three spots"}</h2>
              <p className="mt-1 text-sm text-ash-400">One blackjack hand and two poker decisions. Solve them to keep your streak alive.</p>
            </div>
          </div>
        </Link>

        <div className="panel rounded-[28px] p-5 sm:p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ash-500">Training rating</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="tabular font-display text-4xl font-black">{hydrated ? t.r : "–"}</span>
            <span className="text-sm font-bold text-ember-400">{hydrated ? ratingTitle(t.r) : ""}</span>
          </div>
          <Sparkline points={hydrated ? t.history : []} className="mt-2 h-12 w-full" />
          <p className="tabular mt-1 text-[11px] text-ash-500">
            {hydrated ? `${t.games} answers · peak ${t.peak}` : " "}
          </p>
        </div>
      </div>

      <section className="mt-8">
        <SectionTitle title="Learn" href="/train/learn/" cta="All lessons" />
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_0.9fr]">
          {TRACK_IDS.map((id) => {
            const track = TRACKS[id];
            const next = hydrated ? nextLesson(p, id) : track.lessons[0];
            const { done, total } = hydrated ? trackProgress(p, id) : { done: 0, total: track.lessons.length };
            return (
              <Link key={id} href={next ? `/train/learn/${next.id}/` : "/train/learn/"} className="panel pressable flex min-w-0 items-center gap-4 rounded-[28px] p-5">
                <Ring value={done / total} size={60} stroke={6}>
                  <span className="tabular text-xs font-bold">
                    {done}/{total}
                  </span>
                </Ring>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-ember-400">{track.title}</span>
                  <span className="mt-0.5 block truncate font-display text-base font-bold">{next ? next.title : "Track complete"}</span>
                  <span className="block truncate text-xs text-ash-400">{next ? `${next.minutes} min · ${next.blurb}` : "Revisit any lesson from the full list."}</span>
                </span>
                <IconChevron className="h-5 w-5 shrink-0 text-ash-500" />
              </Link>
            );
          })}
          <Link
            href="/train/queue/"
            className={`panel pressable flex min-w-0 items-center gap-4 rounded-[28px] p-5 ${due ? "ring-1 ring-ember-500/40" : ""}`}
          >
            <span className="grid h-[60px] w-[60px] shrink-0 place-items-center rounded-2xl bg-ash-850 ring-1 ring-ash-700">
              <span className={`tabular font-display text-2xl font-black ${due ? "text-ember-300" : "text-ash-500"}`}>{due}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-ember-400">
                <IconReview className="h-3.5 w-3.5" /> Review queue
              </span>
              <span className="mt-0.5 block font-display text-base font-bold">{due ? `${due} spot${due === 1 ? "" : "s"} due` : "Nothing due"}</span>
              <span className="block text-xs text-ash-400">Missed spots come back after 1, 3, 7… days until they stick.</span>
            </span>
          </Link>
        </div>
      </section>

      <section className="mt-8 grid gap-3 md:grid-cols-2">
        <DrillCard
          href="/train/blackjack/"
          icon={<IconTrain className="h-6 w-6" />}
          title="Blackjack strategy"
          blurb="Opening decisions against every dealer upcard, for four rule sets."
          acc={hydrated ? accuracy(bj) : null}
          count={bj.length}
          topics={DRILL_CATEGORIES.filter((c) => c.id !== "all" && c.id !== "leaks").map((c) => c.label)}
        />
        <DrillCard
          href="/train/poker/"
          icon={<IconSpade className="h-6 w-6" />}
          title="Poker fundamentals"
          blurb="Pre-flop ranges and pot odds through board texture, c-bets, sizing and hand reading."
          acc={hydrated ? accuracy(pk) : null}
          count={pk.length}
          topics={POKER_DRILLS.map((d) => d.label)}
        />
        <DrillCard
          href="/train/counting/"
          icon={<IconFlame className="h-6 w-6" />}
          title="Card counting"
          blurb="Hi-Lo running and true count, deck countdowns, and the index plays that change with the count."
          acc={hydrated ? accuracy(counting) : null}
          count={counting.length}
          topics={["Running count", "Deck countdown", "True count", "Index plays"]}
        />
        <Link href="/train/charts/" className="panel pressable flex flex-col rounded-[28px] p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-ember-500/25 to-ember-800/20 text-ember-300 ring-1 ring-ember-500/30">
              <IconBolt className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-bold">Strategy charts</h3>
              <p className="text-xs text-ash-400">Reference, colored by your own accuracy</p>
            </div>
            <IconChevron className="h-5 w-5 text-ash-500" />
          </div>
          <p className="mt-4 text-sm text-ash-300">
            The full basic-strategy chart for each table and the opening range for every seat. Tap any cell for the reason, the EV of each play, and a drill.
          </p>
        </Link>
      </section>

      <section className="mt-8">
        <SectionTitle title="Fix your leaks" href="/profile/" cta="Full report" />
        {leaks.length ? (
          <ul className="panel divide-y divide-ash-800 overflow-hidden rounded-3xl">
            {leaks.map((l) => {
              const href = leakHref(l);
              const correct = l.game === "blackjack" && !isCountingKind(l.kind) ? (l.correct === "decline" ? "decline" : (MOVE_LABEL[l.correct as Move] ?? l.correct).toLowerCase()) : l.correct;
              return (
                <li key={`${l.game}|${l.key}|${l.correct}`}>
                  <Link href={href} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-ash-850 sm:px-5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ash-850 text-ember-300 ring-1 ring-ash-700">
                      {l.game === "poker" ? <IconSpade className="h-4 w-4" /> : <IconTrain className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{l.key === "insurance" ? "Taking insurance" : l.label}</span>
                      <span className="block text-xs text-ash-400">Right play: {correct}</span>
                    </span>
                    <span className="tabular shrink-0 text-xs text-ember-300">
                      {l.misses}/{l.seen}
                    </span>
                    <IconChevron className="h-4 w-4 shrink-0 text-ash-500" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="panel rounded-3xl px-5 py-8 text-center text-sm text-ash-400">
            No leaks yet. Run a drill or play with the coach on, and the spots you miss most show up here.
          </div>
        )}
      </section>
    </div>
  );
}

function DrillCard({
  href,
  icon,
  title,
  blurb,
  acc,
  count,
  topics,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  blurb: string;
  acc: number | null;
  count: number;
  topics: string[];
}) {
  return (
    <Link href={href} className="panel pressable flex flex-col rounded-[28px] p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-ember-500/25 to-ember-800/20 text-ember-300 ring-1 ring-ember-500/30">{icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-bold">{title}</h3>
          <p className="tabular text-xs text-ash-400">{acc === null ? "Not started" : `${acc}% accuracy · ${count} answers`}</p>
        </div>
        <IconChevron className="h-5 w-5 text-ash-500" />
      </div>
      <Meter value={acc ?? 0} className="mt-4" />
      <p className="mt-3 text-sm text-ash-300">{blurb}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {topics.map((t) => (
          <span key={t} className="rounded-full bg-ash-900 px-2.5 py-1 text-[11px] font-semibold text-ash-400 ring-1 ring-ash-700">
            {t}
          </span>
        ))}
      </div>
    </Link>
  );
}
