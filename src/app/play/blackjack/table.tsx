"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { ChipRail } from "@/components/chip-rail";
import { EmberBurst } from "@/components/ember-burst";
import { DrawerSection, GameScreen, useGameInsets } from "@/components/game-screen";
import { Switch } from "@/components/ui";
import { HAND_Z, DEALER_Z, handX } from "@/game/three/table-layout";
import type { Callout } from "@/game/three/table-3d";
import { FlatTable } from "./flat-table";
import { HeatMeter, OutcomeBanner } from "./parts";
import { outcome, schedule, type Timing } from "./timing";
import type { ActionType, RoundView } from "@/lib/blackjack/engine";
import { choiceLabel, type Decision } from "@/lib/blackjack/coach";
import { formatCost } from "@/lib/blackjack/ev";
import { bustIfHit, dealerBust, pct } from "@/lib/blackjack/odds";
import { basicStrategy, MOVE_LABEL } from "@/lib/blackjack/strategy";
import { isTableId, TABLE_IDS, TABLES, tableOf } from "@/lib/blackjack/tables";
import { whatIf } from "@/lib/blackjack/what-if";
import { chipsToUnits, formatChips, MAX_BET, MIN_BET, unitsToChips } from "@/lib/chips";
import { GameError, playAction, settleAbandoned, startRound, type RoundPayload } from "@/lib/blackjack/session";
import { useSettleLeftSeat } from "@/lib/earn";
import { OutOfChipsSheet } from "@/components/earn";
import { resolveQuality, useGraphics } from "@/lib/settings";
import { getProgress, useHydrated, useProgress } from "@/lib/store";
import { play, setAmbienceHeat, startAmbience, stopAmbience } from "@/lib/sound";
import { isBoolString, useStored } from "@/lib/use-stored";

const Table3D = dynamic(() => import("@/game/three/table-3d"), {
  ssr: false,
  loading: () => <div className="felt absolute inset-0 animate-pulse" />,
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

/** Streak heat: wins push it toward +1 (on fire), losses toward -1 (ice cold), pushes cool it toward 0. */
function nextHeat(h: number, tone: "win" | "push" | "lose", blackjack: boolean) {
  if (tone === "win") return Math.min(1, Math.max(0, h) + (blackjack ? 0.5 : 0.3));
  if (tone === "lose") return Math.max(-1, Math.min(0, h) - 0.28);
  return h * 0.7;
}

/** Run a local game call, turning rule violations into a toast. */
function attempt<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch (e) {
    if (e instanceof GameError) toast.error(e.message);
    else {
      console.error(e);
      toast.error("Something went wrong. Try again.");
    }
    return null;
  }
}

/* ------------------------------------------------------------------ table */

type PlayAction = "hit" | "stand" | "double" | "split" | "surrender";

const HINT_KEY = "inferno:hints";
const COACH_KEY = "inferno:coach";
const ODDS_KEY = "inferno:odds";
const GESTURE_KEY = "inferno:gestures";
const TABLE_KEY = "inferno:table";
const EMPTY_TIMING: Timing = { delays: {}, flip: 0, flipDuration: 0.42, drama: null, total: 0 };

interface CoachNote extends Decision {
  n: number;
  /** which hand the decision was about */
  hand: number;
}

/** A replay of the hand with the right play, shown on the table after a mistake. */
interface Replay {
  view: RoundView;
  correct: ActionType;
  chosen: ActionType;
  label: string;
}

export function BlackjackTable() {
  useSettleLeftSeat();
  const progress = useProgress();
  const [earnOpen, setEarnOpen] = useState(false);
  const ready = useHydrated();
  // the balance shown at the table only moves when a result is revealed, not when the
  // store settles the hand (which happens before the cards finish animating)
  const [shownUnits, setShownUnits] = useState<number | null>(null);
  const setWallet = useCallback((units: number) => setShownUnits(units), []);
  // Every fresh visit starts at an empty table. A hand left unfinished from a previous
  // visit is completed (stand / no insurance, like a casino treats an abandoned hand).
  const [round, setRound] = useState<RoundPayload | null>(null);
  const [graphics] = useGraphics();
  const quality = useSyncExternalStore(noopSubscribe, () => resolveQuality(graphics), () => "high" as const);
  const [timing, setTiming] = useState<Timing>(EMPTY_TIMING);
  const [revealed, setRevealed] = useState(true);
  const [burstKey, setBurstKey] = useState(0);
  const [heat, setHeat] = useState(0);
  const [drama, setDrama] = useState(false);
  const [blackjackKey, setBlackjackKey] = useState(0);
  const [loseKey, setLoseKey] = useState(0);
  const [bet, setBet] = useState(10);
  const [betStack, setBetStack] = useState<number[]>([]);
  const [epoch, setEpoch] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const webglOk = useSyncExternalStore(noopSubscribe, hasWebGL, () => true);

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
  const [coachPref, setCoachPref] = useStored(COACH_KEY, "1", isBoolString);
  const coach = coachPref === "1";
  const [oddsPref, setOddsPref] = useStored(ODDS_KEY, "1", isBoolString);
  const showOdds = oddsPref === "1";
  const [gesturePref, setGesturePref] = useStored(GESTURE_KEY, "1", isBoolString);
  const gestures = gesturePref === "1";
  const [tablePref, setTablePref] = useStored(TABLE_KEY, "classic", isTableId);
  const [coachNote, setCoachNote] = useState<CoachNote | null>(null);
  const coachTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const revealTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dramaTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** cards are still flying until this time (ms); table gestures wait for them */
  const animatingUntil = useRef(0);

  // replay of the last mistake with the right play
  const [mistake, setMistake] = useState<Replay | null>(null);
  const [replay, setReplay] = useState<{ n: number; data: Replay; timing: Timing; revealed: boolean } | null>(null);
  const replayTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      clearTimeout(coachTimer.current);
      clearTimeout(revealTimer.current);
      clearTimeout(replayTimer.current);
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
    const res = attempt(() => settleAbandoned());
    if (!res) return;
    const o = outcome(res.round.view);
    toast(`Your unfinished hand was settled (stood): ${o.title.toLowerCase()}`, {
      description: o.net === 0 ? "Stake returned" : `${formatChips(o.net, { sign: true })} chips`,
    });
  }, []);

  useEffect(() => {
    setAmbienceHeat(heat);
  }, [heat]);
  useEffect(() => {
    startAmbience();
    return () => stopAmbience();
  }, []);

  const view = round?.view ?? null;
  const toUsd = unitsToChips;
  const inPlay = !!view && view.phase !== "settled";
  // between hands the stored balance is the truth (it also picks up chips claimed meanwhile)
  const balanceUnits = !inPlay && revealed ? progress.chips : (shownUnits ?? progress.chips);
  const balanceChips = unitsToChips(balanceUnits);
  const broke = ready && !inPlay && revealed && balanceChips < MIN_BET;

  /** Apply a game response: schedule card animations, then reveal the outcome. */
  const receive = useCallback(
    (next: RoundPayload, nextWallet: number, prev: RoundView | null) => {
      const t = schedule(prev, next.view);
      animatingUntil.current = performance.now() + t.total * 1000;
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
        const o = outcome(next.view);
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

  const deal = useCallback(() => {
    if (inPlay || !revealed || replay) return;
    play("chip");
    const res = attempt(() => startRound(bet, tablePref));
    if (!res) return;
    setMistake(null);
    setCoachNote(null);
    // the stake leaves the stack now; any winnings land when the result is revealed
    if (res.round.view.phase === "settled") setWallet(balanceUnits - chipsToUnits(bet));
    receive(res.round, res.chips, null);
  }, [inPlay, revealed, replay, bet, tablePref, receive, balanceUnits, setWallet]);

  const act = useCallback(
    (a: ActionType) => {
      if (!round || !view?.legal.includes(a)) return;
      if (a === "double" || a === "split" || a === "insurance") play("chip");
      // snapshot before acting, so a mistake can be replayed with the right play
      const before = getProgress().activeRound;
      const snapshot = before && before.id === round.id ? structuredClone({ state: before.state, shoe: before.shoe }) : null;
      const handIndex = view.active;
      const res = attempt(() => playAction(round.id, a));
      if (!res) return;
      if (res.round.view.phase === "settled") setWallet(balanceUnits - (res.round.view.wagered - view.wagered));
      receive(res.round, res.chips, view);
      const d = res.decision;
      if (d && !d.ok && snapshot) {
        try {
          setMistake({ view: whatIf(snapshot.state, snapshot.shoe, d.correct), correct: d.correct, chosen: a, label: d.label });
        } catch (e) {
          console.error(e);
        }
      }
      if (d && coach) {
        setCoachNote((prev) => ({ ...d, n: (prev?.n ?? 0) + 1, hand: handIndex }));
        clearTimeout(coachTimer.current);
        coachTimer.current = setTimeout(() => setCoachNote(null), d.ok ? 2200 : 9000);
      }
    },
    [round, view, receive, coach, balanceUnits, setWallet],
  );

  const addChip = (v: number) => {
    if (inPlay || replay) return;
    const next = Math.min(MAX_BET, bet + v);
    if (next === bet) return;
    play("chip");
    setBetStack((s) => [...s, bet]);
    setBet(next);
  };
  const setBetTo = (v: number) => {
    const clamped = Math.max(MIN_BET, Math.min(MAX_BET, Math.round(v * 100) / 100));
    setBetStack((s) => [...s, bet]);
    setBet(clamped);
    play("click");
  };
  /** Take every chip back off the betting circle (undo restores the previous bet). */
  const clearBet = () => {
    if (inPlay || bet === 0) return;
    setBetStack((s) => [...s, bet]);
    setBet(0);
    play("click");
  };
  const undo = () => {
    setBetStack((s) => {
      if (!s.length) return s;
      setBet(s[s.length - 1]);
      return s.slice(0, -1);
    });
  };

  /* replay ------------------------------------------------------------ */

  const startReplay = () => {
    if (!mistake) return;
    const t = schedule(null, mistake.view);
    play("click");
    Object.entries(t.delays).forEach(([, d]) => play("card", d));
    const n = (replay?.n ?? 0) + 1;
    setReplay({ n, data: mistake, timing: t, revealed: false });
    clearTimeout(replayTimer.current);
    replayTimer.current = setTimeout(() => setReplay((r) => (r && r.n === n ? { ...r, revealed: true } : r)), t.total * 1000);
  };
  const endReplay = () => {
    clearTimeout(replayTimer.current);
    setReplay(null);
    play("click");
  };

  /* derived ------------------------------------------------------------ */

  const hand = inPlay && view.phase === "player" ? view.hands[view.active] : null;
  // the round's own table while a hand is live; otherwise the one picked for the next deal
  const table = inPlay && round ? tableOf(round.tableId) : TABLES[tablePref];
  const hint = hints && hand && view ? basicStrategy(hand.cards, view.dealer[0]!, view.legal, table.rules) : null;
  const canAfford = (a: ActionType) => !view?.costs[a] || view.costs[a]! <= progress.chips;
  const betTooBig = ready && bet > balanceChips + 1e-9;
  const result = view && view.phase === "settled" ? outcome(view) : null;

  // what the table shows: the live round, or the replay of the right play
  const shownView = replay ? replay.data.view : view;
  const shownId = replay ? `replay-${replay.n}` : (round?.id ?? null);
  const shownTiming = replay ? replay.timing : timing;
  const shownRevealed = replay ? replay.revealed : revealed;
  const replayResult = replay && replay.revealed ? outcome(replay.data.view) : null;

  /* keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey || drawer) return;
      const k = e.key.toLowerCase();
      if (replay) {
        if (k === "escape" || k === " " || k === "enter") {
          e.preventDefault();
          endReplay();
        }
        return;
      }
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

  /* table gestures: tap the felt to hit, swipe sideways to stand (the casino hand signals) */
  const gesture = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const deciding = !!hand && !replay && gestures;
  const onPointerDown = (e: React.PointerEvent) => {
    if (!deciding || !e.isPrimary) return;
    gesture.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.id !== e.pointerId || !deciding) return;
    if (performance.now() < animatingUntil.current - 150) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const dt = performance.now() - g.t;
    // a deliberate sideways drag of any speed is a stand
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      act("stand");
    } else if (Math.hypot(dx, dy) < 10 && dt < 350 && view?.legal.includes("hit")) {
      act("hit");
    }
  };

  /* coach callouts pinned to the table ------------------------------------ */

  const callouts = useMemo<Callout[]>(() => {
    const out: Callout[] = [];
    if (replay || !view) return out;
    const n = view.hands.length;
    const anchorOver = (hi: number): [number, number, number] => [handX(hi, n), 0.02, HAND_Z - 0.82];
    if (coachNote && coachNote.hand < n) {
      out.push({ id: `note-${coachNote.n}`, at: anchorOver(coachNote.hand), node: <CoachBubble note={coachNote} /> });
    } else if (hint && view.phase === "player") {
      out.push({ id: "hint", at: anchorOver(view.active), node: <HintPill move={hint} /> });
    }
    if (showOdds && hand && view.phase === "player") {
      const p = bustIfHit(hand.cards);
      const x = handX(view.active, n) + 0.62 + (hand.cards.length - 1) * 0.13;
      out.push({ id: "bust", at: [x, 0.02, HAND_Z + 0.1], node: <OddsTag label="Bust if you hit" value={pct(p)} hot={p >= 0.5} /> });
      if (view.dealer[0]) {
        const d = dealerBust(view.dealer[0], table.rules.dealerHitsSoft17);
        out.push({ id: "dealer", at: [1.15, 0.02, DEALER_Z], node: <OddsTag label="Dealer busts" value={pct(d)} hot={d >= 0.4} /> });
      }
    }
    return out;
  }, [replay, view, coachNote, hint, showOdds, hand, table.rules.dealerHitsSoft17]);

  /* render ------------------------------------------------------------- */

  const phase: "bet" | "insurance" | "play" | "replay" = replay ? "replay" : view?.phase === "insurance" ? "insurance" : inPlay ? "play" : "bet";

  const hud = (
    <>
      <div className="hidden sm:block">
        <HeatMeter heat={heat} />
      </div>
      <button
        onClick={() => setDrawer(true)}
        className="tabular flex h-10 items-center gap-1.5 rounded-xl bg-ash-950/60 px-3 text-sm font-bold text-bone ring-1 ring-ash-700/70 backdrop-blur-md"
        aria-label={`Chips: ${formatChips(balanceChips)}. Open table settings`}
      >
        <span className="h-3.5 w-3.5 rounded-full bg-[repeating-conic-gradient(#ffc24b_0_20deg,#e5360f_20deg_60deg)] shadow-[0_0_6px_rgba(255,122,31,0.6)]" />
        {ready ? formatChips(balanceChips, { compact: balanceChips >= 100_000 }) : "–"}
      </button>
    </>
  );

  return (
    <GameScreen
      title="Blackjack table"
      hud={hud}
      drawerTitle="Blackjack"
      drawerOpen={drawer}
      onDrawerChange={setDrawer}
      drawer={
        <TableDrawer
          balance={balanceChips}
          ready={ready}
          inPlay={inPlay}
          onGetChips={() => {
            setDrawer(false);
            setEarnOpen(true);
          }}
          coach={coach}
          setCoach={(v) => setCoachPref(v ? "1" : "0")}
          hints={hints}
          setHints={(v) => setHintsPref(v ? "1" : "0")}
          odds={showOdds}
          setOdds={(v) => setOddsPref(v ? "1" : "0")}
          gestures={gestures}
          setGestures={(v) => setGesturePref(v ? "1" : "0")}
          tablePref={tablePref}
          setTablePref={(id) => {
            setTablePref(id);
            play("click");
          }}
          blurb={table.blurb}
        />
      }
      bottom={
        <Dock
          phase={phase}
          view={view}
          bet={bet}
          ready={ready}
          locked={!revealed}
          betTooBig={betTooBig}
          balance={balanceChips}
          broke={broke}
          onGetChips={() => setEarnOpen(true)}
          canUndo={betStack.length > 0}
          again={!!view}
          hint={hint}
          gestures={gestures}
          canAfford={canAfford}
          toUsd={toUsd}
          onChip={addChip}
          onSet={setBetTo}
          onUndo={undo}
          onClear={clearBet}
          onDeal={deal}
          onAct={act}
          mistake={!inPlay && revealed && !replay ? mistake : null}
          onReplay={startReplay}
          replay={replay ? { data: replay.data, result: replayResult, actual: result } : null}
          onEndReplay={endReplay}
        />
      }
    >
      <SceneArea
        use3d={webglOk}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (gesture.current = null)}
      >
        {webglOk ? (
          sceneOn ? (
            <Table3D
              key={`${sceneKey}-${quality}`}
              fill
              quality={quality}
              view={shownView}
              roundId={shownId}
              timing={shownTiming}
              epoch={replay ? replay.n * 1000 + epoch : epoch}
              revealed={shownRevealed}
              pendingBetUsd={bet}
              toUsd={toUsd}
              fx={{ heat, drama: replay ? false : drama, blackjackKey, winKey: burstKey, loseKey }}
              tableId={table.id}
              focus={phase === "play" ? "hand" : "table"}
              onBetSpot={phase === "bet" && revealed ? () => (betStack.length ? (undo(), play("click")) : clearBet()) : undefined}
              callouts={callouts}
            />
          ) : (
            <div className="felt absolute inset-0 animate-pulse" />
          )
        ) : (
          <FlatTable
            view={shownView}
            roundId={shownId}
            timing={shownTiming}
            revealed={shownRevealed}
            table={table}
            bet={bet}
            toUsd={toUsd}
            dimRules={!!(result && revealed)}
          />
        )}

        {/* outcome banner + embers, centred in the band between HUD and controls */}
        <Band>
          {replay ? (
            <OutcomeBanner result={replayResult} roundId={`replay-${replay.n}`} />
          ) : (
            <OutcomeBanner result={result && revealed ? result : null} roundId={round?.id ?? ""} />
          )}
          {burstKey > 0 && !replay && (
            <EmberBurst key={burstKey} seed={burstKey} intensity={result?.blackjack ? 1.4 : 1} count={result?.blackjack ? 60 : 36} />
          )}
        </Band>
        {replay && (
          <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+72px)] z-20 flex justify-center px-4">
            <span className="rounded-full bg-sky-500/15 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-sky-200 ring-1 ring-sky-400/40 backdrop-blur-md">
              Replay · right play: {choiceLabel(replay.data.correct)}
            </span>
          </div>
        )}
      </SceneArea>

      <OutOfChipsSheet
        open={earnOpen}
        onClose={() => setEarnOpen(false)}
        need={
          balanceChips < MIN_BET
            ? `You're out of chips. The smallest bet is ${formatChips(MIN_BET)}.`
            : `You have ${formatChips(balanceChips)} chips. Here's how to get more.`
        }
      />
    </GameScreen>
  );
}

/* ------------------------------------------------------------------ layout pieces */

/** The scene layer. Pointer handlers here are the table gestures. */
function SceneArea({
  use3d,
  children,
  ...handlers
}: {
  use3d: boolean;
  children: React.ReactNode;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: () => void;
}) {
  const insets = useGameInsets();
  return (
    <div
      className="absolute inset-0"
      {...handlers}
      style={use3d ? undefined : { paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {children}
    </div>
  );
}

/** Absolutely positioned layer covering the band between the HUD and the controls. */
function Band({ children }: { children: React.ReactNode }) {
  const insets = useGameInsets();
  return (
    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: insets.top, bottom: insets.bottom }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ dock */

const GERUND: Record<ActionType, string> = {
  hit: "Hitting",
  stand: "Standing",
  double: "Doubling",
  split: "Splitting",
  surrender: "Surrendering",
  insurance: "Insuring",
  decline: "Declining insurance",
};

function NetText({ net }: { net: number }) {
  if (net > 0) return <span className="font-bold text-ember-300">win {formatChips(net)}</span>;
  if (net === 0) return <span className="font-bold text-ash-100">push</span>;
  return <span className="font-bold text-ash-300">lose {formatChips(-net)}</span>;
}

const SIDE_ACTIONS: { a: PlayAction; label: string; key: string }[] = [
  { a: "double", label: "Double", key: "D" },
  { a: "split", label: "Split", key: "P" },
  { a: "surrender", label: "Surrender", key: "R" },
];

function Dock(props: {
  phase: "bet" | "insurance" | "play" | "replay";
  view: RoundView | null;
  bet: number;
  ready: boolean;
  locked: boolean;
  betTooBig: boolean;
  balance: number;
  broke: boolean;
  onGetChips: () => void;
  canUndo: boolean;
  again: boolean;
  hint: PlayAction | null;
  gestures: boolean;
  canAfford: (a: ActionType) => boolean;
  toUsd: (u: number) => number;
  onChip: (v: number) => void;
  onSet: (v: number) => void;
  onUndo: () => void;
  onClear: () => void;
  onDeal: () => void;
  onAct: (a: ActionType) => void;
  mistake: Replay | null;
  onReplay: () => void;
  replay: { data: Replay; result: ReturnType<typeof outcome> | null; actual: ReturnType<typeof outcome> | null } | null;
  onEndReplay: () => void;
}) {
  const { phase, view } = props;

  if (phase === "replay" && props.replay) {
    const { data, result, actual } = props.replay;
    return (
      <div className="flex flex-col items-center gap-3 pb-1">
        <p className="max-w-md text-center text-sm text-ash-200">
          {result ? (
            <>
              <span className="font-bold text-bone">{data.label}.</span> {GERUND[data.correct]} these cards:{" "}
              <NetText net={result.net} />. Your {choiceLabel(data.chosen).toLowerCase()}: {actual ? <NetText net={actual.net} /> : "–"}.
              <span className="block pt-1 text-xs text-ash-400">
                {result.net > (actual?.net ?? 0)
                  ? "Same cards, better result. That's the right play paying off."
                  : "This time the right play does no better. Basic strategy wins over many hands, not every hand."}
              </span>
            </>
          ) : (
            <>Dealing the same cards with the right play…</>
          )}
        </p>
        <button onClick={props.onEndReplay} className="btn-fire h-12 min-w-44 rounded-xl px-6 font-display text-sm font-bold uppercase tracking-wider">
          Back to the table
        </button>
      </div>
    );
  }

  if (phase === "insurance" && view) {
    return (
      <div className="flex flex-col items-center gap-3 pb-1 sm:flex-row sm:justify-between">
        <div className="text-center sm:text-left">
          <p className="font-display text-sm font-bold">Dealer shows an Ace</p>
          <p className="text-sm text-ash-300">
            Insure for {formatChips(props.toUsd(view.costs.insurance ?? 0))}? Pays 2:1 if the dealer has blackjack.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            disabled={!props.canAfford("insurance") || !view.legal.includes("insurance")}
            onClick={() => props.onAct("insurance")}
            className="btn-ash h-12 rounded-xl px-5 font-bold"
          >
            Insure <Kbd>I</Kbd>
          </button>
          <button onClick={() => props.onAct("decline")} className="btn-fire h-12 rounded-xl px-5 font-bold">
            No thanks <Kbd dark>N</Kbd>
          </button>
        </div>
      </div>
    );
  }

  if (phase === "play" && view) {
    const legal = (a: PlayAction) => view.legal.includes(a);
    const sideShown = SIDE_ACTIONS.filter((s) => legal(s.a));
    return (
      <div className="flex flex-col gap-2 pb-1">
        {props.gestures && (
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-ash-400 [@media(pointer:fine)]:hidden">
            Tap the felt to hit · swipe sideways to stand
          </p>
        )}
        {sideShown.length > 0 && (
          <div className="flex justify-center gap-2">
            {sideShown.map(({ a, label, key }) => {
              const cost = view.costs[a];
              return (
                <button
                  key={a}
                  disabled={!props.canAfford(a)}
                  onClick={() => props.onAct(a)}
                  className={`btn-ash flex h-11 flex-1 flex-col items-center justify-center rounded-xl px-3 text-sm font-bold sm:max-w-40 ${
                    props.hint === a ? "ring-2 ring-ember-300 ring-offset-2 ring-offset-ash-950" : ""
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {label} <Kbd>{key}</Kbd>
                  </span>
                  {cost ? <span className="tabular text-[10px] font-semibold text-ash-400">+{formatChips(props.toUsd(cost))}</span> : null}
                </button>
              );
            })}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {(["stand", "hit"] as const).map((a) => (
            <button
              key={a}
              disabled={!legal(a)}
              onClick={() => props.onAct(a)}
              className={`h-14 rounded-2xl font-display text-base font-bold uppercase tracking-wider ${a === "hit" ? "btn-fire" : "btn-ash"} ${
                props.hint === a ? "ring-2 ring-ember-300 ring-offset-2 ring-offset-ash-950" : ""
              }`}
            >
              {a === "hit" ? "Hit" : "Stand"} <Kbd dark={a === "hit"}>{a === "hit" ? "H" : "S"}</Kbd>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // betting
  const { bet, betTooBig } = props;
  if (props.broke) {
    return (
      <div className="flex flex-col items-center gap-3 pb-1 sm:flex-row sm:justify-between">
        <div className="text-center sm:text-left">
          <p className="font-display text-sm font-bold">You&apos;re out of chips</p>
          <p className="text-sm text-ash-300">Check in, finish a challenge or take the comeback chips to keep playing.</p>
        </div>
        <button onClick={props.onGetChips} className="btn-fire h-12 w-full rounded-xl px-6 font-display text-sm font-bold uppercase tracking-wider sm:w-auto">
          Get chips
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2.5 pb-1">
      {props.mistake && (
        <button
          onClick={props.onReplay}
          className="mx-auto flex h-10 items-center gap-2 rounded-full bg-sky-500/12 px-4 text-sm font-bold text-sky-100 ring-1 ring-sky-400/40 backdrop-blur-md active:bg-sky-500/20"
        >
          <span aria-hidden>↺</span> Replay with the right play ({choiceLabel(props.mistake.correct).toLowerCase()})
        </button>
      )}
      <ChipRail disabled={bet >= MAX_BET} onChip={props.onChip} />
      <div className="flex items-center gap-2">
        <button onClick={props.onUndo} disabled={!props.canUndo} aria-label="Undo last chip" className="btn-ash grid h-12 w-11 shrink-0 place-items-center rounded-xl">
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
            <path d="M6 4L2 8l4 4M2.5 8H10a4 4 0 0 1 0 8" fill="none" stroke="currentColor" strokeWidth="1.6" transform="translate(0 -2)" />
          </svg>
        </button>
        <div className="flex h-12 min-w-0 flex-1 items-center gap-1 rounded-xl bg-ash-950/80 pl-3 pr-1 ring-1 ring-ash-600/70 sm:flex-none">
          <span className="text-xs text-ash-400">Bet</span>
          <input
            aria-label="Bet amount in chips"
            inputMode="decimal"
            value={bet}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
              if (Number.isFinite(n)) props.onSet(n);
            }}
            className="tabular w-full min-w-0 bg-transparent text-right text-base font-bold text-bone outline-none sm:w-20"
          />
          <button onClick={() => props.onSet(bet / 2)} aria-label="Halve bet" className="h-9 w-9 shrink-0 rounded-lg text-sm font-bold text-ash-300 hover:bg-ash-800">
            ½
          </button>
          <button onClick={() => props.onSet(bet * 2)} aria-label="Double bet" className="h-9 w-9 shrink-0 rounded-lg text-sm font-bold text-ash-300 hover:bg-ash-800">
            2×
          </button>
          <button onClick={props.onClear} disabled={bet === 0} aria-label="Clear bet" className="hidden h-9 shrink-0 rounded-lg px-2 text-xs font-bold text-ash-300 hover:bg-ash-800 disabled:opacity-40 sm:block">
            Clear
          </button>
        </div>
        <button
          onClick={props.onDeal}
          disabled={props.locked || !props.ready || betTooBig || bet < MIN_BET}
          className="btn-fire h-12 flex-1 rounded-xl px-5 font-display text-sm font-bold uppercase tracking-wider sm:min-w-40"
        >
          {props.again ? "Deal again" : "Deal"}
        </button>
      </div>
      {betTooBig && (
        <p className="text-center text-xs text-ember-300">
          Not enough chips ({formatChips(props.balance)}). Lower the bet or{" "}
          <button onClick={props.onGetChips} className="font-bold underline decoration-ember-500/60 underline-offset-2">
            get more chips
          </button>
          .
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ callouts */

function CoachBubble({ note }: { note: CoachNote }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      aria-live="polite"
      className={`relative w-[min(78vw,300px)] whitespace-normal rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug shadow-[0_12px_30px_rgba(0,0,0,0.55)] ring-1 backdrop-blur-md ${
        note.ok ? "bg-emerald-950/85 text-emerald-100 ring-emerald-400/40" : "bg-ash-950/90 text-ember-50 ring-ember-400/60"
      }`}
    >
      <span className="flex items-start gap-2">
        <span
          className={`mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-black ${
            note.ok ? "bg-emerald-400 text-ash-950" : "bg-ember-500 text-ash-950"
          }`}
        >
          {note.ok ? "✓" : "!"}
        </span>
        <span>
          {note.ok ? (
            <>
              <span className="font-bold">{choiceLabel(note.chosen)}</span> is right on {note.label.toLowerCase()}.
            </>
          ) : (
            <>
              <span className="font-bold">{note.label}:</span> the right play is <span className="font-bold text-ember-300">{choiceLabel(note.correct).toLowerCase()}</span>
              {typeof note.cost === "number" && note.cost > 0 && <span className="text-ash-300"> (costs ~{formatCost(note.cost)} of your bet on average)</span>}
              . <span className="text-ash-300">{note.why}</span>
            </>
          )}
        </span>
      </span>
      {/* tail pointing down at the cards */}
      <span
        aria-hidden
        className={`absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 ${note.ok ? "bg-emerald-950/85" : "bg-ash-950/90"}`}
      />
    </motion.div>
  );
}

function HintPill({ move }: { move: PlayAction }) {
  return (
    <motion.span
      key={move}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 rounded-full bg-ash-950/85 px-3.5 py-1.5 text-xs font-semibold text-ash-200 ring-1 ring-ember-400/60 shadow-[0_0_24px_-4px_rgba(255,120,40,0.7)] backdrop-blur-md"
    >
      Basic strategy
      <span className="font-display text-sm font-black uppercase tracking-wider text-ember-300">{MOVE_LABEL[move]}</span>
    </motion.span>
  );
}

function OddsTag({ label, value, hot }: { label: string; value: string; hot: boolean }) {
  return (
    <span className="flex flex-col items-center rounded-xl bg-ash-950/75 px-2.5 py-1 leading-tight ring-1 ring-ash-600/70 backdrop-blur-md">
      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-ash-400">{label}</span>
      <span className={`tabular font-display text-sm font-black ${hot ? "text-ember-300" : "text-bone"}`}>{value}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ drawer */

function TableDrawer(props: {
  balance: number;
  ready: boolean;
  inPlay: boolean;
  onGetChips: () => void;
  coach: boolean;
  setCoach: (v: boolean) => void;
  hints: boolean;
  setHints: (v: boolean) => void;
  odds: boolean;
  setOdds: (v: boolean) => void;
  gestures: boolean;
  setGestures: (v: boolean) => void;
  tablePref: keyof typeof TABLES;
  setTablePref: (id: keyof typeof TABLES) => void;
  blurb: string;
}) {
  return (
    <>
      <DrawerSection>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ash-500">Chips</p>
            <p className="tabular mt-1 font-display text-2xl font-bold">{props.ready ? formatChips(props.balance) : "–"}</p>
          </div>
          <button onClick={props.onGetChips} disabled={!props.ready} className="btn-ash h-10 rounded-xl px-3.5 text-xs font-bold">
            Get chips
          </button>
        </div>
      </DrawerSection>

      <DrawerSection title="Coach">
        <div className="flex flex-col gap-4">
          <Toggle title="Coach" sub="Grades every decision on the table, with a replay of the right play after mistakes." on={props.coach} set={props.setCoach} />
          <Toggle title="Hints" sub="Shows the basic-strategy play over your hand before you act." on={props.hints} set={props.setHints} />
          <Toggle title="Odds" sub="Your chance to bust if you hit, and how often the dealer busts." on={props.odds} set={props.setOdds} />
          <Toggle title="Table gestures" sub="Tap the felt to hit, swipe sideways to stand." on={props.gestures} set={props.setGestures} />
        </div>
      </DrawerSection>

      <DrawerSection
        title="Rules"
        action={
          <Link href="/train/blackjack/" className="text-xs font-semibold text-ember-400 hover:text-ember-300">
            Drill these →
          </Link>
        }
      >
        <div className="grid gap-1.5" role="radiogroup" aria-label="Table rules">
          {TABLE_IDS.map((id) => {
            const t = TABLES[id];
            const on = props.tablePref === id;
            return (
              <button
                key={id}
                role="radio"
                aria-checked={on}
                disabled={props.inPlay}
                onClick={() => props.setTablePref(id)}
                className={`rounded-xl px-3 py-2 text-left transition-colors disabled:cursor-not-allowed ${
                  on ? "bg-ember-500/12 ring-1 ring-ember-500/60" : "hover:bg-ash-800"
                } ${props.inPlay && !on ? "opacity-40" : ""}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-bold ${on ? "text-bone" : "text-ash-200"}`}>{t.name}</span>
                  <span className={`tabular text-[11px] font-semibold ${t.edge > 1 ? "text-ember-400" : "text-ash-400"}`}>{t.edge.toFixed(2)}% edge</span>
                </span>
                <span className="block text-[11px] text-ash-500">{t.short}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ash-500">{props.blurb}</p>
      </DrawerSection>

      <DrawerSection title="Shortcuts">
        <ul className="grid grid-cols-2 gap-y-1.5 text-xs text-ash-400">
          <li><Kbd show>Space</Kbd> Deal</li>
          <li><Kbd show>H</Kbd> Hit</li>
          <li><Kbd show>S</Kbd> Stand</li>
          <li><Kbd show>D</Kbd> Double</li>
          <li><Kbd show>P</Kbd> Split</li>
          <li><Kbd show>R</Kbd> Surrender</li>
        </ul>
      </DrawerSection>
    </>
  );
}

function Toggle({ title, sub, on, set }: { title: string; sub: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs text-ash-400">{sub}</p>
      </div>
      <Switch label={title} on={on} onChange={set} />
    </div>
  );
}

function Kbd({ children, dark, show }: { children: React.ReactNode; dark?: boolean; show?: boolean }) {
  return (
    <kbd
      className={`${show ? "inline" : "hidden lg:inline"} rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
        dark ? "bg-ash-950/20 text-ash-950/70" : "bg-ash-950/60 text-ash-400 ring-1 ring-ash-700"
      }`}
    >
      {children}
    </kbd>
  );
}
