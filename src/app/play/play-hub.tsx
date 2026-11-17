"use client";

import Link from "next/link";
import { BotAvatar } from "@/components/bot-avatar";
import { IconChevron } from "@/components/icons";
import { SceneArt } from "@/components/scene-art";
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
  const beaten = hydrated ? p.beaten.length : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-5 sm:px-6 lg:pt-10">
      <PageHeader eyebrow="Tables" title="Pick a table" />

      <div className="grid gap-3">
        {/* poker vs bots: the ladder, so it gets the big poster */}
        <Link
          href="/play/poker/"
          className="deco-corners pressable group relative flex min-h-[380px] flex-col justify-end overflow-hidden rounded-3xl ring-1 ring-ash-800 sm:min-h-[420px]"
        >
          <SceneArt base="/tables/heads-up" className="transition-transform duration-1000 group-hover:scale-[1.03]" />

          {/* the whole ladder, top right: who's beaten, who's next, who's still locked */}
          <div className="absolute right-4 top-4 hidden gap-1.5 sm:flex sm:right-6 sm:top-6">
            {ROSTER.map((b) => (
              <span key={b.id} className={b.id === next.id ? "" : "opacity-80"}>
                <BotAvatar bot={b} size={40} ring={b.id === next.id} locked={hydrated && !isUnlocked(b.id, p.beaten)} />
              </span>
            ))}
          </div>

          <div className="relative p-5 sm:p-8">
            <p className="eyebrow">Hold&apos;em · Heads-up ladder</p>
            <h2 className="mt-1 font-marquee text-4xl sm:text-5xl">Poker vs bots</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ash-300">
              Eight bots, each with their own style and rating. Beat one to unlock the next. Your poker rating moves with every match.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
              <span className="btn-fire inline-flex h-11 items-center gap-2 rounded-xl pl-1.5 pr-4 text-sm font-bold">
                <BotAvatar bot={next} size={32} />
                Play {next.name}
                <IconChevron className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="flex gap-1">
                  {ROSTER.map((b, i) => (
                    <span key={b.id} className={`h-1.5 w-5 rounded-full ${i < beaten ? "bg-ember-400" : b.id === next.id ? "bg-ember-700" : "bg-ash-700"}`} />
                  ))}
                </span>
                <span className="tabular mt-1 block text-[11px] text-ash-400">
                  {beaten} of {ROSTER.length} beaten
                </span>
              </span>
            </div>
          </div>
        </Link>

        <div className="grid gap-3 sm:grid-cols-2">
          <TableCard
            href="/play/blackjack/"
            art="/tables/blackjack"
            eyebrow="vs the dealer"
            title="Blackjack"
            blurb="3D table, four rule sets, a coach on every decision."
            cta="Deal me in"
            meta={<span className="tabular text-xs font-semibold text-ash-300">{hydrated ? `${formatChips(unitsToChips(p.chips))} chips` : " "}</span>}
          />
          <TableCard
            href="/play/poker/table/"
            art="/tables/cash-game"
            eyebrow="Hold'em · 6-max"
            title="Cash game"
            blurb="Five bots, endless hands. Buy in from your chips and practise multiway pots with no rating on the line."
            cta="Sit down"
            meta={
              <span className="flex -space-x-2.5">
                {TABLE_LINEUP.map((id) => (
                  <BotAvatar key={id} bot={botById(id)!} size={30} />
                ))}
              </span>
            }
          />
        </div>
      </div>
    </div>
  );
}

function TableCard({
  href,
  art,
  eyebrow,
  title,
  blurb,
  cta,
  meta,
}: {
  href: string;
  art: string;
  eyebrow: string;
  title: string;
  blurb: string;
  cta: string;
  meta: React.ReactNode;
}) {
  return (
    <Link href={href} className="deco-corners pressable group relative flex min-h-[320px] flex-col justify-end overflow-hidden rounded-3xl ring-1 ring-ash-800">
      <SceneArt base={art} className="transition-transform duration-1000 group-hover:scale-[1.04]" />
      <div className="relative p-5 sm:p-6">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-1 font-marquee text-3xl">{title}</h2>
        <p className="mt-1.5 text-sm text-ash-300">{blurb}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="btn-fire inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-bold">
            {cta}
            <IconChevron className="h-4 w-4" />
          </span>
          {meta}
        </div>
      </div>
    </Link>
  );
}
