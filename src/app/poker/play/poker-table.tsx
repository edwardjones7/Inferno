"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cardLabel } from "@/lib/blackjack/cards";
import { BOT_ROSTER, botDecide, botThinkMs } from "@/lib/poker/bots";
import { act, legal, newTable, positionOf, startHand } from "@/lib/poker/game";
import type { CoachNote, PlayerAction, PokerState } from "@/lib/poker/game-types";
import { describe } from "@/lib/poker/eval";
import { coachHero } from "@/lib/poker/table-coach";
import { play } from "@/lib/sound";
import { isBoolString, useStored } from "@/lib/use-stored";
import { boardKey, holeKey } from "./three/poker-scene";

const PokerScene = dynamic(() => import("./three/poker-scene"), {
  ssr: false,
  loading: () => <div className="felt h-[460px] animate-pulse rounded-[28px] sm:h-[560px] sm:rounded-[44px]" />,
});

const STACK = 1000;
const SB = 5;
const BB = 10;
const NEXT_HAND_MS = 4200;

let webgl: boolean | null = null;
function hasWebGL() {
  if (webgl === null) {
    try {
      const c = document.createElement("canvas");
      webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}
const noop = () => () => {};

/** Seconds after the update at which each newly visible card leaves the deck. */
function dealDelays(prev: PokerState, next: PokerState): Record<string, number> {
  const d: Record<string, number> = {};
  if (next.handNo !== prev.handNo) {
    // two rounds, starting left of the button
    const order = [...next.seats.slice(next.button + 1), ...next.seats.slice(0, next.button + 1)].filter((s) => s.hole.length === 2);
    order.forEach((s, k) => {
      d[holeKey(next.handNo, s.id, 0)] = k * 0.09;
      d[holeKey(next.handNo, s.id, 1)] = (order.length + k) * 0.09;
    });
    return d;
  }
  const from = prev.board.length;
  const streetOf = (i: number) => (i < 3 ? 0 : i - 2);
  const first = streetOf(from);
  for (let i = from; i < next.board.length; i++) {
    const st = streetOf(i) - first;
    d[boardKey(next.handNo, i)] = 0.25 + st * 1.1 + (i < 3 ? i * 0.16 : 0);
  }
  return d;
}

export function PokerTable() {
  const [game, setGame] = useState<PokerState>(() =>
    newTable({ heroName: "You", bots: BOT_ROSTER.map((b) => ({ name: b.name, style: b.style })), stack: STACK, sb: SB, bb: BB }),
  );
  const [epoch, setEpoch] = useState(0);
  const [delays, setDelays] = useState<Record<string, number>>({});
  const [coach, setCoach] = useState<(CoachNote & { n: number }) | null>(null);
  const [coachPref, setCoachPref] = useStored("inferno:poker-coach", "1", isBoolString);
  const [autoPref, setAutoPref] = useStored("inferno:poker-auto", "1", isBoolString);
  const [session, setSession] = useState({ hands: 0, net: 0, won: 0, biggest: 0 });
  const [winKey, setWinKey] = useState(0);
  const [raiseTo, setRaiseTo] = useState(0);
  const webglOk = useSyncExternalStore(noop, hasWebGL, () => true);
  const startStack = useRef(STACK);
  const gameRef = useRef(game);

  // Next keeps hidden pages alive; drop the WebGL scene while hidden (see blackjack table).
  const [sceneOn, setSceneOn] = useState(true);
  const [sceneKey, setSceneKey] = useState(0);
  useEffect(() => {
    queueMicrotask(() => setSceneOn(true));
    return () => {
      setSceneOn(false);
      setSceneKey((k) => k + 1);
    };
  }, []);

  const apply = useCallback((next: PokerState, prev: PokerState) => {
    const d = dealDelays(prev, next);
    Object.values(d).forEach((t) => play("card", t));
    if (next.street === "done" && prev.street !== "done") {
      const hero = next.winners.filter((w) => w.seat === 0).reduce((n, w) => n + w.amount, 0);
      const net = next.seats[0].stack - startStack.current;
      setSession((s) => ({ hands: s.hands + 1, net: s.net + net, won: s.won + (hero > 0 ? 1 : 0), biggest: Math.max(s.biggest, next.pots.reduce((n, p) => n + p.amount, 0)) }));
      const showdownAt = 0.6 + Math.max(0, ...Object.values(d));
      play(hero > 0 ? "win" : "push", showdownAt);
      if (hero > 0) setTimeout(() => setWinKey((k) => k + 1), showdownAt * 1000);
    }
    setDelays(d);
    gameRef.current = next;
    setGame(next);
    setEpoch((e) => e + 1);
  }, []);

  const deal = useCallback(
    (rebuyHero = false) => {
      const g = gameRef.current;
      if (g.street !== "done") return;
      // bots rebuy when busted so the table stays full; the hero only on request
      const topped: PokerState = {
        ...g,
        seats: g.seats.map((s) => (s.stack === 0 && (!s.isHero || rebuyHero) ? { ...s, stack: STACK } : s)),
      };
      if (topped.seats[0].stack === 0) return;
      const next = startHand(topped, Math.random);
      startStack.current = next.seats[0].stack + next.seats[0].totalCommitted;
      setCoach(null);
      apply(next, g);
    },
    [apply],
  );

  // first hand
  useEffect(() => {
    if (game.handNo === 0) queueMicrotask(() => deal());
  }, [game.handNo, deal]);

  // bots act on their turn
  useEffect(() => {
    if (game.street === "done" || game.toAct === null || game.toAct === 0) return;
    const seat = game.toAct;
    const t = setTimeout(() => {
      const a = botDecide(game, seat, Math.random);
      if (a.kind === "raise" || a.kind === "call") play("chip");
      apply(act(game, a), game);
    }, botThinkMs(Math.random));
    return () => clearTimeout(t);
  }, [game, apply]);

  // next hand after the result has been seen
  useEffect(() => {
    if (game.street !== "done" || autoPref !== "1" || game.seats[0].stack === 0) return;
    const t = setTimeout(() => deal(), NEXT_HAND_MS);
    return () => clearTimeout(t);
  }, [game, autoPref, deal]);

  const heroTurn = game.toAct === 0 && game.street !== "done";
  const opts = heroTurn ? legal(game) : null;
  const hero = game.seats[0];

  // keep the raise slider inside the legal range when it becomes the hero's turn
  const lastTurn = useRef(-1);
  useEffect(() => {
    if (!opts) return;
    const marker = game.log.length;
    if (lastTurn.current === marker) return;
    lastTurn.current = marker;
    queueMicrotask(() => setRaiseTo(opts.minRaiseTo));
  }, [opts, game.log.length]);

  const heroAct = useCallback(
    (a: PlayerAction) => {
      if (!heroTurn) return;
      if (coachPref === "1") {
        const note = coachHero(game, a);
        setCoach((c) => ({ ...note, n: (c?.n ?? 0) + 1 }));
      }
      if (a.kind === "raise" || a.kind === "call") play("chip");
      apply(act(game, a), game);
    },
    [heroTurn, coachPref, game, apply],
  );

  // keyboard: F fold, C check/call, R raise (current slider), A all-in
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input[type=text], textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (game.street === "done" && (k === "enter" || k === " ")) {
        e.preventDefault();
        deal();
        return;
      }
      if (!opts) return;
      if (k === "f" && opts.canFold && !opts.canCheck) heroAct({ kind: "fold" });
      else if (k === "c") heroAct(opts.canCheck ? { kind: "check" } : { kind: "call" });
      else if (k === "r" && opts.canRaise) heroAct({ kind: "raise", to: Math.min(opts.maxRaiseTo, Math.max(opts.minRaiseTo, raiseTo)) });
      else if (k === "a" && opts.canRaise) heroAct({ kind: "raise", to: opts.maxRaiseTo });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opts, heroAct, raiseTo, game.street, deal]);

  // showdown: reveal everyone who got to the end
  const revealed = useMemo(() => {
    const r = new Set<number>();
    if (game.street === "done" && game.winners.some((w) => w.hand)) for (const s of game.seats) if (!s.folded && s.hole.length === 2) r.add(s.id);
    return r;
  }, [game]);

  const heroHand = hero.hole.length === 2 ? describe([...hero.hole, ...game.board]).name : null;
  const potPresets = opts
    ? [
        { label: "½ pot", frac: 0.5 },
        { label: "¾ pot", frac: 0.75 },
        { label: "Pot", frac: 1 },
      ].map((p) => ({ ...p, to: Math.round(Math.min(opts.maxRaiseTo, Math.max(opts.minRaiseTo, game.currentBet + p.frac * (game.pot + opts.toCall)))) }))
    : [];

  const labels: Record<string, React.ReactNode> = {};
  for (const s of game.seats) {
    const win = game.street === "done" ? game.winners.filter((w) => w.seat === s.id) : [];
    const thinking = game.toAct === s.id && game.street !== "done";
    labels[`seat${s.id}`] = (
      <div className="-translate-x-1/2 -translate-y-1/2">
        <div
          className={`flex min-w-28 flex-col items-center rounded-2xl px-3 py-1.5 text-center ring-1 transition-all ${
            thinking
              ? "bg-ash-950/90 ring-ember-400 shadow-[0_0_24px_-4px_rgba(255,122,31,0.9)]"
              : s.folded && s.hole.length === 0 && game.street !== "done"
                ? "bg-ash-950/60 ring-ash-800 opacity-60"
                : "bg-ash-950/85 ring-ash-700"
          }`}
        >
          <span className="flex items-center gap-1.5 text-[11px] font-bold">
            <span className={s.isHero ? "text-ember-200" : "text-bone"}>{s.isHero ? "You" : s.name}</span>
            <span className="rounded bg-ash-800 px-1 text-[9px] text-ash-400">{game.handNo > 0 && s.stack + s.totalCommitted > 0 ? positionOf(game, s.id) : ""}</span>
          </span>
          <span className="tabular text-xs font-semibold text-ember-200">{s.stack.toLocaleString()}</span>
          {win.length > 0 ? (
            <span className="mt-0.5 rounded-full bg-emerald-500 px-2 text-[10px] font-bold text-ash-950">
              +{win.reduce((n, w) => n + w.amount, 0)}
              {win[0].hand ? ` · ${win[0].hand}` : ""}
            </span>
          ) : thinking && !s.isHero ? (
            <span className="text-[10px] text-ember-300">thinking…</span>
          ) : s.lastAction ? (
            <span className={`text-[10px] ${s.lastAction.startsWith("Fold") ? "text-ash-500" : "text-ash-300"}`}>{s.lastAction}</span>
          ) : null}
        </div>
      </div>
    );
  }
  labels.pot = game.pot > 0 && game.street !== "done" ? (
    <div className="-translate-x-1/2 -translate-y-1/2 rounded-full bg-ash-950/85 px-3 py-1 text-xs font-bold text-ember-200 ring-1 ring-ember-500/40">
      Pot {game.pot.toLocaleString()}
    </div>
  ) : null;

  const lastEvents = game.log.slice(-7);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        {webglOk && sceneOn ? (
          <PokerScene key={sceneKey} game={game} epoch={epoch} delays={delays} revealed={revealed} fx={{ heat: 0, drama: false, blackjackKey: 0, winKey, loseKey: 0 }} labels={labels} />
        ) : (
          <div className="felt grid h-[460px] place-items-center rounded-[28px] text-sm text-ash-400">{webglOk ? "" : "The poker table needs WebGL."}</div>
        )}

        <div className="mt-3 min-h-11" aria-live="polite">
          <AnimatePresence mode="wait">
            {coach && (
              <motion.div
                key={coach.n}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex items-start gap-3 rounded-2xl px-4 py-2.5 text-sm ring-1 ${
                  coach.ok === false
                    ? "bg-ember-500/10 text-ember-100 ring-ember-500/40"
                    : coach.ok
                      ? "bg-emerald-500/10 text-emerald-200 ring-emerald-500/30"
                      : "bg-ash-900 text-ash-200 ring-ash-700"
                }`}
              >
                <span className="font-bold">{coach.title}</span>
                <span className="text-ash-300">{coach.detail}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* controls */}
        <div className="panel mt-1 rounded-3xl p-4 sm:p-5">
          {game.street === "done" ? (
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
              <p className="text-sm text-ash-300">
                {game.winners.length
                  ? game.winners.map((w) => `${w.seat === 0 ? "You" : game.seats[w.seat].name} win${w.seat === 0 ? "" : "s"} ${w.amount}${w.hand ? ` with ${w.hand.toLowerCase()}` : ""}`).join(" · ")
                  : "Shuffling up…"}
              </p>
              {hero.stack === 0 ? (
                <button onClick={() => deal(true)} className="btn-fire h-11 rounded-xl px-6 font-bold">
                  Rebuy 1,000
                </button>
              ) : (
                <button onClick={() => deal()} className="btn-fire h-11 rounded-xl px-6 font-bold">
                  Next hand <kbd className="ml-1 rounded bg-ash-950/20 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
                </button>
              )}
            </div>
          ) : opts ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2">
                <button disabled={!opts.canFold || opts.canCheck} onClick={() => heroAct({ kind: "fold" })} className="btn-ash h-12 rounded-xl font-bold">
                  Fold <kbd className="ml-1 hidden font-mono text-[10px] sm:inline">F</kbd>
                </button>
                <button onClick={() => heroAct(opts.canCheck ? { kind: "check" } : { kind: "call" })} className="btn-fire h-12 rounded-xl font-bold">
                  {opts.canCheck ? "Check" : `Call ${opts.toCall}`} <kbd className="ml-1 hidden font-mono text-[10px] sm:inline">C</kbd>
                </button>
                <button
                  disabled={!opts.canRaise}
                  onClick={() => heroAct({ kind: "raise", to: Math.min(opts.maxRaiseTo, Math.max(opts.minRaiseTo, raiseTo)) })}
                  className="btn-fire h-12 rounded-xl font-bold"
                >
                  {raiseTo >= opts.maxRaiseTo ? "All-in" : opts.isOpeningBet ? "Bet" : "Raise to"} {Math.min(opts.maxRaiseTo, Math.max(opts.minRaiseTo, raiseTo))}{" "}
                  <kbd className="ml-1 hidden font-mono text-[10px] sm:inline">R</kbd>
                </button>
              </div>
              {opts.canRaise && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="range"
                    aria-label="Raise amount"
                    min={opts.minRaiseTo}
                    max={opts.maxRaiseTo}
                    step={1}
                    value={Math.min(opts.maxRaiseTo, Math.max(opts.minRaiseTo, raiseTo))}
                    onChange={(e) => setRaiseTo(Number(e.target.value))}
                    className="h-2 min-w-40 flex-1 accent-ember-500"
                  />
                  {potPresets.map((p) => (
                    <button key={p.label} onClick={() => setRaiseTo(p.to)} className="btn-ash h-8 rounded-lg px-2.5 text-xs font-bold">
                      {p.label}
                    </button>
                  ))}
                  <button onClick={() => setRaiseTo(opts.maxRaiseTo)} className="btn-ash h-8 rounded-lg px-2.5 text-xs font-bold">
                    All-in
                  </button>
                </div>
              )}
              {heroHand && game.board.length > 0 && <p className="text-center text-xs text-ash-400">You have: <span className="font-semibold text-bone">{heroHand}</span></p>}
            </div>
          ) : (
            <p className="py-3 text-center text-sm text-ash-400">
              {hero.folded ? "You folded. Watching the hand play out…" : `Waiting for ${game.toAct !== null ? game.seats[game.toAct].name : "the deal"}…`}
            </p>
          )}
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        <div className="panel rounded-3xl p-5">
          <h2 className="font-display text-sm font-bold">Session</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <Stat label="Hands" value={String(session.hands)} />
            <Stat label="Won" value={String(session.won)} />
            <Stat label="Net chips" value={`${session.net >= 0 ? "+" : ""}${session.net}`} hot={session.net > 0} />
            <Stat label="Biggest pot" value={String(session.biggest)} />
          </dl>
          <p className="mt-3 text-[11px] text-ash-500">Play chips only. Blinds {SB}/{BB}, 100 big blinds deep. Bots rebuy when they bust.</p>
        </div>

        <div className="panel rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold">Coach</h2>
            <Switch on={coachPref === "1"} onChange={(v) => setCoachPref(v ? "1" : "0")} />
          </div>
          <p className="mt-2 text-xs text-ash-400">Checks your opens against the charts and your calls against the pot odds.</p>
          <div className="mt-4 flex items-center justify-between">
            <h2 className="font-display text-sm font-bold">Auto-deal</h2>
            <Switch on={autoPref === "1"} onChange={(v) => setAutoPref(v ? "1" : "0")} />
          </div>
        </div>

        <div className="panel rounded-3xl p-5">
          <h2 className="font-display text-sm font-bold">Hand #{game.handNo}</h2>
          <ul className="mt-2 space-y-1 text-xs">
            {lastEvents.map((e, i) => (
              <li key={`${game.handNo}-${game.log.length - lastEvents.length + i}`} className={e.seat === 0 ? "text-ember-200" : "text-ash-300"}>
                {e.text}
              </li>
            ))}
          </ul>
          {game.board.length > 0 && <p className="mt-2 text-[11px] text-ash-500">Board: {game.board.map(cardLabel).join(" ")}</p>}
        </div>

        <div className="panel rounded-3xl p-5 text-xs text-ash-400">
          <h2 className="mb-2 font-display text-sm font-bold text-bone">Opponents</h2>
          <ul className="space-y-1">
            {BOT_ROSTER.map((b) => (
              <li key={b.name} className="flex justify-between">
                <span className="text-ash-200">{b.name}</span>
                <span className="uppercase tracking-wider">{b.style}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div>
      <dt className="text-ash-500">{label}</dt>
      <dd className={`tabular mt-0.5 font-display text-lg font-bold ${hot ? "molten-text" : "text-bone"}`}>{value}</dd>
    </div>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-ember-500" : "bg-ash-700"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-bone shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
