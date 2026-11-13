"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { dealAction, playAction, settleAbandonedAction } from "@/app/actions";
import { Chip, CHIP_VALUES, chipsFor } from "@/components/chip";
import { CoinIcon } from "@/components/coin-icon";
import { EmberBurst } from "@/components/ember-burst";
import { PlayingCard } from "@/components/playing-card";
import { useWallet } from "@/components/wallet-provider";
import { HeatMeter, OutcomeBanner, ResultTag, TotalBadge } from "./parts";
import { outcome, playerKey, schedule, type Timing } from "./timing";
import type { ActionType, RoundView } from "@/lib/blackjack/engine";
import { basicStrategy } from "@/lib/blackjack/strategy";
import { formatUsd, MAX_BET_USD, MIN_BET_USD, unitsToUsd, type Currency } from "@/lib/currency";
import { play, setAmbienceHeat, startAmbience, stopAmbience } from "@/lib/sound";
import { isBoolString, useStored } from "@/lib/use-stored";

const Table3D = dynamic(() => import("./three/table-3d"), {
  ssr: false,
  loading: () => <div className="felt h-[420px] animate-pulse rounded-[28px] sm:h-[540px] sm:rounded-[44px]" />,
});

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
const noopSubscribe = () => () => {};
const VIEW_KEY = "inferno:view";

/** Streak heat: wins push it toward +1 (on fire), losses toward -1 (ice cold), pushes cool it toward 0. */
function nextHeat(h: number, tone: "win" | "push" | "lose", blackjack: boolean) {
  if (tone === "win") return Math.min(1, Math.max(0, h) + (blackjack ? 0.5 : 0.3));
  if (tone === "lose") return Math.max(-1, Math.min(0, h) - 0.28);
  return h * 0.7;
}
const isViewMode = (v: unknown): v is "3d" | "2d" => v === "3d" || v === "2d";
import type { Fairness, RoundPayload } from "@/server/casino";

/* ------------------------------------------------------------------ table */

const ACTION_META: Record<Exclude<ActionType, "insurance" | "decline">, { label: string; key: string }> = {
  hit: { label: "Hit", key: "H" },
  stand: { label: "Stand", key: "S" },
  double: { label: "Double", key: "D" },
  split: { label: "Split", key: "P" },
  surrender: { label: "Surrender", key: "R" },
};

const HINT_KEY = "inferno:hints";

export function BlackjackTable({ initial }: { initial: { round: RoundPayload | null; fairness: Fairness } | null }) {
  const { wallet, currency: walletCurrency, setWallet, balanceUsd, ready } = useWallet();
  // Every fresh visit starts at an empty table. A hand left unfinished from a previous
  // visit is completed in the background (stand / no insurance, like a casino treats an
  // abandoned hand) rather than resumed; dealing waits until that's done.
  const [round, setRound] = useState<RoundPayload | null>(null);
  const [settling, setSettling] = useState(() => !!initial?.round && initial.round.view.phase !== "settled");
  const [fairness, setFairness] = useState<Fairness | null>(initial?.fairness ?? null);
  const [timing, setTiming] = useState<Timing>({ delays: {}, flip: 0, flipDuration: 0.42, drama: null, total: 0 });
  const [revealed, setRevealed] = useState(true);
  const [burstKey, setBurstKey] = useState(0);
  const [heat, setHeat] = useState(0);
  const [drama, setDrama] = useState(false);
  const [blackjackKey, setBlackjackKey] = useState(0);
  const [loseKey, setLoseKey] = useState(0);
  const [bet, setBet] = useState(10);
  const [betStack, setBetStack] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [viewMode, setViewMode] = useStored(VIEW_KEY, "3d", isViewMode);
  const webglOk = useSyncExternalStore(noopSubscribe, hasWebGL, () => true);
  const use3d = viewMode === "3d" && webglOk;

  // Next keeps visited pages alive in a hidden <Activity> so they reopen instantly. Hiding
  // runs effect cleanups (WebGL renderer, Rapier physics world are freed) but keeps state,
  // so re-showing the stale 3D tree crashed ("recursive use of an object" from Rapier).
  // Drop the scene while hidden and mount a fresh one when the page is shown again.
  const [sceneOn, setSceneOn] = useState(true);
  const [sceneKey, setSceneKey] = useState(0);
  useEffect(() => {
    queueMicrotask(() => setSceneOn(true));
    return () => {
      setSceneOn(false);
      setSceneKey((k) => k + 1);
    };
  }, []);
  const [hintsPref, setHintsPref] = useStored(HINT_KEY, "0", isBoolString);
  const hints = hintsPref === "1";
  const revealTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dramaTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      clearTimeout(revealTimer.current);
      dramaTimers.current.forEach(clearTimeout);
    },
    [],
  );

  // Runs once per table instance (a ref survives Next's hidden-page Activity, so navigating
  // away mid-hand and back keeps the hand; only a fresh visit settles a leftover one).
  const abandonedHandled = useRef(false);
  useEffect(() => {
    if (abandonedHandled.current) return;
    abandonedHandled.current = true;
    const left = initial?.round;
    if (!left || left.view.phase === "settled") return;
    void settleAbandonedAction(left.id).then((res) => {
      setSettling(false);
      if (!res.ok) return void toast.error(res.error);
      setWallet(res.data.wallet);
      if (res.data.settledNow) {
        const o = outcome(res.data.round.view, res.data.round.currency);
        toast(`Your unfinished hand was settled (stood): ${o.title.toLowerCase()}`, {
          description: o.net === 0 ? "Stake returned" : formatUsd(o.net, { sign: true }),
        });
      }
    });
  }, [initial, setWallet]);

  useEffect(() => {
    setAmbienceHeat(heat);
  }, [heat]);
  useEffect(() => {
    startAmbience();
    return () => stopAmbience();
  }, []);

  const view = round?.view ?? null;
  const currency: Currency = round && view?.phase !== "settled" ? round.currency : walletCurrency;
  const roundCurrency = round?.currency ?? walletCurrency;
  const toUsd = useCallback((units: number) => unitsToUsd(units, roundCurrency), [roundCurrency]);
  const inPlay = !!view && view.phase !== "settled";
  const settledShown = !!view && view.phase === "settled" && revealed;

  /** Apply a server response: schedule card animations, then reveal the outcome. */
  const receive = useCallback(
    (next: RoundPayload, nextWallet: Record<Currency, number>, prev: RoundView | null) => {
      const t = schedule(prev, next.view);
      setTiming(t);
      setEpoch((e) => e + 1);
      setRound(next);
      Object.entries(t.delays).forEach(([, d]) => play("card", d));
      if (t.flip) play("flip", t.flip + (t.flipDuration > 0.5 ? t.flipDuration * 0.5 : 0));
      clearTimeout(revealTimer.current);
      dramaTimers.current.forEach(clearTimeout);
      dramaTimers.current = [];
      if (t.drama) {
        const { start, end } = t.drama;
        play("drama", start);
        dramaTimers.current.push(
          setTimeout(() => setDrama(true), start * 1000),
          setTimeout(() => setDrama(false), end * 1000),
        );
      } else {
        setDrama(false);
      }

      if (next.view.phase !== "settled") {
        setRevealed(true);
        setWallet(nextWallet);
        return;
      }
      setRevealed(false);
      revealTimer.current = setTimeout(() => {
        setRevealed(true);
        setWallet(nextWallet);
        const o = outcome(next.view, next.currency);
        play(o.blackjack ? "blackjack" : o.tone === "win" ? "win" : o.tone === "push" ? "push" : "lose");
        if (o.tone === "win") setBurstKey((k) => k + 1);
        if (o.tone === "lose") setLoseKey((k) => k + 1);
        if (o.blackjack) {
          setBlackjackKey((k) => k + 1);
          play("flame");
        }
        if (next.view.hands.some((h) => h.result === "lose" || h.result === "surrender")) play("burn", 0.15);
        setHeat((h) => nextHeat(h, o.tone, o.blackjack));
      }, t.total * 1000);
    },
    [setWallet],
  );

  const deal = useCallback(async () => {
    if (busy || inPlay || !revealed || settling) return;
    setBusy(true);
    play("chip");
    const res = await dealAction(walletCurrency, bet);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    setFairness((f) => (f ? { ...f, nonce: res.data.nextNonce } : f));
    receive(res.data.round, res.data.wallet, null);
  }, [busy, inPlay, revealed, settling, walletCurrency, bet, receive]);

  const act = useCallback(
    async (a: ActionType) => {
      if (!round || busy || !view?.legal.includes(a)) return;
      setBusy(true);
      if (a === "double" || a === "split" || a === "insurance") play("chip");
      const res = await playAction(round.id, a);
      setBusy(false);
      if (!res.ok) return void toast.error(res.error);
      receive(res.data.round, res.data.wallet, view);
    },
    [round, busy, view, receive],
  );

  const addChip = (v: number) => {
    if (inPlay) return;
    const next = Math.min(MAX_BET_USD, bet + v);
    if (next === bet) return;
    play("chip");
    setBetStack((s) => [...s, bet]);
    setBet(next);
  };
  const setBetTo = (v: number) => {
    const clamped = Math.max(MIN_BET_USD, Math.min(MAX_BET_USD, Math.round(v * 100) / 100));
    setBetStack((s) => [...s, bet]);
    setBet(clamped);
    play("click");
  };
  const undo = () => {
    setBetStack((s) => {
      if (!s.length) return s;
      setBet(s[s.length - 1]);
      return s.slice(0, -1);
    });
  };

  const hand = inPlay && view.phase === "player" ? view.hands[view.active] : null;
  const hint = hints && hand && view ? basicStrategy(hand.cards, view.dealer[0]!, view.legal) : null;
  const canAfford = (a: ActionType) => !view?.costs[a] || toUsd(view.costs[a]!) <= unitsToUsd(wallet?.[roundCurrency] ?? 0, roundCurrency) + 1e-9;
  const betTooBig = ready && bet > balanceUsd + 1e-9;

  /* keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (view?.phase === "insurance") {
        if (k === "i" || k === "y") act("insurance");
        if (k === "n") act("decline");
        return;
      }
      if (inPlay) {
        const map: Record<string, ActionType> = { h: "hit", s: "stand", d: "double", p: "split", r: "surrender" };
        if (map[k] && canAfford(map[k])) {
          e.preventDefault();
          act(map[k]);
        }
        return;
      }
      if ((k === " " || k === "enter") && el.tagName !== "BUTTON" && !betTooBig) {
        e.preventDefault();
        deal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const result = view && view.phase === "settled" ? outcome(view, roundCurrency) : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0">
        {/* ---------------------------------------------------- felt */}
        {use3d ? (
          <div className="relative">
            {sceneOn ? (
            <Table3D
              key={sceneKey}
              view={view}
              roundId={round?.id ?? null}
              timing={timing}
              epoch={epoch}
              revealed={revealed}
              pendingBetUsd={bet}
              toUsd={toUsd}
              fx={{ heat, drama, blackjackKey, winKey: burstKey, loseKey }}
            />
            ) : (
              <div className="felt h-[420px] animate-pulse rounded-[28px] sm:h-[540px] sm:rounded-[44px]" />
            )}
            <div className="absolute left-4 top-4 z-20 sm:left-6 sm:top-5">
              <HeatMeter heat={heat} />
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[84%]">
              <OutcomeBanner result={result && revealed ? result : null} roundId={round?.id ?? ""} />
            </div>
            {burstKey > 0 && (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[84%]">
                <EmberBurst key={burstKey} seed={burstKey} intensity={result?.blackjack ? 1.4 : 1} count={result?.blackjack ? 60 : 36} />
              </div>
            )}
            {view?.insurance && (
              <p className="absolute inset-x-0 bottom-3 text-center text-xs text-ash-300">
                Insurance {formatUsd(toUsd(view.insurance.bet))}
                {view.phase === "settled" && revealed && (view.insurance.payout ? " · paid 2:1" : " · lost")}
              </p>
            )}
          </div>
        ) : (
        <div className="felt relative isolate overflow-hidden rounded-[28px] px-3 pb-6 pt-5 sm:rounded-[44px] sm:px-8 sm:pb-8 sm:pt-7">
          <Shoe />
          <div className="absolute left-4 top-4 z-20 sm:left-6 sm:top-5">
            <HeatMeter heat={heat} />
          </div>

          {/* dealer */}
          <div className="flex min-h-[150px] flex-col items-center sm:min-h-[180px]">
            <Label>Dealer</Label>
            <div key={round?.id ?? "none"} className="mt-2 flex h-[92px] items-start sm:h-[120px]">
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

          {/* rules arc, replaced by the outcome when a hand settles */}
          <div className="pointer-events-none relative my-3 select-none text-center sm:my-5">
            <div className={`transition-opacity duration-300 ${result && revealed ? "opacity-0" : "opacity-100"}`}>
            <p className="font-display text-[10px] font-bold uppercase tracking-[0.35em] text-ember-400/70 sm:text-xs">
              Blackjack pays 3 to 2
            </p>
            <div className="mx-auto my-1.5 h-px w-2/3 max-w-sm bg-gradient-to-r from-transparent via-ember-500/50 to-transparent" />
            <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-ash-500 sm:text-[10px]">
              Dealer stands on all 17s · Insurance pays 2 to 1
            </p>
            </div>
            <OutcomeBanner result={result && revealed ? result : null} roundId={round?.id ?? ""} />
            {burstKey > 0 && (
              <div className="absolute inset-0 z-20">
                <EmberBurst key={burstKey} seed={burstKey} intensity={result?.blackjack ? 1.4 : 1} count={result?.blackjack ? 60 : 36} />
              </div>
            )}
          </div>

          {/* player */}
          <div className="flex min-h-[210px] flex-wrap items-end justify-center gap-x-6 gap-y-4 sm:min-h-[230px] sm:gap-x-10">
            {view ? (
              view.hands.map((h, hi) => {
                const active = inPlay && view.phase === "player" && hi === view.active;
                const finished = settledShown && h.result;
                return (
                  <motion.div layout key={`${round?.id}:${hi}`} className="flex flex-col items-center">
                    <div className="mb-2 h-7">
                      <AnimatePresence>
                        {finished && <ResultTag result={h.result!} payoutUsd={toUsd(h.payout ?? 0)} betUsd={toUsd(h.bet)} />}
                      </AnimatePresence>
                    </div>
                    <div
                      className={`flex rounded-2xl p-2 transition-all ${active && view.hands.length > 1 ? "animate-glow bg-ember-500/5" : ""}`}
                    >
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
                        <StakeChips usd={toUsd(h.bet)} />
                        {formatUsd(toUsd(h.bet))}
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

          {/* insurance line */}
          {view?.insurance && (
            <p className="mt-3 text-center text-xs text-ash-400">
              Insurance {formatUsd(toUsd(view.insurance.bet))}
              {view.phase === "settled" && revealed && (view.insurance.payout ? " · paid 2:1" : " · lost")}
            </p>
          )}

        </div>
        )}

        {/* ---------------------------------------------------- dock */}
        <div className="panel mt-4 rounded-3xl p-4 sm:p-5">
          {view?.phase === "insurance" ? (
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
              <div>
                <p className="font-display text-sm font-bold">Dealer shows an Ace</p>
                <p className="text-sm text-ash-400">
                  Insure for {formatUsd(toUsd(view.costs.insurance ?? 0))}? Pays 2:1 if the dealer has blackjack.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={busy || !canAfford("insurance") || !view.legal.includes("insurance")}
                  onClick={() => act("insurance")}
                  className="btn-fire h-11 rounded-xl px-5 font-bold"
                >
                  Insure <Kbd>I</Kbd>
                </button>
                <button disabled={busy} onClick={() => act("decline")} className="btn-ash h-11 rounded-xl px-5 font-bold">
                  No thanks <Kbd>N</Kbd>
                </button>
              </div>
            </div>
          ) : inPlay ? (
            <div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(Object.keys(ACTION_META) as (keyof typeof ACTION_META)[]).map((a) => {
                  const legal = view.legal.includes(a);
                  const cost = view.costs[a];
                  const primary = a === "hit" || a === "stand";
                  return (
                    <button
                      key={a}
                      disabled={busy || !legal || !canAfford(a)}
                      onClick={() => act(a)}
                      className={`relative flex h-14 flex-col items-center justify-center rounded-xl font-bold ${
                        primary ? "btn-fire" : "btn-ash"
                      } ${hint === a ? "ring-2 ring-ember-300 ring-offset-2 ring-offset-ash-900" : ""}`}
                    >
                      <span className="flex items-center gap-1.5">
                        {ACTION_META[a].label}
                        <Kbd dark={primary}>{ACTION_META[a].key}</Kbd>
                      </span>
                      {cost ? (
                        <span className={`tabular text-[11px] font-semibold ${primary ? "text-ash-950/70" : "text-ash-400"}`}>
                          +{formatUsd(toUsd(cost))}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {hint && (
                <p className="mt-3 text-center text-xs text-ash-400">
                  Basic strategy says <span className="font-bold capitalize text-ember-300">{hint}</span>
                </p>
              )}
            </div>
          ) : (
            <BetDock
              bet={bet}
              currency={currency}
              busy={busy}
              locked={!revealed || settling}
              betTooBig={betTooBig}
              ready={ready}
              balanceUsd={balanceUsd}
              canUndo={betStack.length > 0}
              onChip={addChip}
              onSet={setBetTo}
              onUndo={undo}
              onDeal={deal}
              again={!!view}
            />
          )}
        </div>
      </div>

      {/* ---------------------------------------------------- side */}
      <aside className="flex min-w-0 flex-col gap-4">
        <div className="panel flex items-center gap-1 rounded-2xl p-1.5">
          {(["3d", "2d"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              disabled={m === "3d" && !webglOk}
              aria-pressed={viewMode === m}
              className={`h-9 flex-1 rounded-xl text-sm font-bold transition-colors ${
                (m === "3d" ? use3d : !use3d) ? "bg-ember-500 text-ash-950 shadow-[0_0_20px_-4px_rgba(255,90,31,0.8)]" : "text-ash-400 hover:text-bone"
              } disabled:opacity-40`}
            >
              {m === "3d" ? "3D table" : "Classic"}
            </button>
          ))}
        </div>
        <div className="panel rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold">Strategy hints</h2>
            <Toggle on={hints} onChange={(v) => setHintsPref(v ? "1" : "0")} />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ash-400">
            Highlights the mathematically best move for 6 decks, dealer stands on soft 17. Played perfectly the house edge is about 0.5%.
          </p>
        </div>

        <div className="panel rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold">Provably fair</h2>
            <Link href="/fairness" className="text-xs font-semibold text-ember-400 hover:text-ember-300">
              Verify →
            </Link>
          </div>
          {fairness ? (
            <dl className="mt-3 space-y-2.5 text-xs">
              <Field label="Server seed (hashed)" value={fairness.serverSeedHash} />
              <Field label="Client seed" value={fairness.clientSeed} />
              <Field label={inPlay ? "Nonce (this hand)" : "Next nonce"} value={String(inPlay && round ? round.nonce : fairness.nonce)} />
            </dl>
          ) : (
            <p className="mt-2 text-xs text-ash-400">Enable cookies to play.</p>
          )}
        </div>

        <div className="panel rounded-3xl p-5 text-xs text-ash-400">
          <h2 className="mb-2 font-display text-sm font-bold text-bone">Shortcuts</h2>
          <ul className="grid grid-cols-2 gap-y-1.5">
            <li><Kbd>Space</Kbd> Deal</li>
            <li><Kbd>H</Kbd> Hit</li>
            <li><Kbd>S</Kbd> Stand</li>
            <li><Kbd>D</Kbd> Double</li>
            <li><Kbd>P</Kbd> Split</li>
            <li><Kbd>R</Kbd> Surrender</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function BetDock(props: {
  bet: number;
  currency: Currency;
  busy: boolean;
  /** true while the previous hand's result is still playing out */
  locked: boolean;
  betTooBig: boolean;
  ready: boolean;
  balanceUsd: number;
  canUndo: boolean;
  again: boolean;
  onChip: (v: number) => void;
  onSet: (v: number) => void;
  onUndo: () => void;
  onDeal: () => void;
}) {
  const { bet, currency, busy, locked, betTooBig, ready, balanceUsd, canUndo, again, onChip, onSet, onUndo, onDeal } = props;
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
      <div className="flex flex-1 flex-wrap items-center justify-center gap-1.5 sm:gap-3 lg:justify-start">
        {CHIP_VALUES.map((v) => (
          <motion.button
            key={v}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => onChip(v)}
            disabled={bet + v > Math.max(MAX_BET_USD, MIN_BET_USD) && bet >= MAX_BET_USD}
            aria-label={`Add ${formatUsd(v)} chip`}
            className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-400"
          >
            <Chip value={v} size={46} />
          </motion.button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="flex h-12 items-center gap-2 rounded-xl border border-ash-600/70 bg-ash-950 px-3">
          <CoinIcon currency={currency} size={16} />
          <span className="text-xs text-ash-400">Bet</span>
          <input
            aria-label="Bet amount in USD"
            inputMode="decimal"
            value={bet}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
              if (Number.isFinite(n)) onSet(n);
            }}
            className="tabular w-20 bg-transparent text-right text-base font-bold text-bone outline-none"
          />
        </div>
        <button onClick={() => onSet(bet / 2)} className="btn-ash h-12 w-11 rounded-xl text-sm font-bold">½</button>
        <button onClick={() => onSet(bet * 2)} className="btn-ash h-12 w-11 rounded-xl text-sm font-bold">2×</button>
        <button onClick={onUndo} disabled={!canUndo} aria-label="Undo last chip" className="btn-ash grid h-12 w-11 place-items-center rounded-xl">
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
            <path d="M6 4L2 8l4 4M2.5 8H10a4 4 0 0 1 0 8" fill="none" stroke="currentColor" strokeWidth="1.6" transform="translate(0 -2)" />
          </svg>
        </button>
        <button
          onClick={onDeal}
          disabled={busy || locked || !ready || betTooBig || bet < MIN_BET_USD}
          className="btn-fire h-12 min-w-36 rounded-xl px-6 font-display text-sm font-bold uppercase tracking-wider"
        >
          {busy ? "Dealing…" : again ? "Deal again" : "Deal"}
        </button>
      </div>
      {betTooBig && (
        <p className="text-center text-xs text-ember-400 lg:hidden">
          Not enough {currency}. Balance {formatUsd(balanceUsd)}. Claim the faucet or switch coins.
        </p>
      )}
    </div>
  );
}

function EmptySeat({ bet }: { bet: number }) {
  return (
    <div className="flex flex-col items-center gap-3 pb-4">
      <div className="grid h-28 w-28 place-items-center rounded-full border-2 border-dashed border-ember-500/40 bg-ember-500/5 shadow-[inset_0_0_30px_rgba(255,90,31,0.15)]">
        <div className="flex flex-col items-center">
          <div className="relative h-12 w-12">
            {chipsFor(bet, 5).map((v, i) => (
              <motion.span
                key={`${i}-${v}`}
                initial={{ y: -30, opacity: 0 }}
                animate={{ y: -i * 5, opacity: 1 }}
                className="absolute left-0 top-0"
              >
                <Chip value={v} size={48} />
              </motion.span>
            ))}
          </div>
        </div>
      </div>
      <p className="tabular font-display text-lg font-bold text-ember-200">{formatUsd(bet)}</p>
      <p className="text-xs text-ash-400">Place your chips and deal</p>
    </div>
  );
}

function StakeChips({ usd }: { usd: number }) {
  const chips = chipsFor(usd, 3);
  return (
    <span className="relative inline-block h-4 w-4">
      {chips.map((v, i) => (
        <span key={i} className="absolute left-0" style={{ top: -i * 2 }}>
          <Chip value={v} size={16} />
        </span>
      ))}
    </span>
  );
}

function Shoe() {
  return (
    <div aria-hidden className="absolute right-4 top-4 hidden sm:block">
      <div className="relative h-[70px] w-[60px] rotate-[8deg] rounded-lg bg-gradient-to-b from-ash-700 to-ash-900 p-1.5 shadow-[0_10px_20px_-8px_rgba(0,0,0,.9)] ring-1 ring-ash-600">
        <div className="h-full w-full rounded-md bg-[radial-gradient(circle_at_50%_60%,#ff5a1f,#b3200c_40%,#3d0805_85%)] ring-1 ring-ember-300/30" />
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-ash-500">{children}</span>;
}

function Kbd({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <kbd
      className={`hidden rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold sm:inline ${
        dark ? "bg-ash-950/20 text-ash-950/70" : "bg-ash-950/60 text-ash-400 ring-1 ring-ash-700"
      }`}
    >
      {children}
    </kbd>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-ember-500" : "bg-ash-700"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-bone shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ash-500">{label}</dt>
      <dd className="tabular mt-0.5 truncate text-ash-200" title={value}>
        {value}
      </dd>
    </div>
  );
}
