"use client";

import Link from "next/link";
import { BotAvatar } from "@/components/bot-avatar";
import { Chip } from "@/components/chip";
import { IconChevron } from "@/components/icons";
import { PlayingCardStatic } from "@/components/playing-card-static";
import { PageHeader } from "@/components/ui";
import { formatChips, unitsToChips } from "@/lib/chips";
import { useSettleLeftSeat } from "@/lib/earn";
import { botById, isUnlocked, ROSTER, TABLE_LINEUP } from "@/lib/poker/roster";
import { useHydrated, useProgress } from "@/lib/store";

export function PlayHub() {
  useSettleLeftSeat();
  const p = useProgress();
  const hydrated = useHydrated();
  const next = ROSTER.find((b) => !p.beaten.includes(b.id) && isUnlocked(b.id, p.beaten)) ?? ROSTER[ROSTER.length - 1];
  const beaten = p.beaten.length;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-5 sm:px-6 lg:pt-10">
      <PageHeader eyebrow="Play" title="Pick a game" />

      <div className="grid gap-3">
        {/* poker vs bots */}
        <Link href="/play/poker/" className="felt pressable group relative overflow-hidden rounded-[28px] p-5 sm:p-7">
          <div className="absolute -right-4 top-1/2 hidden -translate-y-1/2 sm:block">
            <div className="grid grid-cols-4 gap-2 opacity-90">
              {ROSTER.map((b) => (
                <BotAvatar key={b.id} bot={b} size={52} dim={hydrated && !isUnlocked(b.id, p.beaten)} />
              ))}
            </div>
          </div>
          <div className="relative max-w-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-ember-300">Hold&apos;em · Heads-up</p>
            <h2 className="mt-1 font-display text-3xl font-black">Poker vs bots</h2>
            <p className="mt-2 text-sm leading-relaxed text-ash-300">
              Eight bots, each with their own style and rating. Beat one to unlock the next. Your poker rating moves with every match.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <BotAvatar bot={next} size={40} ring />
              <div className="text-xs">
                <p className="font-bold text-bone">Next: {next.name}</p>
                <p className="text-ash-400">{hydrated ? `${beaten} of ${ROSTER.length} beaten` : " "}</p>
              </div>
            </div>
          </div>
        </Link>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* blackjack */}
          <Link href="/play/blackjack/" className="panel pressable group relative flex min-h-52 flex-col justify-end overflow-hidden rounded-[28px] p-5 sm:p-6">
            <div className="absolute right-2 top-3 flex rotate-6 transition-transform duration-500 group-hover:rotate-0">
              <div className="-rotate-12 scale-75">
                <PlayingCardStatic card="AS" />
              </div>
              <div className="-ml-14 rotate-3 scale-75">
                <PlayingCardStatic card="KH" />
              </div>
            </div>
            <div className="absolute bottom-24 right-6 rotate-12">
              <Chip value={500} size={40} />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-ember-300">vs the dealer</p>
            <h2 className="mt-1 font-display text-2xl font-black">Blackjack</h2>
            <p className="mt-1 text-sm text-ash-300">3D table, four rule sets, a coach on every decision.</p>
            <p className="tabular mt-3 text-xs font-semibold text-ash-400">{hydrated ? `${formatChips(unitsToChips(p.chips))} chips` : " "}</p>
          </Link>

          {/* 6-max */}
          <Link href="/play/poker/table/" className="panel pressable group relative flex min-h-52 flex-col justify-end overflow-hidden rounded-[28px] p-5 sm:p-6">
            <div className="absolute right-5 top-5 flex -space-x-3">
              {TABLE_LINEUP.map((id) => (
                <BotAvatar key={id} bot={botById(id)!} size={38} />
              ))}
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-ember-300">Hold&apos;em · 6-max</p>
            <h2 className="mt-1 font-display text-2xl font-black">Cash game</h2>
            <p className="mt-1 text-sm text-ash-300">Five bots, endless hands. Buy in from your chips and practise multiway pots with no rating on the line.</p>
            <span className="mt-3 flex items-center gap-1 text-xs font-bold text-ember-400">
              Sit down <IconChevron className="h-3.5 w-3.5" />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
