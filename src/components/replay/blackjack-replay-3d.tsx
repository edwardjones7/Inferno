"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { GameScreen } from "@/components/game-screen";
import { outcome, schedule } from "@/app/play/blackjack/timing";
import { OutcomeBanner } from "@/app/play/blackjack/parts";
import { handTotal } from "@/lib/blackjack/cards";
import { choiceLabel } from "@/lib/blackjack/coach";
import type { RoundView } from "@/lib/blackjack/engine";
import { tableOf } from "@/lib/blackjack/tables";
import { unitsToChips } from "@/lib/chips";
import { resolveQuality, useGraphics } from "@/lib/settings";
import { play } from "@/lib/sound";
import type { BjRoundRecord } from "@/lib/store";

const Table3D = dynamic(() => import("@/game/three/table-3d"), {
  ssr: false,
  loading: () => <div className="felt absolute inset-0 animate-pulse" />,
});

/** The settled table as it ended, rebuilt from the saved round. */
function viewOf(r: BjRoundRecord): RoundView {
  const perHand = r.hands.length ? Math.round(r.wagered / r.hands.length) : r.bet;
  return {
    phase: "settled",
    dealer: r.dealer,
    dealerTotal: handTotal(r.dealer),
    hands: r.hands.map((h) => ({
      cards: h.cards,
      ...handTotal(h.cards),
      total: h.total,
      bet: perHand,
      doubled: false,
      fromSplit: r.hands.length > 1,
      splitAces: false,
      surrendered: h.result === "surrender",
      done: true,
      result: h.result,
    })),
    active: 0,
    baseBet: r.bet,
    insurance: null,
    dealerBlackjack: r.dealer.length === 2 && handTotal(r.dealer).total === 21,
    wagered: r.wagered,
    payout: r.payout,
    legal: [],
    costs: {},
  };
}

/**
 * Deals a saved blackjack round again on the 3D table and walks through your decisions
 * with the coach's verdict on each. Opens as a full-screen overlay.
 */
export function BlackjackReplay3D({ round, onClose }: { round: BjRoundRecord; onClose: () => void }) {
  const view = useMemo(() => viewOf(round), [round]);
  const timing = useMemo(() => schedule(null, view), [view]);
  const [n, setN] = useState(1);
  const [revealed, setRevealed] = useState(false);
  const [step, setStep] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [graphics] = useGraphics();
  const quality = resolveQuality(graphics);

  useEffect(() => {
    Object.values(timing.delays).forEach((d) => play("card", d));
    timer.current = setTimeout(() => setRevealed(true), timing.total * 1000);
    return () => clearTimeout(timer.current);
  }, [timing, n]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const again = () => {
    clearTimeout(timer.current);
    setRevealed(false);
    setN((k) => k + 1);
  };

  const result = revealed ? outcome(view) : null;
  const d = round.decisions[step];
  const table = tableOf(round.tableId);

  return (
    <div className="fixed inset-0 z-50 bg-ash-950" role="dialog" aria-modal="true" aria-label="Round replay">
      <GameScreen
        title="Blackjack round replay"
        onBack={onClose}
        drawerOpen={false}
        onDrawerChange={() => {}}
        hud={
          <span className="rounded-xl bg-sky-500/15 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-sky-200 ring-1 ring-sky-400/40 backdrop-blur-md">
            Replay · {table.name}
          </span>
        }
        bottom={
          <div className="flex flex-col gap-2.5 pb-1">
            {round.decisions.length > 0 ? (
              <div className="rounded-2xl bg-ash-950/80 p-3 ring-1 ring-ash-700/70 backdrop-blur-md" aria-live="polite">
                <div className="flex items-center justify-between gap-2 caps-label">
                  <span>
                    Decision {step + 1} of {round.decisions.length}
                  </span>
                  <span className={d.ok ? "text-emerald-300" : "text-ember-300"}>{d.ok ? "Right play" : "Mistake"}</span>
                </div>
                <p className="mt-1 text-sm text-ash-100">
                  <span className="font-bold text-bone">{d.label}:</span> you chose {choiceLabel(d.chosen).toLowerCase()}
                  {d.ok ? "." : <>, the right play is <span className="font-bold text-ember-300">{choiceLabel(d.correct).toLowerCase()}</span>.</>}
                  {d.why && <span className="block pt-1 text-xs text-ash-400">{d.why}</span>}
                </p>
                {round.decisions.length > 1 && (
                  <div className="mt-2 flex justify-end gap-2">
                    <button disabled={step === 0} onClick={() => setStep((s) => s - 1)} className="btn-ash h-9 rounded-lg px-3 text-xs font-bold">
                      Previous
                    </button>
                    <button disabled={step >= round.decisions.length - 1} onClick={() => setStep((s) => s + 1)} className="btn-ash h-9 rounded-lg px-3 text-xs font-bold">
                      Next
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-center text-sm text-ash-300">No decisions this round (a natural or an early dealer blackjack).</p>
            )}
            <button onClick={again} className="btn-fire mx-auto h-11 min-w-40 rounded-xl px-5 text-sm font-bold">
              Deal it again
            </button>
          </div>
        }
      >
        <Table3D
          fill
          quality={quality}
          view={view}
          roundId={`replay-${round.id}-${n}`}
          timing={timing}
          epoch={n}
          revealed={revealed}
          pendingBetUsd={0}
          toUsd={unitsToChips}
          fx={{ heat: 0, drama: false, blackjackKey: 0, winKey: 0, loseKey: 0 }}
          tableId={round.tableId}
        />
        <div className="pointer-events-none absolute inset-x-0 top-[30%] z-20 h-[30%]">
          <OutcomeBanner result={result} roundId={`replay-${n}`} />
        </div>
      </GameScreen>
    </div>
  );
}
