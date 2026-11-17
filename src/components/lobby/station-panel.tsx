"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BotAvatar } from "@/components/bot-avatar";
import { IconCalendar, IconChevron } from "@/components/icons";
import type { StationId } from "@/game/lobby/stations";
import { isUnlocked, ROSTER } from "@/lib/poker/roster";
import { ratingTitle } from "@/lib/rating";
import { accuracy, today, useHydrated, useProgress } from "@/lib/store";
import { botLocked } from "@/lib/gates";
import { useIsPro } from "@/lib/pro";

/* What each station teaches, plus one or two live numbers from your progress. */

interface Copy {
  kicker: string;
  title: string;
  learn: string;
  go: string;
}

const COPY: Record<StationId, Copy> = {
  blackjack: {
    kicker: "21 · coached table",
    title: "Blackjack",
    learn: "Learn basic strategy hand by hand on four rule sets, with a coach grading every hit, stand, double and split.",
    go: "Sit down",
  },
  poker: {
    kicker: "Hold'em · vs bots",
    title: "Poker room",
    learn: "Heads-up against eight bots from beginner to master, or a full 6-max table. Learn ranges, pot odds and when to fold.",
    go: "Take a seat",
  },
  training: {
    kicker: "Drills · daily puzzles",
    title: "Training corner",
    learn: "Rapid-fire spots graded with exact maths, three new puzzles a day, and a plan for your leaks.",
    go: "Start training",
  },
};

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl bg-ash-950/50 px-3 py-2 ring-1 ring-ash-700/70">
      <p className="caps-label">{label}</p>
      <div className="mt-0.5 truncate text-sm font-bold">{children}</div>
    </div>
  );
}

function Rating({ r, show }: { r: number; show: boolean }) {
  return (
    <span className="tabular">
      {show ? r : "–"} <span className="text-xs font-semibold text-ember-400">{show ? ratingTitle(r) : ""}</span>
    </span>
  );
}

export function StationPanel({ id, href }: { id: StationId; href: string }) {
  const p = useProgress();
  const hydrated = useHydrated();
  const pro = useIsPro();
  const copy = COPY[id];
  const next = ROSTER.find((b) => !p.beaten.includes(b.id) && isUnlocked(b.id, p.beaten)) ?? ROSTER[ROSTER.length - 1];
  const dailyDone = hydrated ? (p.daily[today()] ?? []).length : 0;

  let stats: ReactNode;
  let extra: { href: string; label: ReactNode } | null = null;
  if (id === "blackjack") {
    const acc = hydrated ? accuracy(p.bjRounds.flatMap((r) => r.decisions)) : null;
    stats = (
      <>
        <Stat label="Rating">
          <Rating r={p.ratings.blackjack.r} show={hydrated} />
        </Stat>
        <Stat label="Right plays">{acc === null ? <span className="text-ash-400">No hands yet</span> : <span className="tabular">{acc}%</span>}</Stat>
      </>
    );
    extra = { href: "/train/blackjack/", label: "Drill it" };
  } else if (id === "poker") {
    stats = (
      <>
        <Stat label="Rating">
          <Rating r={p.ratings.poker.r} show={hydrated} />
        </Stat>
        <Stat label="Next opponent">
          <span className="flex items-center gap-1.5">
            <BotAvatar bot={next} size={18} />
            <span className="truncate">{next.name}</span>
            <span className="tabular text-xs font-semibold text-ash-400">{next.rating}</span>
          </span>
        </Stat>
      </>
    );
    extra = hydrated && botLocked(next.id, pro)
      ? { href: "/play/poker/", label: `${next.name} needs Pro` }
      : { href: `/play/poker/match/?bot=${next.id}`, label: `Challenge ${next.name}` };
  } else {
    stats = (
      <>
        <Stat label="Rating">
          <Rating r={p.ratings.training.r} show={hydrated} />
        </Stat>
        <Stat label="Daily puzzles">
          <span className="tabular">{dailyDone}/3</span> <span className="text-xs font-semibold text-ash-400">{dailyDone === 3 ? "all solved" : "today"}</span>
        </Stat>
      </>
    );
    extra = {
      href: "/train/daily/",
      label: (
        <span className="flex items-center gap-1.5">
          <IconCalendar className="h-3.5 w-3.5" /> Daily
        </span>
      ),
    };
  }

  return (
    <div>
      <p className="eyebrow">{copy.kicker}</p>
      <h2 className="mt-1 font-display text-[28px] font-black leading-none tracking-tight sm:text-4xl">{copy.title}</h2>
      <p className="mt-2 text-[13px] leading-snug text-ash-300 sm:text-sm">{copy.learn}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">{stats}</div>
      <div className="mt-3 flex gap-2">
        <Link href={href} className="btn-fire pressable flex h-11 flex-1 items-center justify-center gap-1 rounded-2xl px-4 text-sm font-bold">
          {copy.go} <IconChevron className="h-4 w-4" />
        </Link>
        {extra && (
          <Link href={extra.href} className="btn-ash pressable flex h-11 max-w-[48%] items-center justify-center truncate rounded-2xl px-4 text-sm font-bold">
            {extra.label}
          </Link>
        )}
      </div>
    </div>
  );
}
