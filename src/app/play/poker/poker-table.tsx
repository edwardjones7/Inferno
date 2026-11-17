"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BotAvatar } from "@/components/bot-avatar";
import { ChipRail } from "@/components/chip-rail";
import { STAKE_CENTER } from "@/game/poker-three/poker-stakes";
import { addChip as addStackChip, stackTo, sum as sumChips } from "@/lib/poker/stake";
import { DrawerSection, GameScreen, useGameInsets } from "@/components/game-screen";
import { IconTrophy } from "@/components/icons";
import { Switch } from "@/components/ui";
import { cardLabel } from "@/lib/blackjack/cards";
import { botDecide, botThinkMs } from "@/lib/poker/bots";
import { act, legal, newTable, positionOf, potOdds, startHand } from "@/lib/poker/game";
import type { CoachNote, PlayerAction, PokerState } from "@/lib/poker/game-types";
import { describe } from "@/lib/poker/eval";
import { maybeShowInterstitial, useAdBreakOnLeave } from "@/lib/ads";
import { blindsFor, botById, MATCH, ROSTER, STYLE_LABEL, TABLE_LINEUP, type BotProfile } from "@/lib/poker/roster";
import { coachHero } from "@/lib/poker/table-coach";
import { youText } from "@/lib/poker/text";
import { resolveQuality, useGraphics } from "@/lib/settings";
import { play } from "@/lib/sound";
import { applyRating, getProgress, touchDay, update, useHydrated, useProgress, type PokerNote } from "@/lib/store";
import { formatChips, unitsToChips } from "@/lib/chips";
import { buyInFor, CASH_BLINDS, CASH_BUY_IN, CASH_MIN_BUY_IN } from "@/lib/economy";
import { EconomyError, leaveSeat, rebuy, saveSeatStack, takeSeat } from "@/lib/earn";
import { OutOfChipsSheet } from "@/components/earn";
import { toast } from "sonner";
import { isBoolString, useStored } from "@/lib/use-stored";
import { boardKey, holeKey } from "@/game/poker-three/poker-scene";
import type { BotMood } from "@/game/poker-three/bot-presence";

const PokerScene = dynamic(() => import("@/game/poker-three/poker-scene"), {
  ssr: false,
  loading: () => <div className="felt absolute inset-0 animate-pulse" />,
});

/** the bots' stacks at the cash table (they rebuy for free; the hero buys in from the balance) */
const TABLE_STACK = CASH_BUY_IN;
const NEXT_HAND_MS = 3600;

const withHeroStack = (g: PokerState, stack: number): PokerState => ({ ...g, seats: g.seats.map((s) => (s.isHero ? { ...s, stack } : s)) });

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

const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
const HEADS_UP_PLACE = (i: number) => (i === 0 ? 0 : 3);

export type PokerMode = { mode: "match"; botId: string } | { mode: "table" };

interface MatchResult {
  result: "win" | "loss" | "draw";
  before: number;
  after: number;
  hands: number;
  unlocked: BotProfile | null;
}

export function PokerTable(props: PokerMode) {
  const router = useRouter();
  const bot = props.mode === "match" ? botById(props.botId) : null;
  const lineup = useMemo(() => (bot ? [bot] : TABLE_LINEUP.map((id) => botById(id)!)), [bot]);
  const stack = bot ? MATCH.stack : TABLE_STACK;

  // at the cash table the hero starts with nothing until the buy-in comes out of the balance
  const fresh = useCallback(() => {
    const [sb, bb] = bot ? blindsFor(1) : CASH_BLINDS;
    const g = newTable({ heroName: "You", bots: lineup.map((b) => ({ name: b.name, style: b.style, skill: b.skill })), stack, sb, bb });
    return bot ? g : withHeroStack(g, 0);
  }, [bot, lineup, stack]);
  const progress = useProgress();
  const hydrated = useHydrated();
  /** cash table: a buy-in is on the table */
  const [seated, setSeated] = useState(false);
  const [earnOpen, setEarnOpen] = useState(false);

  const [game, setGame] = useState<PokerState>(fresh);
  const [epoch, setEpoch] = useState(0);
  const [delays, setDelays] = useState<Record<string, number>>({});
  const [coach, setCoach] = useState<(CoachNote & { n: number }) | null>(null);
  const [coachPref, setCoachPref] = useStored("inferno:poker-coach", "1", isBoolString);
  const [autoPref, setAutoPref] = useStored("inferno:poker-auto", "1", isBoolString);
  const [gesturePref, setGesturePref] = useStored("inferno:poker-gestures", "1", isBoolString);
  const [drawer, setDrawer] = useState(false);
  /** chips you've pushed in this turn (beyond what you already have in), and the undo history */
  const [pushed, setPushed] = useState<number[]>([]);
  const [pushedHistory, setPushedHistory] = useState<number[][]>([]);
  /** true for a moment after the stack changes, so the camera looks at it */
  const [sizing, setSizing] = useState(false);
  const sizingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [session, setSession] = useState({ hands: 0, net: 0, won: 0, biggest: 0 });
  const [winKey, setWinKey] = useState(0);
  const [chat, setChat] = useState<{ seat: number; text: string; n: number } | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [graphics] = useGraphics();
  const webglOk = useSyncExternalStore(noop, hasWebGL, () => true);
  const quality = useSyncExternalStore(noop, () => resolveQuality(graphics), () => "high" as const);
  const startStack = useRef(stack);
  const gameRef = useRef(game);
  const notes = useRef<PokerNote[]>([]);
  const chatTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Next keeps hidden pages alive; drop the WebGL scene while hidden (see blackjack table).
  const [sceneOn, setSceneOn] = useState(true);
  const [sceneKey, setSceneKey] = useState(0);
  useEffect(() => {
    queueMicrotask(() => setSceneOn(true));
    return () => {
      setSceneOn(false);
      setSceneKey((k) => k + 1);
      clearTimeout(chatTimer.current);
    };
  }, []);

  // leaving the cash table after a real session is a natural break for an ad (free players only)
  useAdBreakOnLeave("poker-table-leave", !bot && session.hands > 0 ? String(session.hands) : null);

  const say = useCallback((seat: number, lines: string[], delay = 0) => {
    clearTimeout(chatTimer.current);
    chatTimer.current = setTimeout(() => {
      setChat((c) => ({ seat, text: pick(lines), n: (c?.n ?? 0) + 1 }));
      chatTimer.current = setTimeout(() => setChat(null), 3400);
    }, delay);
  }, []);

  /* ---------------------------------------------------------------- match end */

  const finishMatch = useCallback(
    (g: PokerState, resign = false) => {
      if (!bot || result) return;
      const hero = g.seats[0].stack;
      const villain = g.seats[1].stack;
      const outcome: MatchResult["result"] = resign || hero < villain ? "loss" : hero > villain ? "win" : "draw";
      const before = getProgress().ratings.poker.r;
      let unlocked: BotProfile | null = null;
      const p = update((p) => {
        applyRating(p, "poker", bot.rating, outcome === "win" ? 1 : outcome === "draw" ? 0.5 : 0);
        if (outcome === "win" && !p.beaten.includes(bot.id)) {
          p.beaten.push(bot.id);
          const i = ROSTER.findIndex((b) => b.id === bot.id);
          if (i >= 2 && ROSTER[i + 1]) unlocked = ROSTER[i + 1];
        }
        p.matches.push({ id: crypto.randomUUID(), at: Date.now(), botId: bot.id, result: outcome, hands: g.handNo, before, after: p.ratings.poker.r });
        touchDay(p);
      });
      setResult({ result: outcome, before, after: p.ratings.poker.r, hands: g.handNo, unlocked });
      play(outcome === "win" ? "blackjack" : outcome === "draw" ? "push" : "lose", 0.4);
      say(1, outcome === "win" ? bot.lines.lose : bot.lines.win, 300);
    },
    [bot, result, say],
  );

  const matchOver = (g: PokerState) => !!bot && g.street === "done" && (g.seats[0].stack === 0 || g.seats[1].stack === 0 || g.handNo >= MATCH.hands);

  /* ---------------------------------------------------------------- game loop */

  const recordHand = useCallback(
    (g: PokerState, net: number) => {
      const shown: Record<number, PokerState["seats"][number]["hole"]> = {};
      if (g.winners.some((w) => w.hand)) for (const s of g.seats) if (!s.folded && s.hole.length === 2) shown[s.id] = s.hole;
      const hero = g.seats[0];
      const record = {
        id: crypto.randomUUID(),
        at: Date.now(),
        mode: bot ? ("match" as const) : ("table" as const),
        bots: lineup.map((b) => b.id),
        handNo: g.handNo,
        hole: hero.hole,
        board: g.board,
        shown,
        names: g.seats.map((s) => s.name),
        net,
        bb: g.bb,
        log: g.log,
        notes: notes.current,
      };
      notes.current = [];
      update((p) => {
        p.pokerHands.push(record);
        touchDay(p);
      });
    },
    [bot, lineup],
  );

  const apply = useCallback(
    (next: PokerState, prev: PokerState) => {
      const d = dealDelays(prev, next);
      Object.values(d).forEach((t) => play("card", t));
      if (next.street === "done" && prev.street !== "done") {
        const heroWon = next.winners.filter((w) => w.seat === 0).reduce((n, w) => n + w.amount, 0);
        const net = next.seats[0].stack - startStack.current;
        const pot = next.pots.reduce((n, p) => n + p.amount, 0);
        setSession((s) => ({ hands: s.hands + 1, net: s.net + net, won: s.won + (heroWon > 0 ? 1 : 0), biggest: Math.max(s.biggest, pot) }));
        const showdownAt = 0.6 + Math.max(0, ...Object.values(d));
        play(heroWon > 0 ? "win" : "push", showdownAt);
        if (heroWon > 0) setTimeout(() => setWinKey((k) => k + 1), showdownAt * 1000);
        recordHand(next, net);
        if (bot && pot >= next.bb * 30 && !matchOver(next)) {
          const botWon = next.winners.some((w) => w.seat === 1);
          say(1, botWon ? bot.lines.win : bot.lines.lose, showdownAt * 1000 + 300);
        }
        if (matchOver(next)) setTimeout(() => finishMatch(next), showdownAt * 1000 + 900);
      }
      // the seat in the store follows the hero's stack (chips behind, not in the pot), so
      // leaving or a closed app settles exactly what's in front of you
      if (!bot) saveSeatStack(next.seats[0].stack);
      setDelays(d);
      gameRef.current = next;
      setGame(next);
      setEpoch((e) => e + 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matchOver only reads `bot`
    [recordHand, bot, say, finishMatch],
  );

  const deal = useCallback(
    () => {
      const g = gameRef.current;
      if (g.street !== "done" || result || matchOver(g)) return;
      // table mode: bots rebuy when busted so it stays full; the hero rebuys from the balance
      const topped: PokerState = {
        ...g,
        seats: g.seats.map((s) => (s.stack === 0 && !bot && !s.isHero ? { ...s, stack: TABLE_STACK } : s)),
      };
      if (bot) [topped.sb, topped.bb] = blindsFor(g.handNo + 1);
      if (topped.seats[0].stack === 0) return;
      const next = startHand(topped, Math.random);
      startStack.current = next.seats[0].stack + next.seats[0].totalCommitted;
      notes.current = [];
      setCoach(null);
      apply(next, g);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matchOver only reads `bot`
    [apply, bot, result],
  );

  // first hand (and a greeting)
  useEffect(() => {
    if (game.handNo !== 0) return;
    queueMicrotask(() => deal());
    if (bot) say(1, bot.lines.greet, 700);
  }, [game.handNo, deal, bot, say]);

  /* ---------------------------------------------------------------- cash table seat */

  /** A fresh table with the hero holding `stack`, dealt straight away when there is one. */
  const openTable = useCallback(
    (heroStack: number) => {
      const g = withHeroStack(fresh(), heroStack);
      gameRef.current = g;
      notes.current = [];
      setSeated(heroStack > 0);
      setSession({ hands: 0, net: 0, won: 0, biggest: 0 });
      setCoach(null);
      setGame(g);
      setEpoch((e) => e + 1);
      if (heroStack > 0) deal();
    },
    [fresh, deal],
  );

  /** Buy in from the balance and sit down. */
  const sit = useCallback(() => {
    let amount = 0;
    try {
      amount = takeSeat();
    } catch (e) {
      if (!(e instanceof EconomyError)) throw e;
    }
    return amount;
  }, []);

  // Sitting at the cash table buys in; leaving it (back button, another tab, the page being
  // hidden) cashes the stack back into the balance. A seat left by a closed app is settled
  // by the next screen that opens (see useSettleLeftSeat).
  useEffect(() => {
    if (bot) return;
    const amount = sit();
    queueMicrotask(() => openTable(amount));
    return () => {
      leaveSeat();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit; openTable is stable for the cash table
  }, [bot]);

  const buyIn = () => {
    const amount = sit();
    if (amount) {
      play("chip");
      openTable(amount);
    } else setEarnOpen(true);
  };

  /** Rebuy (or top up a short stack) to 100bb between hands. */
  const topUp = () => {
    const g = gameRef.current;
    if (bot || g.street !== "done") return;
    try {
      const added = rebuy(g.seats[0].stack);
      const next = withHeroStack(g, g.seats[0].stack + added);
      gameRef.current = next;
      setGame(next);
      play("chip");
      toast(`Added ${formatChips(added)} chips to your stack`);
      if (g.seats[0].stack === 0) deal();
    } catch (e) {
      if (!(e instanceof EconomyError)) throw e;
      setEarnOpen(true);
    }
  };

  // bots act on their turn
  useEffect(() => {
    if (game.street === "done" || game.toAct === null || game.toAct === 0) return;
    const seat = game.toAct;
    const t = setTimeout(() => {
      const a = botDecide(game, seat, Math.random);
      if (a.kind === "raise" || a.kind === "call") play("chip");
      if (bot && a.kind === "raise" && a.to >= game.seats[seat].stack + game.seats[seat].committed && Math.random() < 0.6) say(seat, bot.lines.bigPot);
      apply(act(game, a), game);
    }, botThinkMs(Math.random));
    return () => clearTimeout(t);
  }, [game, apply, bot, say]);

  // next hand after the result has been seen
  useEffect(() => {
    if (game.street !== "done" || autoPref !== "1" || game.seats[0].stack === 0 || matchOver(game) || result) return;
    const t = setTimeout(() => deal(), NEXT_HAND_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matchOver only reads `bot`
  }, [game, autoPref, deal, result]);

  const balance = Math.floor(unitsToChips(progress.chips));
  const canBuyIn = hydrated ? buyInFor(progress) : 0;

  const heroTurn = game.toAct === 0 && game.street !== "done";
  const opts = heroTurn ? legal(game) : null;
  const hero = game.seats[0];

  // every turn starts with no chips pushed in
  const lastTurn = useRef(-1);
  useEffect(() => {
    if (!opts) return;
    const marker = game.log.length;
    if (lastTurn.current === marker) return;
    lastTurn.current = marker;
    queueMicrotask(() => {
      setPushed([]);
      setPushedHistory([]);
      setSizing(false);
    });
  }, [opts, game.log.length]);

  /* building the bet with chips, like the blackjack table */
  const put = sumChips(pushed);
  const maxPut = opts ? opts.maxRaiseTo - hero.committed : 0;
  /** the raise the chips add up to, topped up to the legal minimum */
  const raiseTarget = opts ? Math.min(opts.maxRaiseTo, Math.max(opts.minRaiseTo, hero.committed + put)) : 0;
  const changeStack = (next: number[], sound: "chip" | "click") => {
    if (next.length === pushed.length && next.every((v, i) => v === pushed[i])) return;
    setPushedHistory((h) => [...h, pushed]);
    setPushed(next);
    play(sound);
    setSizing(true);
    clearTimeout(sizingTimer.current);
    sizingTimer.current = setTimeout(() => setSizing(false), 2400);
  };
  const setPutTo = (n: number, sound: "chip" | "click" = "chip") => changeStack(stackTo(pushed, Math.max(0, Math.min(maxPut, n))), sound);
  const addChip = (v: number) => changeStack(addStackChip(pushed, v, maxPut), "chip");
  const undoChip = () => {
    if (!pushedHistory.length) return;
    setPushed(pushedHistory[pushedHistory.length - 1]);
    setPushedHistory((h) => h.slice(0, -1));
    play("click");
  };
  useEffect(() => () => clearTimeout(sizingTimer.current), []);

  const heroAct = useCallback(
    (a: PlayerAction) => {
      if (!heroTurn) return;
      const note = coachHero(game, a);
      notes.current.push({ street: game.street, ok: note.ok, title: note.title, detail: note.detail, at: game.log.length, cost: note.cost });
      if (coachPref === "1") setCoach((c) => ({ ...note, n: (c?.n ?? 0) + 1 }));
      if (a.kind === "raise" || a.kind === "call") play("chip");
      else play("click");
      apply(act(game, a), game);
    },
    [heroTurn, coachPref, game, apply],
  );

  // keyboard: F fold, C check/call, R raise (current slider), A all-in
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input[type=text], textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey || drawer) return;
      const k = e.key.toLowerCase();
      if (game.street === "done" && (k === "enter" || k === " ")) {
        e.preventDefault();
        deal();
        return;
      }
      if (!opts) return;
      if (k === "f" && opts.canFold && !opts.canCheck) heroAct({ kind: "fold" });
      else if (k === "c") heroAct(opts.canCheck ? { kind: "check" } : { kind: "call" });
      else if (k === "r" && opts.canRaise) heroAct({ kind: "raise", to: raiseTarget });
      else if (k === "a" && opts.canRaise) heroAct({ kind: "raise", to: opts.maxRaiseTo });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opts, heroAct, raiseTarget, game.street, deal, drawer]);

  // showdown: reveal everyone who got to the end
  const revealed = useMemo(() => {
    const r = new Set<number>();
    if (game.street === "done" && game.winners.some((w) => w.hand)) for (const s of game.seats) if (!s.folded && s.hole.length === 2) r.add(s.id);
    return r;
  }, [game]);

  const place = bot ? HEADS_UP_PLACE : undefined;
  const heroHand = hero.hole.length === 2 ? describe([...hero.hole, ...game.board]).name : null;
  const potPresets = opts
    ? [
        { label: "½", frac: 0.5 },
        { label: "¾", frac: 0.75 },
        { label: "Pot", frac: 1 },
      ].map((p) => ({ ...p, to: Math.round(Math.min(opts.maxRaiseTo, Math.max(opts.minRaiseTo, game.currentBet + p.frac * (game.pot + opts.toCall)))) }))
    : [];

  const labels: Record<string, React.ReactNode> = {};
  for (const s of game.seats) {
    const win = game.street === "done" ? game.winners.filter((w) => w.seat === s.id) : [];
    const thinking = game.toAct === s.id && game.street !== "done";
    const profile = s.isHero ? null : lineup[s.id - 1];
    const bubble = chat && chat.seat === s.id ? chat : null;
    labels[`seat${place ? place(s.id) : s.id}`] = (
      <div className="relative w-max">
        <AnimatePresence>
          {bubble && (
            <motion.div
              key={bubble.n}
              initial={{ opacity: 0, y: 6, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute bottom-full left-1/2 mb-2 w-max max-w-44 -translate-x-1/2 rounded-2xl rounded-bl-sm bg-bone px-3 py-1.5 text-xs font-semibold text-ash-950 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8)]"
            >
              {bubble.text}
            </motion.div>
          )}
        </AnimatePresence>
        <div
          className={`flex items-center gap-2 rounded-2xl py-1 pl-1 pr-3 ring-1 transition-all ${
            thinking
              ? "bg-ash-950/90 ring-ember-400 shadow-[0_0_24px_-4px_rgba(255,122,31,0.9)]"
              : s.folded && game.street !== "done"
                ? "bg-ash-950/60 ring-ash-800 opacity-60"
                : "bg-ash-950/85 ring-ash-700"
          } ${s.isHero ? "pl-3" : ""}`}
        >
          {profile && <BotAvatar bot={profile} size={30} />}
          <div className="flex min-w-14 flex-col items-start leading-tight">
            <span className="flex items-center gap-1.5 text-[11px] font-bold">
              <span className={s.isHero ? "text-ember-200" : "text-bone"}>{s.isHero ? "You" : s.name}</span>
              {game.handNo > 0 && s.stack + s.totalCommitted > 0 && <span className="rounded bg-ash-800 px-1 text-[9px] text-ash-400">{positionOf(game, s.id)}</span>}
            </span>
            <span className="tabular text-xs font-semibold text-ember-200">{s.stack.toLocaleString()}</span>
            {win.length > 0 ? (
              <span className="mt-0.5 rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-ash-950">+{win.reduce((n, w) => n + w.amount, 0)}</span>
            ) : thinking && !s.isHero ? (
              <span className="text-[10px] text-ember-300">thinking…</span>
            ) : s.lastAction ? (
              <span className={`text-[10px] ${s.lastAction.startsWith("Fold") ? "text-ash-500" : "text-ash-300"}`}>{s.lastAction}</span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
  labels.pot =
    game.pot > 0 && game.street !== "done" ? (
      <div className="w-max rounded-full bg-ash-950/85 px-3 py-1 text-xs font-bold text-ember-200 ring-1 ring-ember-500/40">Pot {game.pot.toLocaleString()}</div>
    ) : null;

  const lastEvents = game.log.slice(-6);
  const winnerLine = game.winners.length
    ? game.winners
        .map((w) => `${w.seat === 0 ? "You" : game.seats[w.seat].name} win${w.seat === 0 ? "" : "s"} ${w.amount}${w.hand ? ` with ${w.hand.toLowerCase()}` : ""}`)
        .join(" · ")
    : "Shuffling up…";

  const restart = () => {
    const g = fresh();
    gameRef.current = g;
    notes.current = [];
    setResult(null);
    setSession({ hands: 0, net: 0, won: 0, biggest: 0 });
    setCoach(null);
    setGame(g);
    setEpoch((e) => e + 1);
  };

  // 2D table only when the device cannot run WebGL
  const flat = !webglOk;

  /* table gestures: swipe up to bet/raise the chips you've pushed, swipe down to check or fold */
  const gesture = useRef<{ x: number; y: number; id: number } | null>(null);
  const gesturesOn = gesturePref === "1" && !!opts;
  const onPointerDown = (e: React.PointerEvent) => {
    if (!gesturesOn || !e.isPrimary) return;
    gesture.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.id !== e.pointerId || !opts) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.abs(dy) < 70 || Math.abs(dy) < Math.abs(dx) * 1.4) return;
    if (dy < 0 && opts.canRaise) heroAct({ kind: "raise", to: raiseTarget });
    else if (dy > 0) heroAct(opts.canCheck ? { kind: "check" } : { kind: "fold" });
  };

  /* bots at the table, and what each is doing */
  const bots = lineup.map((b, i) => {
    const seat = game.seats[i + 1];
    const won = game.street === "done" && game.winners.some((w) => w.seat === seat.id);
    const mood: BotMood = won
      ? "won"
      : seat.folded && game.street !== "done"
        ? "folded"
        : game.toAct === seat.id && game.street !== "done"
          ? "thinking"
          : seat.lastAction && /^(Bet|Raise|All)/.test(seat.lastAction)
            ? "aggressive"
            : "idle";
    const actKey = game.log.reduce((n, e) => n + (e.kind === "action" && e.seat === seat.id ? 1 : 0), 0);
    return { seat: seat.id, bot: b, mood, actKey };
  });

  /* teaching callouts on the felt: the coach's note, your hand, the price of a call */
  const anchors: Record<string, [number, number, number]> = {};
  if (opts && put > 0) {
    labels.stake = (
      <span className="tabular block w-max rounded-full bg-ash-950/85 px-2.5 py-0.5 font-display text-sm font-bold text-ember-200 ring-1 ring-ember-500/50 shadow-[0_0_16px_-4px_rgba(255,122,31,0.8)]">
        {put.toLocaleString()}
      </span>
    );
    // just past the far side of the stack, so the tag never hides the chips
    anchors.stake = [STAKE_CENTER.x, 0.05, STAKE_CENTER.z - 0.42];
  }
  if (coach) {
    labels.coach = <PokerCoachBubble note={coach} />;
    anchors.coach = [0, 0.05, 1.02];
  }
  if (opts && hero.hole.length === 2) {
    const odds = opts.toCall > 0 ? potOdds(game) : 0;
    labels.read = (
      <div>
        <HandRead hand={heroHand} odds={odds} toCall={opts.toCall} />
      </div>
    );
    // beside your name tag, clear of your cards and bet
    anchors.read = [1.35, 0.25, 3.0];
  }


  const hud = bot ? (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-ash-950/60 py-1 pl-1 pr-3 ring-1 ring-ash-700/70 backdrop-blur-md sm:flex-none">
      <BotAvatar bot={bot} size={32} />
      <div className="min-w-0 leading-tight">
        <p className="flex items-center gap-1.5 truncate text-sm font-bold">
          {bot.name} <span className="tabular text-[11px] font-semibold text-ash-400">{bot.rating}</span>
        </p>
        <p className="tabular truncate text-[11px] text-ash-400">
          Hand {Math.max(1, game.handNo)}/{MATCH.hands} · {game.sb}/{game.bb}
        </p>
      </div>
      <div className="ml-auto hidden h-1.5 w-20 overflow-hidden rounded-full bg-ash-800 sm:block" aria-hidden>
        <div className="h-full rounded-full bg-gradient-to-r from-ember-600 to-ember-300 transition-all" style={{ width: `${(hero.stack / (MATCH.stack * 2)) * 100}%` }} />
      </div>
    </div>
  ) : (
    <div className="rounded-xl bg-ash-950/60 px-3 py-2 text-xs font-bold text-ash-200 ring-1 ring-ash-700/70 backdrop-blur-md">
      6-max · {game.sb}/{game.bb}
    </div>
  );

  return (
    <GameScreen
      title={bot ? `Heads-up against ${bot.name}` : "6-max cash game"}
      backHref="/play/poker/"
      hud={hud}
      drawerTitle={bot ? "Match" : "Cash game"}
      drawerOpen={drawer}
      onDrawerChange={setDrawer}
      drawer={
        <>
          <DrawerSection title={bot ? "Match" : "Session"}>
            <dl className="grid grid-cols-4 gap-3 text-xs">
              <SessionStat label="Hands" value={String(session.hands)} />
              <SessionStat label="Won" value={String(session.won)} />
              <SessionStat label="Net" value={`${session.net >= 0 ? "+" : ""}${session.net}`} hot={session.net > 0} />
              <SessionStat label="Top pot" value={String(session.biggest)} />
            </dl>
            {bot ? (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => {
                    setDrawer(false);
                    if (!result) finishMatch(gameRef.current, true);
                  }}
                  disabled={!!result}
                  className="btn-ash h-10 flex-1 rounded-xl text-xs font-bold"
                >
                  Resign
                </button>
                <Link href="/play/poker/" className="btn-ash grid h-10 flex-1 place-items-center rounded-xl text-xs font-bold">
                  Change bot
                </Link>
              </div>
            ) : (
              <>
                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-ash-950/50 p-3 text-xs ring-1 ring-ash-800">
                  <SessionStat label="At the table" value={formatChips(hero.stack + hero.totalCommitted)} />
                  <SessionStat label="Your chips" value={hydrated ? formatChips(balance) : "–"} />
                </dl>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      setDrawer(false);
                      topUp();
                    }}
                    disabled={!seated || game.street !== "done" || hero.stack >= CASH_BUY_IN || hero.stack + Math.min(balance, CASH_BUY_IN - hero.stack) < CASH_MIN_BUY_IN}
                    className="btn-ash h-10 flex-1 rounded-xl text-xs font-bold"
                  >
                    Top up to {formatChips(CASH_BUY_IN)}
                  </button>
                  <Link href="/play/" className="btn-ash grid h-10 flex-1 place-items-center rounded-xl text-xs font-bold">
                    Leave table
                  </Link>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-ash-500">
                  Blinds {CASH_BLINDS[0]}/{CASH_BLINDS[1]}. You buy in for up to 100 big blinds from your chips, and your stack goes back to them when you leave. Leaving
                  mid-hand folds the hand. Bots rebuy when they bust.
                </p>
              </>
            )}
          </DrawerSection>

          <DrawerSection title="Coach">
            <div className="flex flex-col gap-4">
              <ToggleRow title="Coach" sub="Grades your opens and calls on the table as you play." on={coachPref === "1"} set={(v) => setCoachPref(v ? "1" : "0")} />
              <ToggleRow title="Auto-deal" sub="Deal the next hand automatically." on={autoPref === "1"} set={(v) => setAutoPref(v ? "1" : "0")} />
              <ToggleRow title="Table gestures" sub="Swipe up to bet the chips you've pushed in, swipe down to check or fold." on={gesturePref === "1"} set={(v) => setGesturePref(v ? "1" : "0")} />
            </div>
          </DrawerSection>

          {bot ? (
            <DrawerSection>
              <div className="flex items-center gap-3">
                <BotAvatar bot={bot} size={44} />
                <div>
                  <p className="font-display text-sm font-bold">{bot.name}</p>
                  <p className="eyebrow">{STYLE_LABEL[bot.style]}</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ash-300">{bot.bio}</p>
            </DrawerSection>
          ) : (
            <DrawerSection title="Opponents">
              <ul className="space-y-2 text-xs text-ash-400">
                {lineup.map((b) => (
                  <li key={b.id} className="flex items-center gap-2">
                    <BotAvatar bot={b} size={24} />
                    <span className="flex-1 text-ash-200">{b.name}</span>
                    <span className="text-[10px] uppercase tracking-wider">{STYLE_LABEL[b.style]}</span>
                  </li>
                ))}
              </ul>
            </DrawerSection>
          )}

          <DrawerSection title={`Hand #${game.handNo}`}>
            <ul className="space-y-1 text-xs">
              {lastEvents.map((e, i) => (
                <li key={`${game.handNo}-${game.log.length - lastEvents.length + i}`} className={e.seat === 0 ? "text-ember-200" : "text-ash-300"}>
                  {youText(e.text)}
                </li>
              ))}
            </ul>
            {game.board.length > 0 && <p className="mt-2 text-[11px] text-ash-500">Board: {game.board.map(cardLabel).join(" ")}</p>}
          </DrawerSection>
        </>
      }
      bottom={
        <div className="pb-1">
          {!bot && game.street === "done" && hero.stack === 0 ? (
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
              <div className="text-center sm:text-left">
                <p className="font-display text-sm font-bold">
                  {!hydrated ? " " : seated ? "You're out of chips at this table" : canBuyIn ? "Take a seat" : "Not enough chips to sit down"}
                </p>
                <p className="text-sm text-ash-300">
                  {!hydrated
                    ? " "
                    : canBuyIn
                      ? `Buy in for ${formatChips(canBuyIn)} from your ${formatChips(balance)} chips.`
                      : `The buy-in is ${formatChips(CASH_MIN_BUY_IN)}–${formatChips(CASH_BUY_IN)}. You have ${formatChips(balance)}.`}
                </p>
              </div>
              {canBuyIn ? (
                <div className="flex w-full gap-2 sm:w-auto">
                  <button onClick={() => setEarnOpen(true)} className="btn-ash h-12 flex-1 rounded-xl px-4 text-sm font-bold sm:flex-none">
                    Get chips
                  </button>
                  <button onClick={seated ? topUp : buyIn} className="btn-fire h-12 flex-[2] rounded-xl px-6 font-bold sm:flex-none">
                    {seated ? "Rebuy" : "Buy in"} {formatChips(canBuyIn)}
                  </button>
                </div>
              ) : (
                <button onClick={() => setEarnOpen(true)} disabled={!hydrated} className="btn-fire h-12 w-full rounded-xl px-6 font-bold sm:w-auto">
                  Get chips
                </button>
              )}
            </div>
          ) : game.street === "done" ? (
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
              <p className="text-center text-sm text-ash-200 sm:text-left">{winnerLine}</p>
              {result ? null : matchOver(game) ? (
                <p className="text-sm font-bold text-ember-300">Match over…</p>
              ) : (
                <button onClick={() => deal()} className="btn-fire h-12 w-full rounded-xl px-6 font-bold sm:w-auto">
                  Next hand <kbd className="ml-1 hidden rounded bg-ash-950/20 px-1.5 py-0.5 font-mono text-[10px] lg:inline">Enter</kbd>
                </button>
              )}
            </div>
          ) : opts ? (
            <div className="flex flex-col gap-2.5">
              {gesturesOn && (
                <p className="text-center caps-label [@media(pointer:fine)]:hidden">
                  Swipe up to {opts.isOpeningBet ? "bet" : "raise"} · swipe down to {opts.canCheck ? "check" : "fold"}
                </p>
              )}
              {opts.canRaise && (
                <>
                  <ChipRail onChip={addChip} disabled={put >= maxPut} />
                  <div className="flex items-center justify-center gap-1.5">
                    <button onClick={undoChip} disabled={!pushedHistory.length} aria-label="Take the last chip back" className="btn-ash grid h-9 w-10 shrink-0 place-items-center rounded-lg">
                      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                        <path d="M6 4L2 8l4 4M2.5 8H10a4 4 0 0 1 0 8" fill="none" stroke="currentColor" strokeWidth="1.6" transform="translate(0 -2)" />
                      </svg>
                    </button>
                    {potPresets.map((p) => (
                      <button key={p.label} onClick={() => setPutTo(p.to - hero.committed)} className="btn-ash h-9 rounded-lg px-2.5 text-xs font-bold">
                        {p.label}
                      </button>
                    ))}
                    <button onClick={() => setPutTo(maxPut)} className="btn-ash h-9 rounded-lg px-2.5 text-xs font-bold">
                      Max
                    </button>
                    <button onClick={() => setPutTo(0, "click")} disabled={put === 0} className="btn-ash h-9 rounded-lg px-2.5 text-xs font-bold">
                      Clear
                    </button>
                  </div>
                </>
              )}
              <div className="grid grid-cols-3 gap-2">
                <button disabled={!opts.canFold || opts.canCheck} onClick={() => heroAct({ kind: "fold" })} className="btn-ash h-14 rounded-2xl font-bold">
                  Fold <kbd className="ml-1 hidden font-mono text-[10px] lg:inline">F</kbd>
                </button>
                <button onClick={() => heroAct(opts.canCheck ? { kind: "check" } : { kind: "call" })} className="btn-fire h-14 rounded-2xl font-bold">
                  {opts.canCheck ? "Check" : `Call ${opts.toCall}`} <kbd className="ml-1 hidden font-mono text-[10px] lg:inline">C</kbd>
                </button>
                <button
                  disabled={!opts.canRaise}
                  onClick={() => heroAct({ kind: "raise", to: raiseTarget })}
                  className="btn-fire flex h-14 flex-col items-center justify-center rounded-2xl font-bold leading-tight"
                >
                  <span className="text-xs opacity-80">
                    {raiseTarget >= opts.maxRaiseTo ? "All-in" : opts.isOpeningBet ? "Bet" : "Raise to"}
                    {put > 0 && hero.committed + put < opts.minRaiseTo ? " (min)" : ""}
                  </span>
                  <span className="tabular">{raiseTarget}</span>
                </button>
              </div>
            </div>
          ) : (
            <p className="py-3 text-center text-sm text-ash-300">
              {hero.folded ? "You folded. Watching the hand play out…" : `Waiting for ${game.toAct !== null ? game.seats[game.toAct].name : "the deal"}…`}
            </p>
          )}
        </div>
      }
    >
      <PokerSceneArea flat={flat} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => (gesture.current = null)}>
        {flat ? (
          <FlatPokerTable game={game} revealed={revealed} labels={labels} place={place} />
        ) : sceneOn ? (
          <PokerScene
            key={`${sceneKey}-${quality}`}
            fill
            game={game}
            epoch={epoch}
            delays={delays}
            revealed={revealed}
            fx={{ heat: 0, drama: false, blackjackKey: 0, winKey, loseKey: 0 }}
            labels={labels}
            anchors={anchors}
            place={place}
            quality={quality}
            focus={heroTurn ? (sizing && put > 0 ? "stake" : "hand") : "table"}
            bots={bots}
            stake={heroTurn && opts?.canRaise ? pushed : undefined}
            onStakeTap={undoChip}
          />
        ) : (
          <div className="felt absolute inset-0" />
        )}
      </PokerSceneArea>

      <AnimatePresence>
        {result && bot && (
          <MatchResultSheet
            bot={bot}
            result={result}
            // the end of a match is a natural break: maybe an ad (free players), then carry on
            onRematch={() => void maybeShowInterstitial("match-end").finally(restart)}
            onNext={(id) => void maybeShowInterstitial("match-end").finally(() => router.push(`/play/poker/match/?bot=${id}`))}
            onReview={() => void maybeShowInterstitial("match-end").finally(() => router.push("/review/?tab=poker"))}
          />
        )}
      </AnimatePresence>

      {!bot && (
        <OutOfChipsSheet
          open={earnOpen}
          onClose={() => setEarnOpen(false)}
          need={`The cash game buy-in is ${formatChips(CASH_MIN_BUY_IN)} to ${formatChips(CASH_BUY_IN)} chips. You have ${formatChips(balance)}.`}
        />
      )}
    </GameScreen>
  );
}

/** The scene layer; its pointer handlers are the table gestures. */
function PokerSceneArea({
  flat,
  children,
  ...handlers
}: {
  flat: boolean;
  children: React.ReactNode;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: () => void;
}) {
  const insets = useGameInsets();
  return (
    <div className="absolute inset-0" {...handlers} style={flat ? { paddingTop: insets.top, paddingBottom: insets.bottom } : undefined}>
      {children}
    </div>
  );
}

function PokerCoachBubble({ note }: { note: CoachNote & { n: number } }) {
  const tone =
    note.ok === false
      ? "bg-ash-950/90 text-ember-50 ring-ember-400/60"
      : note.ok
        ? "bg-emerald-950/85 text-emerald-100 ring-emerald-400/40"
        : "bg-ash-950/85 text-ash-100 ring-ash-600/70";
  return (
    <motion.div
      key={note.n}
      initial={{ opacity: 0, y: 8, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      aria-live="polite"
      className={`w-[min(80vw,320px)] whitespace-normal rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug shadow-[0_12px_30px_rgba(0,0,0,0.55)] ring-1 backdrop-blur-md ${tone}`}
    >
      <span className="font-bold">{note.title}</span> <span className="opacity-80">{note.detail}</span>
    </motion.div>
  );
}

/** What you're holding, and when facing a bet, the equity a call needs. */
function HandRead({ hand, odds, toCall }: { hand: string | null; odds: number; toCall: number }) {
  return (
    <div className="flex w-max flex-col items-center gap-1">
      {hand && (
        <span className="rounded-xl bg-ash-950/80 px-2.5 py-1 text-center leading-tight ring-1 ring-ash-600/70 backdrop-blur-md">
          <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-ash-400">You have</span>
          <span className="block font-display text-xs font-bold text-bone">{hand}</span>
        </span>
      )}
      {toCall > 0 && (
        <span className="rounded-xl bg-ash-950/80 px-2.5 py-1 text-center leading-tight ring-1 ring-ember-500/40 backdrop-blur-md">
          <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-ash-400">To call you need</span>
          <span className="tabular block font-display text-sm font-black text-ember-300">{Math.round(odds * 100)}% equity</span>
        </span>
      )}
    </div>
  );
}

function ToggleRow({ title, sub, on, set }: { title: string; sub: string; on: boolean; set: (v: boolean) => void }) {
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

function SessionStat({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div>
      <dt className="text-ash-500">{label}</dt>
      <dd className={`tabular mt-0.5 font-display text-lg font-bold ${hot ? "molten-text" : "text-bone"}`}>{value}</dd>
    </div>
  );
}

function MatchResultSheet({
  bot,
  result,
  onRematch,
  onNext,
  onReview,
}: {
  bot: BotProfile;
  result: MatchResult;
  onRematch: () => void;
  onNext: (id: string) => void;
  onReview: () => void;
}) {
  const delta = result.after - result.before;
  const nextBot = ROSTER[ROSTER.findIndex((b) => b.id === bot.id) + 1];
  const title = result.result === "win" ? "You win!" : result.result === "draw" ? "Draw" : `${bot.name} wins`;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-end bg-ash-950/70 backdrop-blur-sm sm:place-items-center"
      role="dialog"
      aria-modal
      aria-label="Match result"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 24, stiffness: 260 }}
        className="panel w-full rounded-t-[32px] p-6 pb-[calc(env(safe-area-inset-bottom)+24px)] text-center sm:max-w-sm sm:rounded-[32px] sm:pb-6"
      >
        <div className="mx-auto flex w-fit items-center gap-3">
          <BotAvatar bot={bot} size={64} ring={result.result === "loss"} dim={result.result === "win"} />
        </div>
        {result.result === "win" && <IconTrophy className="mx-auto mt-3 h-8 w-8 text-ember-300 drop-shadow-[0_0_12px_rgba(255,194,75,0.8)]" />}
        <h2 className={`mt-3 font-display text-3xl font-black ${result.result === "win" ? "molten-text" : "text-bone"}`}>{title}</h2>
        <p className="mt-1 text-sm text-ash-400">
          {result.hands} hand{result.hands === 1 ? "" : "s"} played
        </p>
        <div className="mx-auto mt-5 flex w-fit items-baseline gap-2 rounded-2xl bg-ash-950/60 px-5 py-3 ring-1 ring-ash-700">
          <span className="text-xs font-bold uppercase tracking-wider text-ash-500">Poker rating</span>
          <span className="tabular font-display text-2xl font-bold">{result.after}</span>
          <span className={`tabular text-sm font-bold ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-ember-400" : "text-ash-400"}`}>
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        </div>
        {result.unlocked && (
          <p className="mt-4 text-sm font-semibold text-ember-200">
            Unlocked: <span className="font-bold">{result.unlocked.name}</span> ({result.unlocked.rating})
          </p>
        )}
        <div className="mt-6 grid gap-2">
          {result.result === "win" && nextBot ? (
            <button onClick={() => onNext(nextBot.id)} className="btn-fire h-12 rounded-2xl font-bold">
              Challenge {nextBot.name}
            </button>
          ) : (
            <button onClick={onRematch} className="btn-fire h-12 rounded-2xl font-bold">
              Rematch
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            {result.result === "win" && nextBot && (
              <button onClick={onRematch} className="btn-ash h-11 rounded-2xl text-sm font-bold">
                Rematch
              </button>
            )}
            <button onClick={onReview} className={`btn-ash h-11 rounded-2xl text-sm font-bold ${result.result === "win" && nextBot ? "" : "col-span-2"}`}>
              Review hands
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ 2D fallback */

const FLAT_POS: Record<number, string> = {
  0: "left-1/2 bottom-[6%]",
  1: "left-[23%] bottom-[30%]",
  2: "left-[23%] top-[20%]",
  3: "left-1/2 top-[9%]",
  4: "left-[77%] top-[20%]",
  5: "left-[77%] bottom-[30%]",
};

/** The table without WebGL: an oval of felt, the board in the middle, seats around it. */
function FlatPokerTable({
  game,
  revealed,
  labels,
  place,
}: {
  game: PokerState;
  revealed: ReadonlySet<number>;
  labels: Record<string, React.ReactNode>;
  place?: (i: number) => number;
}) {
  const P = place ?? ((i: number) => i);
  return (
    <div className="felt relative h-[min(58dvh,460px)] overflow-hidden rounded-[28px] sm:h-[520px] sm:rounded-[44px]">
      <div className="absolute inset-[9%] rounded-[50%] ring-2 ring-ember-700/40" />
      <div className="absolute left-1/2 top-[44%] flex -translate-x-1/2 -translate-y-1/2 gap-1.5">
        {game.board.map((c, i) => (
          <MiniFace key={`${game.handNo}-${i}`} card={c} />
        ))}
      </div>
      {labels.pot && <div className="absolute left-1/2 top-[60%] -translate-x-1/2 -translate-y-1/2">{labels.pot}</div>}
      {game.seats.map((s) => {
        const pos = P(s.id);
        const showCards = s.hole.length === 2 && !s.folded && (s.isHero || revealed.has(s.id));
        return (
          // a zero-size anchor: the name tag centres itself on it, the cards sit above/below
          <div key={s.id} className={`absolute h-0 w-0 ${FLAT_POS[pos]}`}>
            {s.hole.length === 2 && !s.folded && (
              <div className={`absolute left-0 flex -translate-x-1/2 gap-0.5 ${pos === 0 ? "bottom-10" : "top-9"}`}>
                {s.hole.map((c, i) => (showCards ? <MiniFace key={i} card={c} /> : <span key={i} className="h-10 w-7 rounded-md bg-gradient-to-b from-ember-600 to-ember-900 ring-1 ring-ember-300/30" />))}
              </div>
            )}
            <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2">{labels[`seat${pos}`]}</div>
          </div>
        );
      })}
    </div>
  );
}

function MiniFace({ card }: { card: string }) {
  const red = card[1] === "H" || card[1] === "D";
  return (
    <span className={`grid h-12 w-9 place-items-center rounded-md bg-[#f6ecdf] font-display text-sm font-bold leading-none shadow-lg sm:h-16 sm:w-12 sm:text-base ${red ? "text-ember-600" : "text-ash-950"}`}>
      {cardLabel(card as Parameters<typeof cardLabel>[0])}
    </span>
  );
}
