"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { formatChips, unitsToChips } from "@/lib/chips";
import { isMuted, onMuteChange, play, setMuted } from "@/lib/sound";
import { streakOf, useHydrated, useProgress } from "@/lib/store";
import { IconFlame, IconHome, IconPlay, IconProfile, IconReview, IconSound, IconTrain } from "./icons";
import { Wordmark } from "./logo";

const NAV = [
  { href: "/", label: "Home", Icon: IconHome },
  { href: "/play/", label: "Play", Icon: IconPlay },
  { href: "/train/", label: "Train", Icon: IconTrain },
  { href: "/review/", label: "Review", Icon: IconReview },
  { href: "/profile/", label: "Profile", Icon: IconProfile },
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
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-ash-800/80 bg-ash-950/70 px-3 py-5 backdrop-blur-xl lg:flex">
      <Link href="/" aria-label="Inferno home" className="mb-7 px-3">
        <Wordmark />
      </Link>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, Icon }) => {
          const on = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              className={`group relative flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors ${
                on ? "bg-ember-500/12 text-bone" : "text-ash-400 hover:bg-ash-850 hover:text-ash-200"
              }`}
            >
              {on && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-gradient-to-b from-ember-300 to-ember-600 shadow-[0_0_10px_rgba(255,122,31,0.9)]" />}
              <Icon className={`h-5 w-5 ${on ? "text-ember-400" : ""}`} />
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
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-ember-400 to-ember-700 font-display text-sm font-black text-ash-950">
        {hydrated ? p.name.slice(0, 2).toUpperCase() : ""}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{hydrated ? p.name : " "}</span>
        <span className="tabular block text-xs text-ash-400">{hydrated ? `Best rating ${best}` : " "}</span>
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ mobile */

function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-ash-800/70 bg-ash-950/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ash-800/80 bg-ash-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto grid h-[64px] max-w-lg grid-cols-5">
        {NAV.map(({ href, label, Icon }) => {
          const on = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => play("click")}
              className={`relative flex flex-col items-center justify-center gap-1 text-[10px] font-bold tracking-wide transition-colors ${
                on ? "text-bone" : "text-ash-500 active:text-ash-300"
              }`}
            >
              {on && <span className="absolute top-0 h-[2px] w-8 rounded-full bg-gradient-to-r from-ember-700 via-ember-400 to-ember-700 shadow-[0_0_10px_rgba(255,122,31,0.9)]" />}
              <Icon className={`h-[22px] w-[22px] ${on ? "text-ember-400 drop-shadow-[0_0_8px_rgba(255,122,31,0.6)]" : ""}`} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function StreakPill() {
  const p = useProgress();
  const hydrated = useHydrated();
  const n = hydrated ? streakOf(p.days) : 0;
  return (
    <span
      title={`${n}-day streak`}
      className={`tabular flex h-9 items-center gap-1 rounded-xl px-2 text-sm font-bold ${n > 0 ? "text-ember-300" : "text-ash-500"}`}
    >
      <IconFlame className={`h-4 w-4 ${n > 0 ? "text-ember-400 drop-shadow-[0_0_6px_rgba(255,122,31,0.8)]" : ""}`} />
      {n}
    </span>
  );
}

function ChipsPill() {
  const p = useProgress();
  const hydrated = useHydrated();
  return (
    <Link
      href="/play/blackjack/"
      className="tabular flex h-9 items-center gap-1.5 rounded-xl border border-ash-700 bg-ash-900 px-2.5 text-sm font-bold text-bone"
      aria-label="Blackjack chips"
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
