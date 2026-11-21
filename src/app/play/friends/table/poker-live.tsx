"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PlayingCard } from "@/components/playing-card";
import { useNow } from "@/lib/earn";
import { haptic } from "@/lib/haptics";
import type { PokerPrivate, PokerPublic, PokerSeatView, Private } from "@/lib/online/live";
import { sendMove } from "@/lib/online/tables-client";
import type { PlayerAction } from "@/lib/poker/game-types";
import { play } from "@/lib/sound";

/** Seat positions around the oval, as % of the felt; index 0 is you (bottom centre). */
const SPOTS: Record<number, [number, number][]> = {
  2: [[50, 86], [50, 10]],
  3: [[50, 86], [17, 28], [83, 28]],
  4: [[50, 86], [16, 50], [50, 10], [84, 50]],
  5: [[50, 86], [16, 60], [27, 16], [73, 16], [84, 60]],
  6: [[50, 86], [16, 64], [17, 26], [50, 9], [83, 26], [84, 64]],
};

export function PokerLive({ id, pub, priv, me }: { id: string; pub: PokerPublic; priv: Private | null; me: string }) {
  const now = useNow(250).getTime();
  const mine = pub.seats.find((s) => s.user === me);
  const myHole = priv?.kind === "poker" && priv.handNo === pub.handNo ? (priv as PokerPrivate).hole : [];
  const myTurn = pub.toAct !== null && pub.seats[pub.toAct]?.user === me;
  const [busy, setBusy] = useState(false);
  const [raising, setRaising] = useState(false);

  // you sit at the bottom; everyone else follows clockwise
  const order = useMemo(() => {
    const i = Math.max(0, pub.seats.findIndex((s) => s.user === me));
    return [...pub.seats.slice(i), ...pub.seats.slice(0, i)];
  }, [pub.seats, me]);
  const spots = SPOTS[Math.min(6, Math.max(2, order.length))];

  // a nudge when it becomes your turn
  const wasTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !wasTurn.current) haptic("medium");
    wasTurn.current = myTurn;
  }, [myTurn]);

  const act = async (a: PlayerAction) => {
    setBusy(true);
    setRaising(false);
    play("chip");
    try {
      await sendMove(id, { kind: "poker", action: a });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't act");
    } finally {
      setBusy(false);
    }
  };

  const done = pub.street === "done";
  const L = pub.legal;
  const left = pub.deadline ? Math.max(0, pub.deadline - now) : null;
  const winText = done && pub.winners.length ? winnersText(pub) : null;

  if (pub.over) return null;

  return (
    <div className="flex h-full flex-col">
      {/* the felt */}
      <div className="relative mx-auto w-full max-w-xl flex-1">
        <div className="absolute inset-x-[6%] inset-y-[14%] rounded-[50%] border-[10px] border-[#2a1a10] shadow-[inset_0_0_60px_rgba(0,0,0,0.6),0_0_0_2px_rgb(174_147_93/0.35),0_20px_50px_rgba(0,0,0,0.6)]" />

        {/* board and pot */}
        <div className="absolute left-1/2 top-[44%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
          <div className="flex gap-1">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={`${pub.handNo}-${i}`} className="h-[46px] w-[33px]">
                {pub.board[i] && <PlayingCard card={pub.board[i]} small delay={0.05 * i} />}
              </div>
            ))}
          </div>
          <span className="tabular rounded-full bg-ash-950/80 px-3 py-1 text-xs font-bold text-ember-200 ring-1 ring-brass-500/40">
            Pot {(pub.pot || pub.winners.reduce((n, w) => n + w.amount, 0)).toLocaleString()}
          </span>
        </div>

        {order.map((s, k) => (
          <Seat key={s.id} s={s} pub={pub} at={spots[k]} me={s.user === me} turn={pub.toAct === s.id} left={pub.toAct === s.id ? left : null} />
        ))}

        <AnimatePresence>
          {winText && (
            <motion.div
              key={pub.handNo}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-6 top-[58%] mx-auto max-w-sm rounded-2xl bg-ash-950/90 px-4 py-2.5 text-center text-sm font-bold text-bone ring-1 ring-brass-500/50"
            >
              {winText}
              {pub.nextAt && <span className="block text-[11px] font-semibold text-ash-400">Next hand in {Math.max(0, Math.ceil((pub.nextAt - now) / 1000))}s</span>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* you */}
      <div className="relative z-10 border-t border-brass-500/30 bg-ash-950/90 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="flex gap-1.5">
            {myHole.length ? myHole.map((c) => <PlayingCard key={`${pub.handNo}-${c}`} card={c} />) : <div className="h-[92px] sm:h-[120px]" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-bone">{mine?.name ?? "You"}</p>
            <p className="tabular text-xs text-ash-400">{(mine?.stack ?? 0).toLocaleString()} table chips</p>
            <p className="mt-1 text-xs font-semibold text-ember-200">
              {myTurn ? (left !== null ? `Your move · ${Math.ceil(left / 1000)}s` : "Your move") : done ? " " : mine?.folded ? "Folded" : `${pub.toAct !== null ? pub.seats[pub.toAct].name : "…"} to act`}
            </p>
          </div>
        </div>

        {myTurn && L && (
          <div className="mx-auto mt-3 max-w-xl">
            {raising ? (
              <RaisePicker pub={pub} onPick={(to) => void act({ kind: "raise", to })} onCancel={() => setRaising(false)} />
            ) : (
              <div className={`grid gap-2 ${L.canCheck ? "grid-cols-2" : "grid-cols-3"}`}>
                {!L.canCheck && (
                  <button disabled={busy} onClick={() => void act({ kind: "fold" })} className="btn-ash h-12 rounded-xl text-sm font-bold">
                    Fold
                  </button>
                )}
                <button disabled={busy} onClick={() => void act(L.canCheck ? { kind: "check" } : { kind: "call" })} className="btn-ash h-12 rounded-xl text-sm font-bold">
                  {L.canCheck ? "Check" : L.toCall >= (mine?.stack ?? Infinity) ? "Call all-in" : `Call ${L.toCall.toLocaleString()}`}
                </button>
                <button disabled={busy || !L.canRaise} onClick={() => setRaising(true)} className="btn-fire h-12 rounded-xl text-sm font-bold disabled:opacity-40">
                  {L.isOpeningBet ? "Bet" : "Raise"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function winnersText(pub: PokerPublic): string {
  const byName = new Map<string, number>();
  for (const w of pub.winners) {
    const name = pub.seats[w.seat]?.name ?? "?";
    byName.set(name, (byName.get(name) ?? 0) + w.amount);
  }
  const hand = pub.winners.find((w) => w.hand)?.hand;
  return [...byName].map(([n, a]) => `${n} wins ${a.toLocaleString()}`).join(" · ") + (hand ? ` with ${hand}` : "");
}

function Seat({ s, pub, at, me, turn, left }: { s: PokerSeatView; pub: PokerPublic; at: [number, number]; me: boolean; turn: boolean; left: number | null }) {
  const shown = pub.shown[s.id];
  const showBacks = !me && s.dealt && !s.folded && !shown;
  return (
    <div className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1" style={{ left: `${at[0]}%`, top: `${at[1]}%` }}>
      {!me && (
        <div className="flex h-[46px] gap-0.5">
          {shown ? shown.map((c) => <PlayingCard key={c} card={c} small />) : showBacks ? [0, 1].map((i) => <PlayingCard key={i} card={null} small />) : null}
        </div>
      )}
      <div
        className={`relative min-w-[84px] rounded-xl px-2.5 py-1.5 text-center ring-1 ${
          turn ? "bg-ember-700/30 ring-ember-400 shadow-[0_0_18px_-4px_rgba(255,122,31,0.9)]" : s.folded || s.left ? "bg-ash-950/70 opacity-60 ring-ash-700" : "bg-ash-950/85 ring-brass-500/40"
        }`}
      >
        {pub.button === s.id && (
          <span className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-bone text-[10px] font-black text-ash-950 ring-1 ring-ash-700">D</span>
        )}
        <p className="max-w-[96px] truncate text-[11px] font-bold text-bone">{me ? "You" : s.name}</p>
        <p className="tabular text-[11px] text-ash-300">{s.left ? "Left" : s.stack.toLocaleString()}</p>
        {turn && left !== null && (
          <span className="absolute inset-x-1.5 bottom-0.5 h-[2px] overflow-hidden rounded-full bg-ash-800">
            <span className="block h-full bg-ember-400 transition-[width] duration-200" style={{ width: `${Math.min(100, (left / (pub.turn * 1000)) * 100)}%` }} />
          </span>
        )}
      </div>
      {s.committed > 0 && <span className="tabular rounded-full bg-ash-950/80 px-2 text-[10px] font-bold text-ember-200 ring-1 ring-ember-600/50">{s.committed.toLocaleString()}</span>}
      {!s.committed && s.lastAction && !turn && <span className="text-[10px] font-semibold text-ash-400">{s.lastAction}</span>}
    </div>
  );
}

function RaisePicker({ pub, onPick, onCancel }: { pub: PokerPublic; onPick: (to: number) => void; onCancel: () => void }) {
  const L = pub.legal!;
  const [to, setTo] = useState(L.minRaiseTo);
  const potAfterCall = pub.pot + L.toCall;
  const presets = [
    { label: "Min", to: L.minRaiseTo },
    { label: "½ pot", to: pub.currentBet + Math.round(potAfterCall / 2) },
    { label: "¾ pot", to: pub.currentBet + Math.round((potAfterCall * 3) / 4) },
    { label: "Pot", to: pub.currentBet + potAfterCall },
    { label: "All-in", to: L.maxRaiseTo },
  ].map((p) => ({ ...p, to: Math.min(L.maxRaiseTo, Math.max(L.minRaiseTo, p.to)) }));

  return (
    <div className="rounded-2xl bg-ash-900/90 p-3 ring-1 ring-brass-500/40">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-bold text-ash-300">{L.isOpeningBet ? "Bet" : "Raise to"}</span>
        <span className="tabular font-display text-lg font-bold text-bone">{to.toLocaleString()}</span>
      </div>
      <input
        type="range"
        min={L.minRaiseTo}
        max={L.maxRaiseTo}
        step={Math.max(1, Math.round(pub.bb / 2))}
        value={to}
        onChange={(e) => setTo(Number(e.target.value))}
        aria-label="Raise size"
        className="w-full accent-[#ff7a1f]"
      />
      <div className="mt-2 grid grid-cols-5 gap-1">
        {presets.map((p) => (
          <button key={p.label} onClick={() => setTo(p.to)} className={`h-8 rounded-lg text-[11px] font-bold ring-1 ${to === p.to ? "bg-ember-500/20 text-ember-100 ring-ember-400" : "bg-ash-950 text-ash-300 ring-ash-700"}`}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-[1fr_2fr] gap-2">
        <button onClick={onCancel} className="btn-ash h-11 rounded-xl text-sm font-bold">
          Back
        </button>
        <button onClick={() => onPick(to)} className="btn-fire h-11 rounded-xl text-sm font-bold">
          {to === L.maxRaiseTo ? "All-in" : `${L.isOpeningBet ? "Bet" : "Raise to"} ${to.toLocaleString()}`}
        </button>
      </div>
    </div>
  );
}
