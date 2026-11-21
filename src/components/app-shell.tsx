"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { formatChips, unitsToChips } from "@/lib/chips";
import { isMuted, onMuteChange, play, setMuted } from "@/lib/sound";
import { useIsPro } from "@/lib/pro";
import { useStreak } from "@/lib/streak-actions";
import { StreakFlame } from "@/components/streak/streak-flame";
import { useHydrated, useProgress } from "@/lib/store";
import { IconHome, IconPlay, IconProfile, IconReview, IconSound, IconTrain } from "./icons";
import { Wordmark } from "./logo";

const NAV = [
  { href: "/", label: "Home", Icon: IconHome },
  { href: "/play/", label: "Tables", Icon: IconPlay },
  { href: "/train/", label: "School", Icon: IconTrain },
  { href: "/review/", label: "The Books", Icon: IconReview },
  { href: "/profile/", label: "Your File", Icon: IconProfile },
];

/** Full-screen game screens: the 3D table fills the viewport with its own HUD. */
const GAME_ROUTES = ["/play/blackjack", "/play/poker/match", "/play/poker/table"];

const norm = (p: string) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);
const isActive = (path: string, href: string) => {
  const h = norm(href);
  return h === "/" ? norm(path) === "/" : norm(path).startsWith(h);
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const inGame = GAME_ROUTES.some((r) => norm(path).startsWith(r));

  // Game screens own the whole viewport: no sidebar, top bar or tab bar. The table draws
  // its own HUD (back, balance, settings) over the 3D scene.
  if (inGame) return <main className="relative h-dvh overflow-hidden bg-ash-950">{children}</main>;

  return (
    <div className="flex min-h-dvh">
      <Sidebar path={path} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 pb-[calc(72px+env(safe-area-inset-bottom))] lg:pb-0">{children}</main>
      </div>
      <TabBar path={path} />
    </div>
  );
}

/* ------------------------------------------------------------------ desktop */

function Sidebar({ path }: { path: string }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-brass-500/30 bg-ash-950/75 px-3 py-5 shadow-[inset_-4px_0_0_-3px_rgb(174_147_93/0.14)] backdrop-blur-xl lg:flex">
      <Link href="/" aria-label="Inferno home" className="mb-4 px-3">
        <Wordmark />
      </Link>
      <span aria-hidden className="deco-rule mx-3 mb-5" />
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, Icon }) => {
          const on = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              className={`group relative flex h-11 items-center gap-3 rounded-md px-3 font-display text-[14px] font-medium transition-colors ${
                on ? "bg-[linear-gradient(90deg,rgb(255_122_46/0.14),transparent_85%)] text-bone" : "text-ash-300 hover:bg-ash-850 hover:text-brass-100"
              }`}
            >
              {on && <span className="absolute inset-y-2 left-0 w-[2px] bg-gradient-to-b from-brass-200 via-ember-400 to-ember-700 shadow-[0_0_10px_rgba(255,122,31,0.8)]" />}
              <Icon className={`h-5 w-5 ${on ? "text-ember-400" : "text-brass-500 group-hover:text-brass-300"}`} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        <PlayerCard />
        <MuteButton wide />
      </div>
    </aside>
  );
}

function PlayerCard() {
  const p = useProgress();
  const hydrated = useHydrated();
  const best = Math.max(p.ratings.poker.r, p.ratings.blackjack.r, p.ratings.training.r);
  return (
    <Link href="/profile/" className="panel flex items-center gap-3 rounded-2xl p-3 transition-colors hover:border-ember-500/40">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[linear-gradient(160deg,#c95c26,#7f2810)] font-display text-sm text-[#fff3df] shadow-[inset_0_0_0_2px_rgb(58_12_4/0.35)] ring-1 ring-brass-300/60">
        {hydrated ? p.name.slice(0, 2).toUpperCase() : ""}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-display text-sm text-brass-100">{hydrated ? p.name : " "}</span>
        <span className="tabular block text-xs text-ash-400">{hydrated ? `Best rating ${best}` : " "}</span>
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ mobile */

function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-brass-500/30 bg-ash-950/85 shadow-[inset_0_-4px_0_-3px_rgb(174_147_93/0.14)] pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
      <div className="flex h-14 items-center gap-2 px-4">
        <Link href="/" aria-label="Inferno home" className="flex items-center gap-1.5">
          <Wordmark />
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <StreakPill />
          <ChipsPill />
          <MuteButton />
        </div>
      </div>
    </header>
  );
}

function TabBar({ path }: { path: string }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-brass-500/35 bg-ash-950/92 shadow-[inset_0_4px_0_-3px_rgb(174_147_93/0.14)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto grid h-[64px] max-w-lg grid-cols-5">
        {NAV.map(({ href, label, Icon }) => {
          const on = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => play("click")}
              className={`relative flex flex-col items-center justify-center gap-1 whitespace-nowrap text-[10px] font-bold tracking-wide transition-colors ${
                on ? "text-bone" : "text-ash-400 active:text-ash-200"
              }`}
            >
              {on && <span className="absolute top-0 h-[2px] w-12 bg-gradient-to-r from-transparent via-ember-400 to-transparent shadow-[0_0_10px_rgba(255,122,31,0.8)]" />}
              <Icon className={`h-[22px] w-[22px] ${on ? "text-ember-400 drop-shadow-[0_0_8px_rgba(255,122,31,0.6)]" : "text-brass-500"}`} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function StreakPill() {
  const v = useStreak(useIsPro());
  const n = v.streak;
  return (
    <Link
      href="/"
      title={v.metToday ? `${n}-day streak, goal met` : n ? `${n}-day streak: ${v.goal - v.todayXp} XP left today` : "Hit today's goal to start a streak"}
      aria-label={`${n}-day streak`}
      className={`tabular relative flex h-9 items-center gap-0.5 rounded-xl px-1.5 text-sm font-bold ${n > 0 ? (v.atRisk ? "text-ember-200/70" : "text-ember-300") : "text-ash-500"}`}
    >
      <StreakFlame streak={n} dim={v.atRisk} size={22} />
      {n}
      {v.atRisk && <span className="absolute right-0.5 top-1.5 h-1.5 w-1.5 rounded-full bg-ember-400 shadow-[0_0_6px_rgba(255,122,31,0.9)]" />}
    </Link>
  );
}

function ChipsPill() {
  const p = useProgress();
  const hydrated = useHydrated();
  return (
    <Link
      href="/chips/"
      className="tabular flex h-9 items-center gap-1.5 rounded-md border border-brass-500/50 bg-ash-900 px-2.5 text-sm font-bold text-bone shadow-[inset_0_0_0_2px_rgb(10_7_5/0.6),inset_0_0_0_3px_rgb(174_147_93/0.12)]"
      aria-label="Chips"
    >
      <span className="h-3.5 w-3.5 rounded-full bg-[repeating-conic-gradient(#ffc24b_0_20deg,#e5360f_20deg_60deg)] shadow-[0_0_6px_rgba(255,122,31,0.6)]" />
      {hydrated ? formatChips(unitsToChips(p.chips), { compact: true }) : "–"}
    </Link>
  );
}

export function MuteButton({ wide }: { wide?: boolean }) {
  const muted = useSyncExternalStore(onMuteChange, isMuted, () => false);
  return (
    <button
      onClick={() => setMuted(!muted)}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      className={
        wide
          ? "btn-ash flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold"
          : "grid h-9 w-9 place-items-center rounded-xl text-ash-300 active:bg-ash-800"
      }
    >
      <IconSound off={muted} className="h-[18px] w-[18px]" />
      {wide && (muted ? "Sound off" : "Sound on")}
    </button>
  );
}
