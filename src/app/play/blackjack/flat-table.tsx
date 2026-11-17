"use client";

import { AnimatePresence, motion } from "motion/react";
import { Chip, chipsFor } from "@/components/chip";
import { PlayingCard } from "@/components/playing-card";
import type { RoundView } from "@/lib/blackjack/engine";
import type { TableInfo } from "@/lib/blackjack/tables";
import { formatChips } from "@/lib/chips";
import { ResultTag, TotalBadge } from "./parts";
import { playerKey, type Timing } from "./timing";

/**
 * The 2D table, used only on devices without WebGL. Same information as the 3D scene:
 * dealer, hands, stakes and the rules printed on the felt.
 */
export function FlatTable({
  view,
  roundId,
  timing,
  revealed,
  table,
  bet,
  toUsd,
  dimRules,
}: {
  view: RoundView | null;
  roundId: string | null;
  timing: Timing;
  revealed: boolean;
  table: TableInfo;
  bet: number;
  toUsd: (units: number) => number;
  /** fade the printed rules while the outcome banner is up */
  dimRules: boolean;
}) {
  const inPlay = !!view && view.phase !== "settled";
  const settledShown = !!view && view.phase === "settled" && revealed;
  return (
    <div className="felt relative isolate flex h-full flex-col justify-center overflow-hidden px-3 py-5 sm:px-8">
      {/* dealer */}
      <div className="flex min-h-[150px] flex-col items-center sm:min-h-[180px]">
        <Label>Dealer</Label>
        <div key={roundId ?? "none"} className="mt-2 flex h-[92px] items-start sm:h-[120px]">
          {view?.dealer.map((c, i) => (
            <div key={`d${i}`} className={i ? "-ml-[34px] sm:-ml-[44px]" : ""}>
              <PlayingCard
                card={c}
                delay={timing.delays[`d${i}`] ?? 0}
                flipDelay={i === 1 ? timing.flip : 0}
                flipDuration={i === 1 ? timing.flipDuration : undefined}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 h-7">
          {view?.dealerTotal && (
            <TotalBadge
              total={revealed || view.phase !== "settled" ? view.dealerTotal.total : null}
              soft={view.dealerTotal.soft}
              hiddenHole={!view.dealer[1]}
              bust={settledShown && view.dealerTotal.total > 21}
            />
          )}
        </div>
      </div>

      {/* rules arc */}
      <div className={`pointer-events-none my-3 select-none text-center transition-opacity duration-300 sm:my-5 ${dimRules ? "opacity-0" : ""}`}>
        <p className="font-display text-[10px] font-bold uppercase tracking-[0.35em] text-ember-400/70 sm:text-xs">
          Blackjack pays {table.rules.blackjackPays === 1.5 ? "3 to 2" : "6 to 5"}
        </p>
        <div className="mx-auto my-1.5 h-px w-2/3 max-w-sm bg-gradient-to-r from-transparent via-ember-500/50 to-transparent" />
        <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-ash-500 sm:text-[10px]">
          {table.rules.dealerHitsSoft17 ? "Dealer hits soft 17" : "Dealer stands on all 17s"} · Insurance pays 2 to 1
        </p>
      </div>

      {/* player */}
      <div className="flex min-h-[210px] flex-wrap items-end justify-center gap-x-6 gap-y-4 sm:min-h-[230px] sm:gap-x-10">
        {view ? (
          view.hands.map((h, hi) => {
            const active = inPlay && view.phase === "player" && hi === view.active;
            const finished = settledShown && h.result;
            return (
              <motion.div layout key={`${roundId}:${hi}`} className="flex flex-col items-center">
                <div className="mb-2 h-7">
                  <AnimatePresence>
                    {finished && <ResultTag result={h.result!} payoutUsd={toUsd(h.payout ?? 0)} betUsd={toUsd(h.bet)} />}
                  </AnimatePresence>
                </div>
                <div className={`flex rounded-2xl p-2 transition-all ${active && view.hands.length > 1 ? "animate-glow bg-ember-500/5" : ""}`}>
                  {h.cards.map((c, i) => (
                    <div key={playerKey(hi, i, c)} className={i ? "-ml-[34px] sm:-ml-[44px]" : ""} style={{ marginTop: i * 2 }}>
                      <PlayingCard
                        card={c}
                        delay={timing.delays[playerKey(hi, i, c)] ?? 0}
                        dim={!!finished && (h.result === "lose" || h.result === "surrender")}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <TotalBadge total={h.total} soft={h.soft} bust={h.total > 21} active={active} />
                  <span className="tabular flex items-center gap-1.5 rounded-full bg-ash-950/70 px-2.5 py-1 text-xs font-semibold text-ember-200 ring-1 ring-ash-700">
                    {formatChips(toUsd(h.bet))}
                    {h.doubled && <span className="text-[10px] text-ember-400">×2</span>}
                  </span>
                </div>
              </motion.div>
            );
          })
        ) : (
          <EmptySeat bet={bet} />
        )}
      </div>

      {view?.insurance && (
        <p className="mt-3 text-center text-xs text-ash-400">
          Insurance {formatChips(toUsd(view.insurance.bet))}
          {view.phase === "settled" && revealed && (view.insurance.payout ? " · paid 2:1" : " · lost")}
        </p>
      )}
    </div>
  );
}

function EmptySeat({ bet }: { bet: number }) {
  return (
    <div className="flex flex-col items-center gap-3 pb-4">
      <div className="grid h-28 w-28 place-items-center rounded-full border-2 border-dashed border-ember-500/40 bg-ember-500/5 shadow-[inset_0_0_30px_rgba(255,90,31,0.15)]">
        <div className="relative h-12 w-12">
          {(bet > 0 ? chipsFor(bet, 5) : []).map((v, i) => (
            <motion.span key={`${i}-${v}`} initial={{ y: -30, opacity: 0 }} animate={{ y: -i * 5, opacity: 1 }} className="absolute left-0 top-0">
              <Chip value={v} size={48} />
            </motion.span>
          ))}
        </div>
      </div>
      <p className="tabular font-display text-lg font-bold text-ember-200">{formatChips(bet)}</p>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-ash-500">{children}</span>;
}
