"use client";

import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameScreen } from "@/components/game-screen";
import { IconStep } from "@/components/icons";
import type { BotMood } from "@/game/poker-three/bot-presence";
import { boardKey, holeKey } from "@/game/poker-three/poker-scene";
import { replayFrames, type ReplayFrame } from "@/lib/poker/replay";
import { botById, type BotProfile } from "@/lib/poker/roster";
import { youText } from "@/lib/poker/text";
import { resolveQuality, useGraphics } from "@/lib/settings";
import { play } from "@/lib/sound";
import type { PokerHandRecord } from "@/lib/store";

const PokerScene = dynamic(() => import("@/game/poker-three/poker-scene"), {
  ssr: false,
  loading: () => <div className="felt absolute inset-0 animate-pulse" />,
});

const STEP_MS = 1300;
const HEADS_UP_PLACE = (i: number) => (i === 0 ? 0 : 3);

/** Seconds after a step at which each newly visible card leaves the deck. */
function delaysFor(prev: ReplayFrame | null, next: ReplayFrame): Record<string, number> {
  const d: Record<string, number> = {};
  const g = next.state;
  if (!prev) {
    g.seats.forEach((s, k) => {
      d[holeKey(g.handNo, s.id, 0)] = k * 0.09;
      d[holeKey(g.handNo, s.id, 1)] = (g.seats.length + k) * 0.09;
    });
    return d;
  }
  for (let i = prev.state.board.length; i < g.board.length; i++) d[boardKey(g.handNo, i)] = 0.15 + (i - prev.state.board.length) * 0.16;
  return d;
}

/**
 * Replays a saved poker hand on the 3D table, one action at a time, with the coach's note
 * shown on the felt at each of your decisions. Opens as a full-screen overlay.
 */
export function PokerReplay3D({ hand, onClose }: { hand: PokerHandRecord; onClose: () => void }) {
  const frames = useMemo(() => replayFrames(hand), [hand]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [epoch, setEpoch] = useState(0);
  const [delays, setDelays] = useState<Record<string, number>>(() => delaysFor(null, frames[0]));
  const prevIndex = useRef(0);
  const [graphics] = useGraphics();
  const quality = resolveQuality(graphics);
  const frame = frames[i];
  const g = frame.state;

  const go = useCallback(
    (n: number) => {
      const next = Math.max(0, Math.min(frames.length - 1, n));
      if (next === prevIndex.current) return;
      // stepping backwards re-deals from scratch so cards don't fly back into the deck
      const back = next < prevIndex.current;
      setDelays(delaysFor(back ? null : frames[prevIndex.current], frames[next]));
      if (back) setEpoch((e) => e + 1000);
      setEpoch((e) => e + 1);
      prevIndex.current = next;
      setI(next);
      const ev = frames[next].event;
      if (ev?.kind === "board") play("card", 0.15);
      else if (ev && /calls|bets|raises|blind/.test(ev.text)) play("chip");
      else if (ev?.kind === "win") play("win");
    },
    [frames],
  );

  // autoplay; pauses at each of your decisions that has a coach note
  useEffect(() => {
    if (!playing) return;
    if (i >= frames.length - 1) {
      queueMicrotask(() => setPlaying(false));
      return;
    }
    const t = setTimeout(() => {
      go(i + 1);
      if (frames[i + 1].note) setPlaying(false);
    }, frame.note ? STEP_MS * 2 : STEP_MS);
    return () => clearTimeout(t);
  }, [playing, i, frames, frame.note, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(prevIndex.current + 1);
      else if (e.key === "ArrowLeft") go(prevIndex.current - 1);
      else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  const bots: BotProfile[] = hand.bots.map((id) => botById(id)).filter((b): b is BotProfile => !!b);
  const place = hand.names.length === 2 ? HEADS_UP_PLACE : undefined;
  const revealed = useMemo(() => new Set(frame.revealed), [frame.revealed]);

  const labels: Record<string, React.ReactNode> = {};
  const anchors: Record<string, [number, number, number]> = {};
  for (const s of g.seats) {
    const actingNow = frame.event?.seat === s.id;
    const win = g.street === "done" ? g.winners.filter((w) => w.seat === s.id) : [];
    labels[`seat${place ? place(s.id) : s.id}`] = (
      <div
        className={`w-max rounded-2xl px-3 py-1 text-[11px] leading-tight ring-1 ${
          actingNow ? "bg-ash-950/90 ring-ember-400 shadow-[0_0_24px_-4px_rgba(255,122,31,0.9)]" : s.folded ? "bg-ash-950/60 opacity-60 ring-ash-800" : "bg-ash-950/85 ring-ash-700"
        }`}
      >
        <span className={`block font-bold ${s.isHero ? "text-ember-200" : "text-bone"}`}>{s.isHero ? "You" : s.name}</span>
        {win.length > 0 ? (
          <span className="mt-0.5 inline-block rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-ash-950">+{win.reduce((n, w) => n + w.amount, 0)}</span>
        ) : s.lastAction ? (
          <span className="text-ash-300">{s.lastAction}</span>
        ) : null}
      </div>
    );
  }
  if (g.pot > 0 && g.street !== "done") labels.pot = <div className="w-max rounded-full bg-ash-950/85 px-3 py-1 text-xs font-bold text-ember-200 ring-1 ring-ember-500/40">Pot {g.pot}</div>;
  if (frame.note) {
    labels.coach = (
      <motion.div
        key={i}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`w-[min(80vw,320px)] whitespace-normal rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug ring-1 backdrop-blur-md ${
          frame.note.ok === false ? "bg-ash-950/90 text-ember-50 ring-ember-400/60" : frame.note.ok ? "bg-emerald-950/85 text-emerald-100 ring-emerald-400/40" : "bg-ash-950/85 text-ash-100 ring-ash-600/70"
        }`}
      >
        <span className="font-bold">{frame.note.title}</span> <span className="opacity-80">{frame.note.detail}</span>
      </motion.div>
    );
    anchors.coach = [0, 0.05, 1.02];
  }

  const botSeats = bots.map((b, k) => {
    const s = g.seats[k + 1];
    if (!s) return null;
    const won = g.street === "done" && g.winners.some((w) => w.seat === s.id);
    const mood: BotMood = won ? "won" : s.folded ? "folded" : frame.event?.seat === s.id && /bets|raises/.test(frame.event.text) ? "aggressive" : "idle";
    return { seat: s.id, bot: b, mood, actKey: frame.event?.seat === s.id ? i : 0 };
  });

  const caption = frame.event ? youText(frame.event.text) : `Hand #${hand.handNo}`;

  return (
    <div className="fixed inset-0 z-50 bg-ash-950" role="dialog" aria-modal="true" aria-label="Hand replay">
      <GameScreen
        title={`Replay of hand #${hand.handNo}`}
        onBack={onClose}
        drawerOpen={false}
        onDrawerChange={() => {}}
        hud={
          <span className="rounded-xl bg-sky-500/15 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-sky-200 ring-1 ring-sky-400/40 backdrop-blur-md">
            Replay · hand #{hand.handNo}
          </span>
        }
        bottom={
          <div className="flex flex-col gap-2.5 pb-1">
            <p className="min-h-10 text-center text-sm text-ash-100" aria-live="polite">
              <span className="mr-2 text-[10px] font-bold uppercase tracking-[0.18em] text-ash-500">{g.street === "done" ? "Result" : g.street}</span>
              {caption}
            </p>
            <input
              type="range"
              aria-label="Replay position"
              min={0}
              max={frames.length - 1}
              value={i}
              onChange={(e) => {
                setPlaying(false);
                go(Number(e.target.value));
              }}
              className="h-2 w-full accent-sky-400"
            />
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => (setPlaying(false), go(0))} aria-label="First" className="btn-ash grid h-11 w-11 place-items-center rounded-xl">
                <IconStep dir="first" className="h-4 w-4" />
              </button>
              <button onClick={() => (setPlaying(false), go(i - 1))} aria-label="Previous action" className="btn-ash grid h-11 w-11 place-items-center rounded-xl">
                <IconStep dir="prev" className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  if (i >= frames.length - 1) go(0);
                  setPlaying((p) => !p || i >= frames.length - 1);
                }}
                className="btn-fire h-11 min-w-28 rounded-xl px-5 text-sm font-bold"
              >
                {playing ? "Pause" : i >= frames.length - 1 ? "Replay" : "Play"}
              </button>
              <button onClick={() => (setPlaying(false), go(i + 1))} aria-label="Next action" className="btn-ash grid h-11 w-11 place-items-center rounded-xl">
                <IconStep dir="next" className="h-4 w-4" />
              </button>
              <button onClick={() => (setPlaying(false), go(frames.length - 1))} aria-label="Last" className="btn-ash grid h-11 w-11 place-items-center rounded-xl">
                <IconStep dir="last" className="h-4 w-4" />
              </button>
            </div>
          </div>
        }
      >
        <PokerScene
          fill
          game={{ ...g, toAct: null }}
          epoch={epoch}
          delays={delays}
          revealed={revealed}
          fx={{ heat: 0, drama: false, blackjackKey: 0, winKey: 0, loseKey: 0 }}
          labels={labels}
          anchors={anchors}
          place={place}
          quality={quality}
          focus={frame.note ? "hand" : "table"}
          bots={botSeats.filter((b): b is NonNullable<typeof b> => !!b)}
        />
      </GameScreen>
    </div>
  );
}
