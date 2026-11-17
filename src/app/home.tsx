"use client";

import Link from "next/link";
import { BotAvatar, TierBadge } from "@/components/bot-avatar";
import { ProBadge } from "@/components/pro/pro-badge";
import { botLocked } from "@/lib/gates";
import { useIsPro } from "@/lib/pro";
import { Chip } from "@/components/chip";
import { ChallengesCard, CheckInCard } from "@/components/earn";
import {
  IconCalendar,
  IconChevron,
  IconFlame,
  IconSpade,
  IconTrain,
} from "@/components/icons";
import { LobbyHero } from "@/components/lobby-hero";
import { PlayingCardStatic } from "@/components/playing-card-static";
import { Ring, SectionTitle, Sparkline } from "@/components/ui";
import { MOVE_LABEL, type Move } from "@/lib/blackjack/strategy";
import { isUnlocked, ROSTER } from "@/lib/poker/roster";
import { useSettleLeftSeat } from "@/lib/earn";
import { ratingTitle } from "@/lib/rating";
import {
  leaksOf,
  streakOf,
  today,
  useHydrated,
  useProgress,
  type RatingKey,
} from "@/lib/store";

const RATINGS: { key: RatingKey; label: string; href: string }[] = [
  { key: "poker", label: "Poker", href: "/play/poker/" },
  { key: "blackjack", label: "Blackjack", href: "/play/blackjack/" },
  { key: "training", label: "Training", href: "/train/" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 5
    ? "Late night"
    : h < 12
    ? "Morning"
    : h < 18
    ? "Afternoon"
    : "Evening";
}

export function Home() {
  useSettleLeftSeat();
  const p = useProgress();
  const hydrated = useHydrated();
  const pro = useIsPro();
  const streak = hydrated ? streakOf(p.days) : 0;
  const daily = hydrated ? p.daily[today()] ?? [] : [];
  const dailyDone = daily.length;
  const next =
    ROSTER.find(
      (b) => !p.beaten.includes(b.id) && isUnlocked(b.id, p.beaten)
    ) ?? ROSTER[ROSTER.length - 1];
  const leak = hydrated ? leaksOf(p, undefined, 1)[0] : undefined;

  return (
    <>
      {/* the room: swipe between the blackjack table, the poker room and the training corner */}
      <LobbyHero fallback={<HeroArt />} />

      <div className="mx-auto max-w-6xl px-4 pb-10 pt-2 sm:px-6 lg:pt-4">
        {/* you */}
        <section className="grid items-end gap-5 lg:grid-cols-[1fr_1.1fr]">
          <div className="animate-rise">
            <p className="text-sm font-semibold text-ash-400">
              {hydrated ? `${greeting()}, ${p.name}` : " "}
            </p>
            <h1 className="mt-1.5 font-marquee text-[34px] leading-[1.02] sm:text-5xl">
              <span className="molten-text">Play sharp.</span>{" "}
              <span className="text-bone">Train hotter.</span>
            </h1>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ash-300">
              Take on poker bots with real personalities, play blackjack with a
              coach watching every decision, and drill the spots you miss.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {RATINGS.map((r) => {
              const rt = p.ratings[r.key];
              return (
                <Link
                  key={r.key}
                  href={r.href}
                  className="panel pressable rounded-2xl p-3"
                >
                  <p className="caps-label">
                    {r.label}
                  </p>
                  <p className="tabular mt-1 font-display text-xl font-bold">
                    {hydrated ? rt.r : "–"}
                  </p>
                  <p className="text-[10px] font-semibold text-ember-400">
                    {hydrated ? ratingTitle(rt.r) : " "}
                  </p>
                  <Sparkline
                    points={hydrated ? rt.history.slice(-30) : []}
                    className="mt-1.5 h-6 w-full"
                  />
                </Link>
              );
            })}
          </div>
        </section>

        {/* today */}
        <section className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/train/daily/"
            className="panel deco-corners pressable group relative overflow-hidden rounded-3xl p-5"
          >
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgba(255,90,31,0.28),transparent)]" />
            <div className="relative flex items-center gap-4">
              <Ring value={dailyDone / 3} size={68}>
                <span className="tabular font-display text-lg font-bold">
                  {dailyDone}/3
                </span>
              </Ring>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 eyebrow">
                  <IconCalendar className="h-3.5 w-3.5" /> Daily puzzles
                </p>
                <p className="mt-1 font-display text-lg font-bold">
                  {dailyDone === 3
                    ? "All solved today"
                    : dailyDone
                    ? "Keep going"
                    : "Three new spots"}
                </p>
                <p className="text-xs text-ash-400">
                  {dailyDone === 3
                    ? "Come back tomorrow for more."
                    : "One blackjack, two poker. Same for everyone."}
                </p>
              </div>
              <IconChevron className="h-5 w-5 text-ash-500 transition-colors group-hover:text-ember-300" />
            </div>
          </Link>

          <Link
            href={hydrated && botLocked(next.id, pro) ? "/play/poker/" : `/play/poker/match/?bot=${next.id}`}
            className="panel pressable group relative overflow-hidden rounded-3xl p-5"
          >
            <div className="flex items-center gap-4">
              <BotAvatar bot={next} size={68} ring />
              <div className="min-w-0 flex-1">
                <p className="eyebrow">
                  Next opponent
                </p>
                <p className="mt-1 flex items-center gap-2 font-display text-lg font-bold">
                  {next.name}
                  <span className="tabular text-xs font-semibold text-ash-400">
                    {next.rating}
                  </span>
                  {hydrated && botLocked(next.id, pro) && <ProBadge />}
                </p>
                <p className="truncate text-xs text-ash-400">{next.title}</p>
              </div>
              <span className="btn-fire rounded-xl px-3.5 py-2 text-xs font-bold">
                Play
              </span>
            </div>
          </Link>

          <div className="panel relative overflow-hidden rounded-3xl p-5 md:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-4">
              <span
                className={`grid h-[68px] w-[68px] shrink-0 place-items-center rounded-2xl ${
                  streak
                    ? "bg-ember-500/15 ring-1 ring-ember-500/40"
                    : "bg-ash-850 ring-1 ring-ash-700"
                }`}
              >
                <IconFlame
                  className={`h-9 w-9 ${
                    streak
                      ? "animate-flicker text-ember-400 drop-shadow-[0_0_12px_rgba(255,122,31,0.8)]"
                      : "text-ash-600"
                  }`}
                />
              </span>
              <div className="min-w-0">
                <p className="eyebrow">
                  Streak
                </p>
                <p className="tabular mt-1 font-display text-lg font-bold">
                  {streak} day{streak === 1 ? "" : "s"}
                </p>
                <p className="text-xs text-ash-400">
                  {streak
                    ? "Play or train today to keep it burning."
                    : "Play a hand or solve a puzzle to light it."}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* chips: the daily check-in and today's challenges */}
        <section className="mt-9">
          <SectionTitle title="Chips" href="/chips/" cta="Earn more" />
          <div className="grid gap-3 md:grid-cols-2">
            <CheckInCard />
            <ChallengesCard />
          </div>
        </section>

        {/* train */}
        <section className="mt-9">
          <SectionTitle title="School" href="/train/" cta="All drills" />
          <div className="grid gap-3 md:grid-cols-2">
            {leak ? (
              <Link
                href={
                  leak.game === "blackjack" && leak.kind !== "insurance"
                    ? `/train/blackjack/?spot=${leak.key}`
                    : leak.game === "poker"
                    ? `/train/poker/?drill=${leak.kind}`
                    : "/train/blackjack/"
                }
                className="panel pressable flex items-center gap-4 rounded-3xl p-5 ring-1 ring-ember-600/30"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ember-600/15 text-ember-300 ring-1 ring-ember-600/40">
                  <IconTrain className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block eyebrow">
                    Your biggest leak
                  </span>
                  <span className="mt-0.5 block truncate font-bold">
                    {leak.key === "insurance" ? "Taking insurance" : leak.label}
                  </span>
                  <span className="block text-xs text-ash-400">
                    Missed {leak.misses} of {leak.seen} · right play:{" "}
                    {leak.game === "blackjack"
                      ? (
                          MOVE_LABEL[leak.correct as Move] ?? leak.correct
                        ).toLowerCase()
                      : leak.correct}
                  </span>
                </span>
                <span className="btn-ash rounded-xl px-3 py-2 text-xs font-bold">
                  Fix it
                </span>
              </Link>
            ) : (
              <Link
                href="/train/blackjack/"
                className="panel pressable flex items-center gap-4 rounded-3xl p-5"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ash-850 text-ember-300 ring-1 ring-ash-700">
                  <IconTrain className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">
                    Blackjack strategy drills
                  </span>
                  <span className="block text-xs text-ash-400">
                    Rapid-fire opening decisions graded against basic strategy.
                  </span>
                </span>
                <IconChevron className="h-5 w-5 text-ash-500" />
              </Link>
            )}
            <Link
              href="/train/poker/"
              className="panel pressable flex items-center gap-4 rounded-3xl p-5"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ash-850 text-ember-300 ring-1 ring-ash-700">
                <IconSpade className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">Poker drills</span>
                <span className="block text-xs text-ash-400">
                  Opening ranges, pot odds, showdowns and equity, graded with
                  exact maths.
                </span>
              </span>
              <IconChevron className="h-5 w-5 text-ash-500" />
            </Link>
          </div>
        </section>

        {/* ladder */}
        <section className="mt-9">
          <SectionTitle
            title="The ladder"
            href="/play/poker/"
            cta="Challenge"
          />
          <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
            {ROSTER.map((b) => {
              const open = isUnlocked(b.id, p.beaten);
              const won = p.beaten.includes(b.id);
              return (
                <Link
                  key={b.id}
                  href={
                    open && !(hydrated && botLocked(b.id, pro)) ? `/play/poker/match/?bot=${b.id}` : "/play/poker/"
                  }
                  className={`panel pressable relative flex w-36 shrink-0 snap-start flex-col items-center rounded-3xl p-4 text-center ${
                    won ? "ring-1 ring-ember-400/50" : ""
                  }`}
                >
                  <BotAvatar bot={b} size={64} locked={!open} />
                  {won && (
                    <span className="absolute right-3 top-3 rounded-full bg-ember-500 px-1.5 text-[9px] font-black text-ash-950">
                      WON
                    </span>
                  )}
                  <p className="mt-2 font-display text-sm font-bold">
                    {b.name}
                  </p>
                  <p className="tabular text-xs text-ash-400">{b.rating}</p>
                  <div className="mt-2">
                    <TierBadge tier={b.tier} />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

/** Static hero art: shown while the live scene loads and whenever it can't run. */
function HeroArt() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-x-8 bottom-0 top-10 rounded-[50%] bg-[radial-gradient(closest-side,rgba(255,90,31,0.35),transparent)] blur-2xl" />
      <div className="absolute left-[18%] top-[18%] -rotate-[14deg]">
        <PlayingCardStatic card="AH" large />
      </div>
      <div className="absolute left-[38%] top-[8%] rotate-[4deg]">
        <PlayingCardStatic card="KS" large />
      </div>
      <div className="absolute bottom-6 left-[8%] rotate-12">
        <Chip value={1000} size={74} glow />
      </div>
      <div className="absolute bottom-2 left-[26%] -rotate-6">
        <Chip value={100} size={62} />
      </div>
      <div className="absolute bottom-16 right-[8%] rotate-6">
        <Chip value={500} size={66} glow />
      </div>
      <div className="absolute right-[2%] top-[12%] font-marquee text-7xl molten-text opacity-90">
        21
      </div>
    </div>
  );
}
