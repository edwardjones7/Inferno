"use client";

import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { TABLE } from "@/game/three/canvas-utils";
import { dealerFor, type DealerEvent } from "@/lib/blackjack/dealers";
import type { RoundView } from "@/lib/blackjack/engine";
import type { TableId } from "@/lib/blackjack/tables";
import { Figure, type PoseName } from "./figure";
import { DEALER_LOOKS, type Face } from "./looks";

/**
 * The blackjack dealer standing behind the table: deals with a sweep of the arm as cards
 * come out, then reacts to how the round ends (claps your blackjack, winces at a bust) and
 * says a line in a small speech bubble. Everything is derived from the round view, so the
 * table only has to mount it.
 */

// The pendant lamp hangs over the middle of the table and the chip tray fills the centre of
// the dealer's side, with the shoe on the right. On a wide screen the dealer stands at the
// open left end of the tray; a phone's portrait camera can't see that far out, so there the
// dealer stands behind the left half of the tray, head and shoulders above the chips, left of
// the lamp. Low enough either way that the camera keeps their face in frame.
const SPOT = {
  wide: { pos: [-2.55, -0.68, -TABLE.halfDepth - 0.3] as [number, number, number], yaw: 0.38, bubble: [0.5, 1.95, 0] as [number, number, number] },
  // the bubble sits lower here so the top bar doesn't cover it
  narrow: { pos: [-1.45, -0.45, -TABLE.halfDepth - 0.45] as [number, number, number], yaw: 0.16, bubble: [0.55, 1.4, 0] as [number, number, number] },
};
const SCALE = 1.05;
const SAY_MS = 3200;

/** What happened, from the dealer's side, once a round is settled. */
export function settledEvent(v: RoundView): DealerEvent {
  const hands = v.hands;
  if (hands.some((h) => h.result === "blackjack")) return "playerBlackjack";
  if (v.dealerBlackjack) return "dealerBlackjack";
  if (hands.length && hands.every((h) => h.total > 21)) return "playerBust";
  if ((v.dealerTotal?.total ?? 0) > 21) return "dealerBust";
  if (hands.some((h) => h.result === "win")) return "playerWin";
  if (hands.length && hands.every((h) => h.result === "push")) return "push";
  return "dealerWin";
}

const REACTION: Record<DealerEvent, { pose: PoseName; face: (rest: Face) => Face }> = {
  greet: { pose: "shrug", face: (r) => ({ ...r, smile: Math.max(r.smile, 0.5), brow: 0.3 }) },
  playerBlackjack: { pose: "clap", face: () => ({ smile: 0.95, open: 0.5, brow: 0.5, lid: 0 }) },
  playerWin: { pose: "stand", face: (r) => ({ ...r, smile: Math.max(0.4, r.smile), brow: 0.2 }) },
  playerBust: { pose: "stand", face: (r) => ({ ...r, smile: -0.25, brow: 0.35 }) },
  dealerBust: { pose: "shrug", face: () => ({ smile: -0.4, open: 0.3, brow: 0.55, lid: 0 }) },
  dealerBlackjack: { pose: "shrug", face: (r) => ({ ...r, smile: 0.2, brow: 0.3 }) },
  push: { pose: "shrug", face: (r) => ({ ...r, smile: 0.1, brow: 0.2 }) },
  dealerWin: { pose: "stand", face: (r) => ({ ...r, smile: r.smile * 0.6 }) },
};

const pick = (xs: string[]) => xs[Math.floor(Math.random() * xs.length)];

export function DealerFigure({
  view,
  roundId,
  tableId,
  revealed = true,
}: {
  view: RoundView | null;
  roundId: string | null;
  tableId: TableId;
  /** the table has finished revealing the settled round (react only after that) */
  revealed?: boolean;
}) {
  const narrow = useThree((s) => s.size.width / s.size.height < 0.9);
  const spot = narrow ? SPOT.narrow : SPOT.wide;
  const profile = dealerFor(tableId);
  const look = DEALER_LOOKS[profile.id] ?? DEALER_LOOKS.vesper;
  const [event, setEvent] = useState<DealerEvent | null>(null);
  const [line, setLine] = useState<{ text: string; key: number } | null>(null);
  const [dealing, setDealing] = useState(0);
  const [kick, setKick] = useState(0);
  const seen = useRef({ cards: 0, settled: "" });

  // greet once when the table opens
  useEffect(() => {
    const t = setTimeout(() => {
      setEvent("greet");
      setLine({ text: pick(profile.lines.greet), key: Date.now() });
    }, 900);
    return () => clearTimeout(t);
  }, [profile]);

  // deal gesture whenever new cards appear; reaction + line when the round settles
  useEffect(() => {
    if (!view) return;
    const cards = view.dealer.length + view.hands.reduce((n, h) => n + h.cards.length, 0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (cards > seen.current.cards) {
      timers.push(
        setTimeout(() => {
          setKick((k) => k + 1);
          setDealing(Date.now());
          setEvent(null);
        }, 0),
      );
    }
    seen.current.cards = cards;
    const settledKey = view.phase === "settled" && revealed ? `${roundId}` : "";
    if (settledKey && settledKey !== seen.current.settled) {
      seen.current.settled = settledKey;
      const ev = settledEvent(view);
      // let the last cards land before reacting
      timers.push(
        setTimeout(() => {
          setEvent(ev);
          setLine({ text: pick(profile.lines[ev]), key: Date.now() });
        }, 500),
      );
    }
    if (view.phase !== "settled" && seen.current.settled && cards <= 4) {
      // a new round started
      seen.current.settled = "";
    }
    return () => timers.forEach(clearTimeout);
  }, [view, roundId, profile, revealed]);

  // the deal pose only lasts a moment
  useEffect(() => {
    if (!dealing) return;
    const t = setTimeout(() => setDealing(0), 450);
    return () => clearTimeout(t);
  }, [dealing]);

  // speech bubbles fade on their own
  useEffect(() => {
    if (!line) return;
    const t = setTimeout(() => setLine(null), SAY_MS);
    return () => clearTimeout(t);
  }, [line]);

  const reaction = event ? REACTION[event] : null;
  const pose: PoseName = dealing ? "deal" : (reaction?.pose ?? "stand");
  const face = reaction ? reaction.face(look.temper.rest) : look.temper.rest;

  return (
    <group position={spot.pos} rotation-y={spot.yaw} scale={SCALE}>
      <Figure look={look} pose={pose} face={face} stance="standing" kick={kick} phase={0.4} />
      {line && (
        <Html position={spot.bubble} center={false} zIndexRange={[20, 0]} pointerEvents="none">
          {/* opens downward beside the face, so it stays on screen when the head is near the top edge */}
          <div className="pointer-events-none">
            <div
              key={line.key}
              className="w-max max-w-[220px] animate-rise rounded-2xl rounded-tl-sm bg-ash-950/90 px-3 py-2 text-[12px] font-semibold leading-snug text-bone shadow-lg ring-1 ring-ember-500/40 backdrop-blur"
            >
              <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-[0.18em] text-ember-400">{profile.name}</span>
              {line.text}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
