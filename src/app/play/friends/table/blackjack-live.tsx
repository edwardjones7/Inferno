"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PlayingCard } from "@/components/playing-card";
import { choiceLabel, type Decision } from "@/lib/blackjack/coach";
import type { ActionType } from "@/lib/blackjack/engine";
import { TABLES } from "@/lib/blackjack/tables";
import { useNow } from "@/lib/earn";
import { haptic } from "@/lib/haptics";
import type { BjHandView, BjPlayerView, BjPrivate, BjPublic, Private } from "@/lib/online/live";
import { sendMove } from "@/lib/online/tables-client";
import { play } from "@/lib/sound";
import { gainXp, touchDay, update } from "@/lib/store";
import { XP } from "@/lib/streak";
import { TotalBadge } from "../../blackjack/parts";

const LABEL: Partial<Record<ActionType, string>> = {
  hit: "Hit",
  stand: "Stand",
  double: "Double",
  split: "Split",
  surrender: "Surrender",
  insurance: "Insurance",
  decline: "No insurance",
};

const COLS = ["grid-cols-1", "grid-cols-1", "grid-cols-2", "grid-cols-3"];

/** Cooperative blackjack: everyone against one dealer, each with their own coach. */
export function BlackjackLive({ id, pub, priv, me }: { id: string; pub: BjPublic; priv: Private | null; me: string }) {
  const now = useNow(250).getTime();
  const mine = pub.players.find((p) => p.user === me);
  const others = pub.players.filter((p) => p.user !== me);
  const notes = useMemo(() => (priv?.kind === "blackjack" && priv.roundNo === pub.roundNo ? (priv as BjPrivate).notes : []), [priv, pub.roundNo]);
  const [busy, setBusy] = useState(false);
  const settled = pub.phase === "settled";

  // the coach's notes earn streak XP like any graded live decision
  const counted = useRef<string>("");
  useEffect(() => {
    const key = `${pub.roundNo}:${notes.length}`;
    if (!notes.length || counted.current === key) return;
    const prev = counted.current.startsWith(`${pub.roundNo}:`) ? Number(counted.current.split(":")[1]) : 0;
    counted.current = key;
    const fresh = notes.slice(prev);
    const right = fresh.filter((n) => n.ok).length;
    if (fresh.some((n) => !n.ok)) haptic("warning");
    if (right)
      update((p) => {
        gainXp(p, "live", right * XP.liveRight);
        touchDay(p);
      });
  }, [notes, pub.roundNo]);

  const act = async (a: ActionType) => {
    setBusy(true);
    play(a === "hit" || a === "double" || a === "split" ? "card" : "click");
    try {
      await sendMove(id, { kind: "blackjack", action: a });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't act");
    } finally {
      setBusy(false);
    }
  };

  const left = pub.deadline ? Math.max(0, Math.ceil((pub.deadline - now) / 1000)) : null;
  const note = notes.at(-1);

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-4 overflow-y-auto px-3 pt-2">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-brass-300/80">{TABLES[pub.rulesId].short}</p>

        {/* dealer */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-1.5">
            {pub.dealer.map((c, i) => (
              <PlayingCard key={`${pub.roundNo}-d${i}`} card={c} delay={0.1 * i} />
            ))}
          </div>
          {pub.dealerTotal && <TotalBadge total={pub.dealerTotal.total} soft={pub.dealerTotal.soft} bust={pub.dealerTotal.total > 21} hiddenHole={!settled} />}
        </div>

        {/* the rest of the table */}
        {others.length > 0 && (
          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
            {others.map((p) => (
              <Other key={p.user} p={p} settled={settled} />
            ))}
          </div>
        )}

        <AnimatePresence>
          {note && (
            <motion.div
              key={`${pub.roundNo}-${notes.length}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`w-full rounded-2xl px-4 py-2.5 text-sm ring-1 ${note.ok ? "bg-emerald-500/10 ring-emerald-400/40" : "bg-ember-700/15 ring-ember-500/50"}`}
            >
              <CoachLine n={note} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* you */}
      <div className="relative z-10 border-t border-brass-500/30 bg-ash-950/90 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-xl">
        <div className="mx-auto max-w-xl">
          {mine && !mine.out ? (
            <>
              <div className="flex items-end justify-center gap-4">
                {mine.hands.map((h, i) => (
                  <MyHand key={i} h={h} active={mine.phase === "player" && i === mine.active && mine.hands.length > 1} roundNo={pub.roundNo} idx={i} />
                ))}
              </div>
              <p className="tabular mt-2 text-center text-xs text-ash-400">
                {mine.stack.toLocaleString()} table chips
                {settled && mine.net !== null && (
                  <span className={`ml-2 font-bold ${mine.net > 0 ? "text-emerald-300" : mine.net < 0 ? "text-ember-300" : "text-ash-300"}`}>
                    {mine.net > 0 ? "+" : ""}
                    {mine.net}
                  </span>
                )}
              </p>
              {mine.legal.length > 0 ? (
                <div className={`mt-3 grid gap-2 ${COLS[Math.min(3, mine.legal.length)]}`}>
                  {mine.legal.map((a) => (
                    <button key={a} disabled={busy} onClick={() => void act(a)} className={`${a === "stand" || a === "decline" ? "btn-ash" : "btn-fire"} h-12 rounded-xl text-sm font-bold disabled:opacity-60`}>
                      {LABEL[a]}
                      {mine.costs[a] ? <span className="block text-[10px] font-semibold opacity-80">+{mine.costs[a]}</span> : null}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-center text-sm text-ash-300">
                  {settled ? (pub.nextAt ? `Next round in ${Math.max(0, Math.ceil((pub.nextAt - now) / 1000))}s` : " ") : `Waiting for the table${left !== null ? ` · ${left}s` : ""}`}
                </p>
              )}
              {mine.phase === "player" && left !== null && left <= 10 && <p className="mt-2 text-center text-xs font-bold text-ember-300">{left}s left, then you stand</p>}
            </>
          ) : (
            <p className="py-4 text-center text-sm text-ash-300">{mine?.left ? "You left the table." : "Sitting this round out: not enough table chips for the bet."}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CoachLine({ n }: { n: Decision }) {
  return n.ok ? (
    <p className="font-bold text-emerald-200">Right play: {choiceLabel(n.chosen).toLowerCase()}.</p>
  ) : (
    <div>
      <p className="font-bold text-ember-100">
        The book says {choiceLabel(n.correct).toLowerCase()}, not {choiceLabel(n.chosen).toLowerCase()}.
      </p>
      {n.why && <p className="mt-0.5 text-xs text-ash-300">{n.why}</p>}
    </div>
  );
}

function MyHand({ h, active, roundNo, idx }: { h: BjHandView; active: boolean; roundNo: number; idx: number }) {
  return (
    <div className={`flex flex-col items-center gap-1.5 rounded-2xl p-1.5 ${active ? "ring-1 ring-ember-400" : ""}`}>
      <div className="flex -space-x-8 sm:-space-x-10">
        {h.cards.map((c, i) => (
          <PlayingCard key={`${roundNo}-${idx}-${i}`} card={c} delay={0.08 * i} />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <TotalBadge total={h.total} soft={h.soft} bust={h.total > 21} active={active} />
        {h.result && <Result r={h.result} />}
      </div>
    </div>
  );
}

function Result({ r }: { r: NonNullable<BjHandView["result"]> }) {
  const label = { win: "Win", lose: "Lose", push: "Push", blackjack: "Blackjack", surrender: "Surrender" }[r];
  const good = r === "win" || r === "blackjack";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${good ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/50" : r === "push" ? "bg-ash-800 text-ash-200 ring-ash-600" : "bg-ember-700/20 text-ember-200 ring-ember-500/50"}`}>{label}</span>;
}

function Other({ p, settled }: { p: BjPlayerView; settled: boolean }) {
  return (
    <div className={`rounded-2xl bg-ash-950/70 p-2 ring-1 ${p.phase === "player" || p.phase === "insurance" ? "ring-ember-500/50" : "ring-ash-800"} ${p.out ? "opacity-50" : ""}`}>
      <p className="truncate text-[11px] font-bold text-bone">{p.name}</p>
      <p className="tabular text-[10px] text-ash-400">
        {p.left ? "Left" : p.out ? "Sitting out" : p.stack.toLocaleString()}
        {settled && p.net ? <span className={p.net > 0 ? "text-emerald-300" : "text-ember-300"}> {p.net > 0 ? "+" : ""}{p.net}</span> : null}
      </p>
      {p.hands.map((h, i) => (
        <div key={i} className="mt-1 flex items-center gap-1">
          <div className="flex flex-wrap gap-0.5">
            {h.cards.map((c, j) => (
              <PlayingCard key={j} card={c} small />
            ))}
          </div>
          <span className="tabular ml-1 text-[11px] font-bold text-ash-200">{h.total}</span>
          {h.result && <span className="text-[10px] font-semibold text-ash-400">{h.result}</span>}
        </div>
      ))}
      <p className="mt-1 text-[10px] font-semibold text-ash-500">{p.phase === "player" ? "Thinking…" : p.phase === "insurance" ? "Insurance?" : p.phase === "waiting" ? "Done" : ""}</p>
    </div>
  );
}
