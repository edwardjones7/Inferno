"use client";

import Link from "next/link";
import { BotAvatar, TierBadge } from "@/components/bot-avatar";
import { Chip } from "@/components/chip";
import { ChipDot, claim } from "@/components/earn";
import { IconCheck, IconChevron, IconFriends, IconTrain, IconTrophy } from "@/components/icons";
import { StreakFlame } from "@/components/streak/streak-flame";
import { LobbyHero } from "@/components/lobby-hero";
import { PlayingCardStatic } from "@/components/playing-card-static";
import { ProBadge } from "@/components/pro/pro-badge";
import { Ring, SectionTitle } from "@/components/ui";
import { MOVE_LABEL, type Move } from "@/lib/blackjack/strategy";
import { challengesFor } from "@/lib/challenges";
import { formatChips } from "@/lib/chips";
import { checkInStatus } from "@/lib/economy";
import { claimCheckIn, useNow, useSettleLeftSeat } from "@/lib/earn";
import { botLocked } from "@/lib/gates";
import { isUnlocked, ROSTER } from "@/lib/poker/roster";
import { useIsPro } from "@/lib/pro";
import { ratingTitle } from "@/lib/rating";
import { leaksOf, today, useHydrated, useProgress, type RatingKey } from "@/lib/store";
import { rewardedAdsAvailable } from "@/lib/ads";
import { repairWithAd, StreakError, useStreak } from "@/lib/streak-actions";
import { play } from "@/lib/sound";
import { toast } from "sonner";
import { useState } from "react";

const RATINGS: { key: RatingKey; label: string }[] = [
  { key: "poker", label: "Poker" },
  { key: "blackjack", label: "Blackjack" },
  { key: "training", label: "Training" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Late night" : h < 12 ? "Morning" : h < 18 ? "Afternoon" : "Evening";
}

/**
 * Home is a short to-do list, not a dashboard: the lobby to sit down at a table, today's
 * few things worth doing (each one tap), ratings at a glance, and the ladder. Everything
 * else (the check-in week, challenges, drill menus) lives on its own tab.
 */
export function Home() {
  useSettleLeftSeat();
  const p = useProgress();
  const hydrated = useHydrated();

  return (
    <>
      <LobbyHero fallback={<HeroArt />} />

      <div className="mx-auto max-w-5xl px-4 pb-12 pt-3 sm:px-6 lg:pt-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 truncate font-display text-lg font-bold sm:text-2xl">
            {hydrated ? `${greeting()}, ${p.name}` : " "}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/friends/" aria-label="Friends" className="btn-ash grid h-9 w-9 place-items-center rounded-full">
              <IconFriends className="h-[18px] w-[18px]" />
            </Link>
            <StreakPill />
          </div>
        </header>

        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Today />
          <Ratings />
        </div>

        <Ladder />
      </div>
    </>
  );
}

/** Desktop only: on phones the top bar already shows the streak. */
function StreakPill() {
  const v = useStreak(useIsPro());
  const streak = v.streak;
  return (
    <span
      title={v.metToday ? "Today's goal is met" : streak ? "Hit today's goal to keep it going" : "Hit today's goal to start a streak"}
      className={`tabular hidden h-9 shrink-0 items-center gap-1 rounded-full lg:flex pl-1.5 pr-3 text-sm font-bold ring-1 ${
        streak ? "bg-ember-500/12 text-ember-200 ring-ember-500/40" : "bg-ash-900 text-ash-400 ring-ash-700"
      }`}
    >
      <StreakFlame streak={streak} dim={v.atRisk} size={22} />
      {streak} day{streak === 1 ? "" : "s"}
    </span>
  );
}

/** Repair a broken streak with a rewarded ad (the other way, double the goal, needs no button). */
function RepairButton() {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const n = await repairWithAd();
      if (n) play("win");
      else toast("No reward this time. Earning double your goal repairs it too.");
    } catch (e) {
      toast.error(e instanceof StreakError ? e.message : "Couldn't repair the streak");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button disabled={busy} onClick={() => void go()} className="btn-fire h-9 shrink-0 rounded-xl px-3.5 text-xs disabled:opacity-60">
      {busy ? "…" : "Watch ad"}
    </button>
  );
}

type TodayItem = { key: string; done: boolean; node: React.ReactNode };

/** Today's short list. Finished items sink to the bottom and go quiet. */
function Today() {
  const p = useProgress();
  const hydrated = useHydrated();
  const pro = useIsPro();
  const now = useNow();

  const s = hydrated ? checkInStatus(p, now, pro) : null;
  const puzzles = hydrated ? (p.daily[today()] ?? []).length : 0;
  const leak = hydrated ? leaksOf(p, undefined, 1)[0] : undefined;
  const ready = hydrated ? challengesFor("day", p, now).filter((c) => c.done && !c.claimed).length : 0;
  const next = ROSTER.find((b) => !p.beaten.includes(b.id) && isUnlocked(b.id, p.beaten)) ?? ROSTER[ROSTER.length - 1];
  const nextLocked = hydrated && botLocked(next.id, pro);

  const v = useStreak(pro);
  const items: TodayItem[] = [];

  if (v.ready && v.repair)
    items.push({
      key: "repair",
      done: false,
      node: (
        <Row
          href={rewardedAdsAvailable() ? undefined : "/train/"}
          icon={
            <span className="grid h-10 w-10 place-items-center rounded-full bg-ember-600/15 ring-1 ring-ember-500/50">
              <StreakFlame streak={v.repair.length} dim size={30} />
            </span>
          }
          title={`Repair your ${v.repair.length}-day streak`}
          sub={rewardedAdsAvailable() ? `Watch an ad, or earn ${v.goal * 2} XP today` : `Earn ${v.goal * 2} XP today to bring it back`}
          action={rewardedAdsAvailable() ? <RepairButton /> : undefined}
        />
      ),
    });

  if (v.ready)
    items.push({
      key: "goal",
      done: v.metToday,
      node: (
        <Row
          href="/train/"
          icon={
            <Ring value={v.todayXp / v.goal} size={40} stroke={4}>
              <StreakFlame streak={v.streak} dim={!v.metToday} size={22} />
            </Ring>
          }
          title={v.metToday ? `Goal met · ${v.streak}-day streak` : `Daily goal · ${Math.min(v.todayXp, v.goal)}/${v.goal} XP`}
          sub={
            v.metToday
              ? "Back tomorrow to keep it burning"
              : v.streak
                ? `${v.goal - v.todayXp} XP keeps your ${v.streak}-day streak`
                : "A lesson or five drill answers lights a streak"
          }
          done={v.metToday}
        />
      ),
    });

  if (s)
    items.push({
      key: "checkin",
      done: !s.available,
      node: (
        <Row
          icon={
            <span className="grid h-10 w-10 place-items-center rounded-full bg-ash-850 ring-1 ring-ash-700">
              <ChipDot className="h-5 w-5" />
            </span>
          }
          title={s.available ? "Daily check-in" : "Checked in"}
          sub={s.available ? `Day ${s.day} of 7` : "Back tomorrow for the next one"}
          done={!s.available}
          action={
            s.available ? (
              <button
                onClick={() => claim(claimCheckIn, `Check-in, day ${s.day}`)}
                className="btn-fire tabular h-9 shrink-0 rounded-xl px-3.5 text-xs"
              >
                +{formatChips(s.reward)}
              </button>
            ) : undefined
          }
        />
      ),
    });

  items.push({
    key: "puzzles",
    done: puzzles >= 3,
    node: (
      <Row
        href="/train/daily/"
        icon={
          <Ring value={puzzles / 3} size={40} stroke={4}>
            <span className="tabular text-[11px] font-bold">{puzzles}/3</span>
          </Ring>
        }
        title="Daily puzzles"
        sub={puzzles >= 3 ? "All solved" : puzzles ? `${3 - puzzles} left today` : "Three new spots"}
        done={puzzles >= 3}
      />
    ),
  });

  if (leak)
    items.push({
      key: "leak",
      done: false,
      node: (
        <Row
          href={
            leak.game === "blackjack" && leak.kind !== "insurance"
              ? `/train/blackjack/?spot=${leak.key}`
              : leak.game === "poker"
                ? `/train/poker/?drill=${leak.kind}`
                : "/train/blackjack/"
          }
          icon={
            <span className="grid h-10 w-10 place-items-center rounded-full bg-ember-600/15 text-ember-300 ring-1 ring-ember-600/40">
              <IconTrain className="h-5 w-5" />
            </span>
          }
          title={`Fix a leak: ${leak.key === "insurance" ? "taking insurance" : leak.label}`}
          sub={`Missed ${leak.misses} of ${leak.seen} · right play: ${
            leak.game === "blackjack" ? (MOVE_LABEL[leak.correct as Move] ?? leak.correct).toLowerCase() : leak.correct
          }`}
        />
      ),
    });

  items.push({
    key: "opponent",
    done: false,
    node: (
      <Row
        href={nextLocked ? "/play/poker/" : `/play/poker/match/?bot=${next.id}`}
        icon={<BotAvatar bot={next} size={40} />}
        title={
          <span className="flex items-center gap-2">
            Beat {next.name} {nextLocked && <ProBadge />}
          </span>
        }
        sub={`Next on the ladder · rated ${next.rating}`}
      />
    ),
  });

  if (ready)
    items.push({
      key: "challenges",
      done: false,
      node: (
        <Row
          href="/chips/"
          icon={
            <span className="grid h-10 w-10 place-items-center rounded-full bg-ash-850 text-ember-300 ring-1 ring-ash-700">
              <IconTrophy className="h-5 w-5" />
            </span>
          }
          title={`${ready} challenge${ready === 1 ? "" : "s"} to claim`}
          sub="Chips are waiting"
        />
      ),
    });

  const sorted = [...items].sort((a, b) => Number(a.done) - Number(b.done));
  const left = items.filter((r) => !r.done).length;

  return (
    <section className="panel rounded-3xl p-2" aria-labelledby="today-title">
      <div className="flex items-baseline justify-between px-3 pb-1 pt-2">
        <h2 id="today-title" className="font-display text-base font-bold">
          Today
        </h2>
        <span className="text-xs text-ash-400">{hydrated ? (left ? `${left} to do` : "All done") : ""}</span>
      </div>
      <ul>
        {sorted.map((r) => (
          <li key={r.key}>{r.node}</li>
        ))}
      </ul>
    </section>
  );
}

/** One line in Today: an icon, what it is, then a button or a chevron. */
function Row({
  icon,
  title,
  sub,
  href,
  action,
  done,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  sub: string;
  href?: string;
  action?: React.ReactNode;
  done?: boolean;
}) {
  const inner = (
    <>
      <span className={`shrink-0 ${done ? "opacity-50 grayscale" : ""}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[15px] font-bold ${done ? "text-ash-400" : "text-bone"}`}>{title}</span>
        <span className="block truncate text-xs text-ash-400">{sub}</span>
      </span>
      {done ? (
        <IconCheck className="h-4 w-4 shrink-0 text-emerald-400" />
      ) : (
        (action ?? <IconChevron className="h-4 w-4 shrink-0 text-ash-500 transition-colors group-hover:text-ember-300" />)
      )}
    </>
  );
  const cls = "group flex min-h-[60px] items-center gap-3 rounded-2xl px-3 py-2 transition-colors";
  return href && !done ? (
    <Link href={href} className={`${cls} hover:bg-ash-850/70 active:bg-ash-850`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function Ratings() {
  const p = useProgress();
  const hydrated = useHydrated();
  return (
    <Link href="/profile/" aria-label="Ratings, open your file" className="panel pressable group block rounded-3xl p-2">
      <div className="flex items-baseline justify-between px-3 pb-1 pt-2">
        <h2 className="font-display text-base font-bold">Ratings</h2>
        <IconChevron className="h-4 w-4 self-center text-ash-500 transition-colors group-hover:text-ember-300" />
      </div>
      <ul className="grid grid-cols-3 lg:grid-cols-1">
        {RATINGS.map((r) => {
          const rt = p.ratings[r.key];
          return (
            <li key={r.key} className="flex flex-col px-3 py-2 lg:flex-row lg:items-baseline lg:justify-between">
              <span className="text-xs text-ash-400 lg:text-sm">{r.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="tabular font-display text-lg font-bold">{hydrated ? rt.r : "–"}</span>
                <span className="hidden text-xs font-semibold text-ember-400 lg:inline">{hydrated ? ratingTitle(rt.r) : ""}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Link>
  );
}

function Ladder() {
  const p = useProgress();
  const hydrated = useHydrated();
  const pro = useIsPro();
  return (
    <section className="mt-8">
      <SectionTitle title="The ladder" href="/play/poker/" cta="All bots" />
      <div className="no-scrollbar -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
        {ROSTER.map((b) => {
          const open = isUnlocked(b.id, p.beaten);
          const won = p.beaten.includes(b.id);
          return (
            <Link
              key={b.id}
              href={open && !(hydrated && botLocked(b.id, pro)) ? `/play/poker/match/?bot=${b.id}` : "/play/poker/"}
              className={`panel pressable relative flex w-28 shrink-0 snap-start flex-col items-center rounded-2xl px-2 py-3 text-center ${
                won ? "ring-1 ring-ember-400/50" : ""
              }`}
            >
              <BotAvatar bot={b} size={56} locked={!open} />
              {won && (
                <span aria-label="Beaten" className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-ember-500 text-ash-950">
                  <IconCheck className="h-3 w-3" />
                </span>
              )}
              <p className="mt-2 w-full truncate font-display text-[13px] font-bold">{b.name}</p>
              <div className="mt-1">
                <TierBadge tier={b.tier} />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
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
      <div className="absolute right-[2%] top-[12%] font-display font-black tracking-tight text-7xl molten-text opacity-90">
        21
      </div>
    </div>
  );
}
