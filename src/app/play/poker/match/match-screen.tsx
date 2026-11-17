"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ProLock } from "@/components/pro/pro-badge";
import { botLocked, paywallReason } from "@/lib/gates";
import { botById, isUnlocked, TIER_LABEL } from "@/lib/poker/roster";
import { useIsPro } from "@/lib/pro";
import { useHydrated, useProgress } from "@/lib/store";
import { PokerTable } from "../poker-table";

export function MatchScreen() {
  const id = useSearchParams().get("bot");
  const bot = botById(id);
  const p = useProgress();
  const hydrated = useHydrated();
  const pro = useIsPro();
  if (!hydrated) return <div className="felt absolute inset-0 animate-pulse" />;
  if (!bot || !isUnlocked(bot.id, p.beaten)) {
    return (
      <div className="panel mx-auto mt-[calc(env(safe-area-inset-top)+80px)] max-w-sm rounded-3xl p-6 text-center">
        <p className="font-display text-lg font-bold">{bot ? `${bot.name} is locked` : "Pick an opponent"}</p>
        <p className="mt-1 text-sm text-ash-400">{bot ? "Beat the bot before them on the ladder first." : "That bot doesn't exist."}</p>
        <Link href="/play/poker/" className="btn-fire mt-5 inline-flex h-11 items-center rounded-xl px-5 font-bold">
          Choose a bot
        </Link>
      </div>
    );
  }
  if (botLocked(bot.id, pro)) {
    return (
      <div className="mx-auto mt-[calc(env(safe-area-inset-top)+64px)] max-w-md px-4">
        <ProLock
          reason={paywallReason.bot(bot.id)}
          title={`${bot.name} plays for members`}
          secondary={
            <Link href="/play/poker/" className="flex h-10 items-center justify-center rounded-xl text-xs font-semibold text-ash-400 hover:text-bone">
              Back to the ladder
            </Link>
          }
        >
          {TIER_LABEL[bot.tier]} bots, the top of the ladder, come with Pro. Every other bot and the 6-max cash game stay free.
        </ProLock>
      </div>
    );
  }
  return <PokerTable key={bot.id} mode="match" botId={bot.id} />;
}
