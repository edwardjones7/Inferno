import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Chip } from "@/components/chip";
import { CoinIcon } from "@/components/coin-icon";
import { LobbyHero } from "@/components/lobby-hero";
import { PlayingCardStatic } from "@/components/playing-card-static";
import { formatUsd } from "@/lib/currency";
import { getLeaderboard, getRecentWins } from "@/server/casino";
import { currentUserId } from "@/server/session";

const SOON = [
  { name: "Mines", blurb: "Dodge the bombs. Cash out before you burn.", glyph: "✹" },
  { name: "Crash", blurb: "Ride the flame up. Bail before it blows.", glyph: "↗" },
  { name: "Dice", blurb: "Pick your odds, roll under the line.", glyph: "⚂" },
];

export default function Lobby() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      {/* hero */}
      <section className="relative grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.1fr_1fr]">
        <div className="animate-rise">
          <p className="inline-flex items-center gap-2 rounded-full border border-ember-500/30 bg-ember-500/10 px-3 py-1 text-xs font-semibold text-ember-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember-400 shadow-[0_0_8px_#ff9a2e]" />
            Paper mode is live: free funds, real math
          </p>
          <h1 className="mt-5 font-display text-5xl font-black leading-[0.95] tracking-tight sm:text-7xl">
            <span className="molten-text">Play hot.</span>
            <br />
            <span className="text-bone">Verify everything.</span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-ash-300 sm:text-lg">
            Crypto blackjack where every shoe is shuffled from a seed you can check. Start with $2,500 in paper BTC, ETH, SOL and USDT.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/blackjack" className="btn-fire inline-flex h-13 items-center rounded-2xl px-7 font-display text-sm font-bold uppercase tracking-wider">
              Play blackjack
            </Link>
            <Link href="/fairness" className="btn-ash inline-flex h-13 items-center rounded-2xl px-6 text-sm font-bold">
              How fairness works
            </Link>
          </div>
          <div className="mt-8 flex items-center gap-5 text-xs text-ash-400">
            <span className="flex items-center gap-2">
              <span className="flex -space-x-1.5">
                {(["BTC", "ETH", "SOL", "USDT"] as const).map((c) => (
                  <CoinIcon key={c} currency={c} size={20} />
                ))}
              </span>
              4 paper coins
            </span>
            <span>99.5% RTP</span>
            <span>HMAC-SHA256 shuffles</span>
          </div>
        </div>

        <LobbyHero fallback={<HeroArt />} />
      </section>

      {/* games */}
      <section>
        <SectionTitle eyebrow="Games" title="Pick your fire" />
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          <Link
            href="/blackjack"
            className="felt group relative col-span-full flex min-h-56 flex-col justify-end overflow-hidden rounded-3xl p-6 transition-transform hover:-translate-y-1 md:col-span-2 lg:row-span-2"
          >
            <div className="absolute right-4 top-6 flex rotate-6 transition-transform duration-500 group-hover:rotate-0 sm:right-10">
              <div className="-rotate-12"><PlayingCardStatic card="AS" /></div>
              <div className="-ml-10 rotate-3"><PlayingCardStatic card="KH" /></div>
            </div>
            <span className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-ember-500 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-ash-950">
              Live
            </span>
            <h3 className="font-display text-3xl font-black">Blackjack</h3>
            <p className="mt-1 max-w-sm text-sm text-ash-300">
              Inferno Classic. 6 decks, 3:2 blackjack, double after split, late surrender, strategy hints.
            </p>
            <span className="mt-4 text-sm font-bold text-ember-300 transition-colors group-hover:text-ember-200">Take a seat →</span>
          </Link>
          <Link
            href="/poker"
            className="panel group relative flex min-h-40 flex-col justify-end overflow-hidden rounded-3xl p-5 ring-1 ring-ember-500/30 transition-transform hover:-translate-y-1"
          >
            <span className="absolute right-4 top-3 font-display text-5xl text-ember-500/40 transition-colors group-hover:text-ember-400/70">♠</span>
            <span className="mb-2 w-fit rounded-full bg-ember-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ash-950">New</span>
            <h3 className="font-display text-lg font-bold">Poker trainer</h3>
            <p className="mt-1 text-xs text-ash-400">Opening ranges, pot odds, showdowns and equity drills for Hold&apos;em.</p>
          </Link>
          {SOON.map((g) => (
            <div key={g.name} className="panel relative flex min-h-40 flex-col justify-end overflow-hidden rounded-3xl p-5 opacity-80">
              <span className="absolute right-4 top-3 font-display text-5xl text-ash-700">{g.glyph}</span>
              <span className="mb-2 w-fit rounded-full border border-ash-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ash-400">
                Soon
              </span>
              <h3 className="font-display text-lg font-bold">{g.name}</h3>
              <p className="mt-1 text-xs text-ash-400">{g.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      {/* live */}
      <section className="mt-14 grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <SectionTitle eyebrow="Live" title="Recent wins" />
          <Suspense fallback={<ListSkeleton />}>
            <RecentWins />
          </Suspense>
        </div>
        <div className="min-w-0">
          <SectionTitle eyebrow="Leaderboard" title="Hottest hands" />
          <Suspense fallback={<ListSkeleton />}>
            <Leaderboard />
          </Suspense>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-ember-400">{eyebrow}</p>
      <h2 className="font-display text-xl font-bold">{title}</h2>
    </div>
  );
}

/** Static hero art: server-rendered, shown while the live scene loads and whenever it can't run. */
function HeroArt() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-x-8 bottom-0 top-10 rounded-[50%] bg-[radial-gradient(closest-side,rgba(255,90,31,0.35),transparent)] blur-2xl" />
      <div className="absolute left-[18%] top-[18%] -rotate-[14deg] transition-transform"><PlayingCardStatic card="AH" large /></div>
      <div className="absolute left-[38%] top-[8%] rotate-[4deg]"><PlayingCardStatic card="KS" large /></div>
      <div className="absolute bottom-6 left-[8%] rotate-12"><Chip value={1000} size={74} glow /></div>
      <div className="absolute bottom-2 left-[26%] -rotate-6"><Chip value={100} size={62} /></div>
      <div className="absolute bottom-16 right-[8%] rotate-6"><Chip value={500} size={66} glow /></div>
      <div className="absolute right-[2%] top-[12%] font-display text-7xl font-black molten-text opacity-90">21</div>
    </div>
  );
}

async function RecentWins() {
  await connection();
  const wins = await getRecentWins(8);
  if (!wins.length) return <Empty text="No wins yet. Be the first to light it up." />;
  return (
    <ul className="panel divide-y divide-ash-800 overflow-hidden rounded-3xl">
      {wins.map((w) => (
        <li key={w.id} className="flex items-center gap-3 px-4 py-3 text-sm sm:px-5">
          <CoinIcon currency={w.currency} size={20} />
          <span className="min-w-0 flex-1 truncate font-semibold">{w.name}</span>
          {w.blackjack && <span className="rounded-full bg-ember-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-ember-300">BJ</span>}
          <span className="tabular text-xs text-ash-400">{w.multiplier.toFixed(2)}×</span>
          <span className="tabular w-20 shrink-0 text-right font-bold text-ember-300 sm:w-24">{formatUsd(w.profitUsd, { sign: true, compact: true })}</span>
        </li>
      ))}
    </ul>
  );
}

async function Leaderboard() {
  const viewer = await currentUserId();
  const rows = await getLeaderboard(viewer, 8);
  if (!rows.length) return <Empty text="The board is cold. Play a hand to get on it." />;
  return (
    <ol className="panel divide-y divide-ash-800 overflow-hidden rounded-3xl">
      {rows.map((r, i) => (
        <li key={r.name + i} className={`flex items-center gap-3 px-4 py-3 text-sm sm:px-5 ${r.you ? "bg-ember-500/10" : ""}`}>
          <span className={`tabular w-6 text-center font-display font-bold ${i < 3 ? "molten-text" : "text-ash-500"}`}>{i + 1}</span>
          <span className="min-w-0 flex-1 truncate font-semibold">
            {r.name} {r.you && <span className="ml-1 text-[10px] font-bold uppercase text-ember-400">you</span>}
          </span>
          <span className="tabular hidden text-xs text-ash-400 sm:inline">{r.hands} hands</span>
          <span className={`tabular w-20 shrink-0 text-right font-bold sm:w-24 ${r.netUsd >= 0 ? "text-ember-300" : "text-ash-400"}`}>
            {formatUsd(r.netUsd, { sign: true, compact: true })}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="panel rounded-3xl px-5 py-10 text-center text-sm text-ash-400">{text}</div>;
}

function ListSkeleton() {
  return <div className="panel h-72 animate-pulse rounded-3xl" />;
}
