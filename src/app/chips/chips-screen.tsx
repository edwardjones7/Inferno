"use client";

import { ChallengeRow, CheckInCard, ChipDot, EarnList, untilText } from "@/components/earn";
import { PageHeader, SectionTitle } from "@/components/ui";
import { CHALLENGES, challengesFor } from "@/lib/challenges";
import { formatChips, unitsToChips } from "@/lib/chips";
import { CASH_BUY_IN, type GrantReason } from "@/lib/economy";
import { useNow, useSettleLeftSeat } from "@/lib/earn";
import { useHydrated, useProgress } from "@/lib/store";

const REASON: Record<GrantReason, string> = {
  checkin: "Daily check-in",
  challenge: "Challenge",
  ad: "Rewarded ad",
  comeback: "Comeback chips",
  "pro-signup": "Pro welcome bonus",
  "pro-monthly": "Pro monthly chips",
  streak: "Streak milestone",
};

function when(at: number, now: number) {
  const d = Math.floor((now - at) / 86_400_000);
  if (d <= 0) return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d === 1) return "Yesterday";
  return new Date(at).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function ChipsScreen() {
  useSettleLeftSeat();
  const p = useProgress();
  const hydrated = useHydrated();
  const now = useNow();
  const day = hydrated ? challengesFor("day", p, now) : [];
  const week = hydrated ? challengesFor("week", p, now) : [];
  const balance = unitsToChips(p.chips);
  const titleOf = (id?: string) => CHALLENGES.find((c) => c.id === id)?.title;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-5 sm:px-6 lg:pt-10">
      <PageHeader eyebrow="Chips" title="Earn chips">
        <div className="panel flex items-center gap-2.5 rounded-2xl px-4 py-2.5">
          <ChipDot className="h-5 w-5" />
          <span className="tabular font-display text-2xl font-bold">{hydrated ? formatChips(balance) : "–"}</span>
        </div>
      </PageHeader>
      <p className="-mt-2 mb-6 max-w-xl text-sm leading-relaxed text-ash-400">
        One balance for blackjack and the poker cash game (a full buy-in is {formatChips(CASH_BUY_IN)}). Chips are play money: they can&apos;t be bought or
        cashed out. Earn them by showing up, training and playing well.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div className="grid min-w-0 grid-cols-1 content-start gap-6">
          <CheckInCard />

          <section>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-base font-bold sm:text-lg">Today</h2>
              {day[0] && <span className="text-xs text-ash-500">New in {untilText(day[0].ends - now.getTime())}</span>}
            </div>
            <ul className="grid grid-cols-1 gap-2">
              {day.map((c) => (
                <ChallengeRow key={c.key} c={c} />
              ))}
            </ul>
          </section>

          <section>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-base font-bold sm:text-lg">This week</h2>
              {week[0] && <span className="text-xs text-ash-500">New in {untilText(week[0].ends - now.getTime())}</span>}
            </div>
            <ul className="grid grid-cols-1 gap-2">
              {week.map((c) => (
                <ChallengeRow key={c.key} c={c} />
              ))}
            </ul>
          </section>
        </div>

        <div className="grid min-w-0 grid-cols-1 content-start gap-6">
          <section>
            <SectionTitle title="More chips" />
            <EarnList skip={["checkin", "challenges"]} />
            <p className="mt-2 px-1 text-[11px] text-ash-500">Lessons, drills and puzzles never cost chips.</p>
          </section>

          {hydrated && p.economy.ledger.length > 0 && (
            <section>
              <SectionTitle title="Recent" />
              <ul className="panel divide-y divide-ash-800/80 rounded-3xl px-4">
                {p.economy.ledger
                  .slice(-12)
                  .reverse()
                  .map((e, i) => (
                    <li key={`${e.at}-${i}`} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ash-200">{e.reason === "challenge" ? (titleOf(e.note) ?? REASON.challenge) : REASON[e.reason]}</span>
                        <span className="block text-[11px] text-ash-500">{when(e.at, now.getTime())}</span>
                      </span>
                      <span className="tabular font-bold text-ember-200">+{formatChips(e.chips)}</span>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
