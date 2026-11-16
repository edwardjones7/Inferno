"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { botById, isUnlocked } from "@/lib/poker/roster";
import { useHydrated, useProgress } from "@/lib/store";
import { PokerTable } from "../poker-table";

export function MatchScreen() {
  const id = useSearchParams().get("bot");
  const bot = botById(id);
  const p = useProgress();
  const hydrated = useHydrated();
  if (!hydrated) return <div className="felt h-[min(58dvh,460px)] animate-pulse rounded-[28px]" />;
  if (!bot || !isUnlocked(bot.id, p.beaten)) {
    return (
      <div className="panel mx-auto mt-10 max-w-sm rounded-3xl p-6 text-center">
        <p className="font-display text-lg font-bold">{bot ? `${bot.name} is locked` : "Pick an opponent"}</p>
        <p className="mt-1 text-sm text-ash-400">{bot ? "Beat the bot before them on the ladder first." : "That bot doesn't exist."}</p>
        <Link href="/play/poker/" className="btn-fire mt-5 inline-flex h-11 items-center rounded-xl px-5 font-bold">
          Choose a bot
        </Link>
      </div>
    );
  }
  return <PokerTable key={bot.id} mode="match" botId={bot.id} />;
}
