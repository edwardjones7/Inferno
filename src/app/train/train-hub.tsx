"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconBolt, IconCalendar, IconCheck, IconChevron, IconFlame, IconLock, IconReview, IconSpade, IconTrain } from "@/components/icons";
import { ProBadge } from "@/components/pro/pro-badge";
import { Meter, PageHeader, Ring, SectionTitle, Sparkline } from "@/components/ui";
import { countingLocked, lessonLocked, paywallReason } from "@/lib/gates";
import { MOVE_LABEL, type Move } from "@/lib/blackjack/strategy";
import { lessonDone, lessonUnlocked, nextLesson, trackProgress, TRACK_IDS, TRACKS, type TrackId } from "@/lib/learn";
import { isCountingKind, leakHref } from "@/lib/leak-links";
import { openPaywall, useIsPro } from "@/lib/pro";
import { ratingTitle } from "@/lib/rating";
import { play } from "@/lib/sound";
import { dueCards } from "@/lib/srs";
import { accuracy, leaksOf, today, useHydrated, useProgress } from "@/lib/store";
import { LessonArt } from "./learn/lesson-art";

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
  const pro = useIsPro();

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-5 sm:px-6 lg:pt-10">
      <PageHeader eyebrow="School" title="Sharpen every decision" />

      {/* the lesson tracks lead the page, each fronted by the art of the lesson that's up next */}
      <div className="grid gap-3 md:grid-cols-2">
        {TRACK_IDS.map((id) => (
          <TrackHero key={id} track={id} hydrated={hydrated} />
        ))}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1.25fr_1fr_1fr]">
        <Link href="/train/daily/" className="panel pressable relative min-h-[120px] overflow-hidden rounded-3xl p-5 ring-1 ring-ember-500/30">
          <LessonArt id="pk-hand-reading" variant="backdrop" />
          <div className="relative flex items-center gap-4">
            <Ring value={done / 3} size={64} stroke={6}>
              <span className="tabular font-display text-base font-bold">{done}/3</span>
            </Ring>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 eyebrow">
                <IconCalendar className="h-3.5 w-3.5" /> Daily puzzles
              </p>
              <h2 className="mt-0.5 font-display text-lg font-black">{done === 3 ? "Done for today" : "Today's three spots"}</h2>
              <p className="text-xs text-ash-300">One blackjack hand, two poker decisions. Keeps your streak alive.</p>
            </div>
          </div>
        </Link>

        <div className="panel rounded-3xl p-5">
          <p className="caps-label">Training rating</p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="tabular font-display text-3xl font-black">{hydrated ? t.r : "–"}</span>
            <span className="text-sm font-bold text-ember-400">{hydrated ? ratingTitle(t.r) : ""}</span>
          </div>
          <Sparkline points={hydrated ? t.history : []} className="mt-1 h-9 w-full" />
          <p className="tabular mt-1 text-[11px] text-ash-500">{hydrated ? `${t.games} answers · peak ${t.peak}` : " "}</p>
        </div>

        <Link href="/train/queue/" className={`panel pressable flex min-w-0 items-center gap-4 rounded-3xl p-5 ${due ? "ring-1 ring-ember-500/40" : ""}`}>
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-ash-850 ring-1 ring-ash-700">
            <span className={`tabular font-display text-2xl font-black ${due ? "text-ember-300" : "text-ash-500"}`}>{due}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 eyebrow">
              <IconReview className="h-3.5 w-3.5" /> Review queue
            </span>
            <span className="mt-0.5 block font-display text-base font-bold">{due ? `${due} spot${due === 1 ? "" : "s"} due` : "Nothing due"}</span>
            <span className="block text-xs text-ash-400">Missed spots return after 1, 3, 7… days.</span>
          </span>
        </Link>
      </div>

      <section className="mt-8">
        <SectionTitle title="Lessons" href="/train/learn/" cta="Full path" />
        <div className="space-y-5">
          {TRACK_IDS.map((id) => (
            <LessonReel key={id} track={id} hydrated={hydrated} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle title="Drills" />
        <div className="grid gap-3 sm:grid-cols-2">
          <DrillCard
            href="/train/blackjack/"
            art="bj-hard-totals"
            icon={<IconTrain className="h-5 w-5" />}
            title="Blackjack strategy"
            blurb="Every opening decision against every dealer upcard, for four rule sets."
            acc={hydrated ? accuracy(bj) : null}
            count={bj.length}
          />
          <DrillCard
            href="/train/poker/"
            art="pk-board-texture"
            icon={<IconSpade className="h-5 w-5" />}
            title="Poker fundamentals"
            blurb="Pre-flop ranges and pot odds through board texture, c-bets, sizing and hand reading."
            acc={hydrated ? accuracy(pk) : null}
            count={pk.length}
          />
          <DrillCard
            href="/train/counting/"
            art="bj-counting"
            icon={<IconFlame className="h-5 w-5" />}
            title="Card counting"
            blurb="Hi-Lo running and true count, deck countdowns, and the index plays."
            acc={hydrated ? accuracy(counting) : null}
            count={counting.length}
            pro={hydrated && countingLocked(pro)}
          />
          <DrillCard
            href="/train/charts/"
            art="pk-opening-ranges"
            icon={<IconBolt className="h-5 w-5" />}
            title="Strategy charts"
            blurb="Basic strategy for each table and the opening range for every seat, colored by your own accuracy."
          />
        </div>
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

/** A track's next lesson as a full-bleed poster: the art, what it is, and one button to start it. */
function TrackHero({ track, hydrated }: { track: TrackId; hydrated: boolean }) {
  const p = useProgress();
  const pro = useIsPro();
  const info = TRACKS[track];
  const next = hydrated ? nextLesson(p, track) : info.lessons[0];
  const { done, total } = hydrated ? trackProgress(p, track) : { done: 0, total: info.lessons.length };
  const locked = hydrated && !!next && lessonLocked(next.id, pro);
  const label = !next ? "Track complete" : done ? "Continue" : "Start here";

  const body = (
    <>
      <LessonArt id={(next ?? info.lessons[info.lessons.length - 1]).id} variant="cover" className="transition-transform duration-700 group-hover:scale-[1.03]" />
      <span className="relative flex h-full flex-col justify-end p-5 sm:p-6">
        <span className="flex items-center gap-2 eyebrow">
          {track === "poker" ? <IconSpade className="h-3.5 w-3.5" /> : <IconTrain className="h-3.5 w-3.5" />}
          {info.title} · {label}
        </span>
        <span className="mt-1 block font-display font-black tracking-tight text-2xl leading-tight sm:text-[28px]">{next ? next.title : "Every lesson done"}</span>
        <span className="mt-1 line-clamp-2 block max-w-md text-sm text-ash-300">{next ? next.blurb : "Revisit any lesson from the full path."}</span>
        <span className="mt-4 flex items-center gap-3">
          <span className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-4 text-sm font-bold ${next ? "btn-fire" : "btn-ash"}`}>
            {next ? `${label} · ${next.minutes} min` : "Open the path"}
            {locked ? <ProBadge className="bg-ash-950/30 text-bone ring-ash-950/40" /> : <IconChevron className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block h-1.5 overflow-hidden rounded-full bg-ash-800/80">
              <span className="block h-full rounded-full bg-gradient-to-r from-ember-600 to-ember-400" style={{ width: `${(done / total) * 100}%` }} />
            </span>
            <span className="tabular mt-1 block text-[11px] text-ash-400">
              {done}/{total} lessons
            </span>
          </span>
        </span>
      </span>
    </>
  );

  const cls = "group panel pressable relative block aspect-[4/3] w-full overflow-hidden rounded-3xl text-left sm:aspect-[16/10]";
  return locked && next ? (
    <button
      onClick={() => {
        play("click");
        openPaywall(paywallReason.lesson(next.id));
      }}
      className={cls}
    >
      {body}
    </button>
  ) : (
    <Link href={next ? `/train/learn/${next.id}/` : "/train/learn/"} className={cls}>
      {body}
    </Link>
  );
}

/** Every lesson in a track as a poster, scrolled sideways, so the whole path shows on the hub. */
function LessonReel({ track, hydrated }: { track: TrackId; hydrated: boolean }) {
  const p = useProgress();
  const pro = useIsPro();
  const info = TRACKS[track];
  const next = hydrated ? nextLesson(p, track) : null;
  const reel = useRef<HTMLOListElement>(null);
  const [edges, setEdges] = useState({ left: false, right: true });

  const measure = useCallback(() => {
    const el = reel.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  // open with the up-next lesson in view, not scrolled off the right edge
  useEffect(() => {
    const el = reel.current;
    if (!el) return;
    const idx = next ? info.lessons.findIndex((l) => l.id === next.id) : 0;
    const li = el.children[idx] as HTMLElement | undefined;
    if (li && li.offsetLeft + li.offsetWidth > el.clientWidth) el.scrollLeft = li.offsetLeft - parseFloat(getComputedStyle(el).paddingLeft);
    measure();
  }, [next, info.lessons, measure]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const page = (dir: 1 | -1) => {
    const el = reel.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  const arrow = "grid h-7 w-7 place-items-center rounded-full bg-ash-900 text-ash-300 ring-1 ring-ash-700 transition-opacity hover:text-bone disabled:opacity-30";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="caps-label">{info.title}</p>
        <div className="hidden gap-1.5 sm:flex">
          <button aria-label={`Earlier ${info.title} lessons`} disabled={!edges.left} onClick={() => page(-1)} className={arrow}>
            <IconChevron className="h-4 w-4 rotate-180" />
          </button>
          <button aria-label={`Later ${info.title} lessons`} disabled={!edges.right} onClick={() => page(1)} className={arrow}>
            <IconChevron className="h-4 w-4" />
          </button>
        </div>
      </div>
      <ol
        ref={reel}
        onScroll={measure}
        style={{
          maskImage: `linear-gradient(to right, ${edges.left ? "transparent, black 28px" : "black"}, black calc(100% - 28px), ${edges.right ? "transparent" : "black"})`,
        }}
        className="no-scrollbar relative -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 py-2 sm:mx-0 sm:scroll-px-0 sm:px-0"
      >
        {info.lessons.map((l, i) => {
          const isDone = hydrated && lessonDone(p, l.id);
          const open = hydrated && lessonUnlocked(p, l.id);
          const proLocked = hydrated && lessonLocked(l.id, pro);
          const current = next?.id === l.id;
          const dim = !open || proLocked;
          const body = (
            <>
              <LessonArt id={l.id} variant="cover" className={`transition-transform duration-500 group-hover:scale-[1.05] ${dim ? "opacity-75 grayscale-[70%]" : ""}`} />
              <span className="relative flex h-full flex-col justify-between p-3">
                <span className="flex items-center justify-between">
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ring-1 ${
                      isDone ? "bg-ember-500 text-ash-950 ring-ember-300" : current ? "bg-ash-950/80 text-ember-300 ring-2 ring-ember-500" : "bg-ash-950/80 text-bone ring-ash-600"
                    }`}
                  >
                    {isDone ? <IconCheck className="h-3.5 w-3.5" /> : open ? i + 1 : <IconLock className="h-3 w-3" />}
                  </span>
                  {proLocked ? <ProBadge /> : <span className="tabular rounded-full bg-ash-950/80 px-2 py-0.5 text-[10px] font-semibold text-ash-300">{l.minutes} min</span>}
                </span>
                <span>
                  {current && <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-[0.2em] text-ember-400">Up next</span>}
                  <span className="line-clamp-3 font-display text-sm font-bold leading-snug">{l.title}</span>
                </span>
              </span>
              {/* drawn over the art, which would otherwise cover an inset ring */}
              {current && <span className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-inset ring-ember-500" />}
            </>
          );
          const cls = `group relative block aspect-[3/4] w-full overflow-hidden rounded-2xl bg-ash-900 text-left ${
            current ? "shadow-[0_0_24px_-6px_rgba(255,90,31,0.8)]" : "ring-1 ring-ash-800"
          }`;
          return (
            // whole cards per row: 4 on tablets, 6 on desktop; phones peek the next one
            <li key={l.id} className="w-36 shrink-0 snap-start sm:w-[calc((100%-36px)/4)] lg:w-[calc((100%-60px)/6)]">
              {proLocked ? (
                // Pro lessons stay visible; tapping one says what Pro adds
                <button
                  onClick={() => {
                    play("click");
                    openPaywall(paywallReason.lesson(l.id));
                  }}
                  className={cls}
                >
                  {body}
                </button>
              ) : open ? (
                <Link href={`/train/learn/${l.id}/`} className={`${cls} pressable`}>
                  {body}
                </Link>
              ) : (
                <div className={cls} aria-disabled>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DrillCard({
  href,
  art,
  icon,
  title,
  blurb,
  acc,
  count,
  pro,
}: {
  href: string;
  /** lesson id whose art backs the card */
  art: string;
  icon: React.ReactNode;
  title: string;
  blurb: string;
  /** omitted for reference cards that have no accuracy */
  acc?: number | null;
  count?: number;
  /** needs Pro: show the badge */
  pro?: boolean;
}) {
  return (
    <Link href={href} className="group panel pressable relative flex min-h-[180px] flex-col justify-end overflow-hidden rounded-3xl p-5 ring-1 ring-ash-800">
      <LessonArt id={art} variant="cover" className="transition-transform duration-700 group-hover:scale-[1.03]" />
      <div className="relative">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ash-950/70 text-ember-300 ring-1 ring-ember-500/40">{icon}</span>
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 font-display text-lg font-bold">
              {title}
              {pro && <ProBadge />}
            </h3>
            {acc !== undefined && <p className="tabular text-xs text-ash-400">{acc === null ? "Not started" : `${acc}% accuracy · ${count} answers`}</p>}
          </div>
          <IconChevron className="h-5 w-5 shrink-0 text-ash-400" />
        </div>
        <p className="mt-2 text-sm text-ash-300">{blurb}</p>
        {acc !== undefined && <Meter value={acc ?? 0} className="mt-3" />}
      </div>
    </Link>
  );
}
