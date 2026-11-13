"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as THREE from "three";
import { Card3D } from "@/app/blackjack/three/cards";
import { Effects } from "@/app/blackjack/three/effects";
import { Environment } from "@/app/blackjack/three/environment";
import { SceneFxContext, type SceneFx } from "@/app/blackjack/three/fx-context";
import { LabelProjector } from "@/app/blackjack/three/labels";
import type { Anchors, CardSlot } from "@/app/blackjack/three/table-layout";
import { ShaderWarmup } from "@/app/blackjack/three/warmup";
import type { Card } from "@/lib/blackjack/cards";
import type { PokerState } from "@/lib/poker/game-types";
import { ChipPile } from "./poker-chips";
import { betPos, boardPos, buttonPos, DEAL_ORIGIN, holePos, POT_POS, seatLabelPos } from "./poker-layout";
import { DealerButton, PokerTableBody } from "./poker-table-body";

export interface PokerSceneProps {
  game: PokerState;
  /** bumps whenever the game state changes; card delays are relative to it */
  epoch: number;
  /** seconds-after-epoch at which each newly dealt card leaves the deck */
  delays: Record<string, number>;
  /** bot seats whose hole cards are face up (showdown) */
  revealed: ReadonlySet<number>;
  fx: Omit<SceneFx, "reducedMotion">;
  /** overlay content for each label anchor id (seat0..5, pot) */
  labels: Record<string, React.ReactNode>;
}

export const holeKey = (handNo: number, seat: number, i: number) => `${handNo}:h${seat}:${i}`;
export const boardKey = (handNo: number, i: number) => `${handNo}:b${i}`;

function slotsFor(game: PokerState, revealed: ReadonlySet<number>): CardSlot[] {
  const slots: CardSlot[] = [];
  for (const s of game.seats) {
    if (s.hole.length !== 2 || s.folded) continue;
    const c = holePos(s.id);
    const spread = s.id === 0 ? 0.36 : 0.2;
    s.hole.forEach((card, i) => {
      const shown = s.id === 0 || revealed.has(s.id);
      slots.push({
        key: holeKey(game.handNo, s.id, i),
        delayKey: holeKey(game.handNo, s.id, i),
        card: shown ? (card as Card) : null,
        pos: [c.x + (i === 0 ? -spread : spread), 0.004 + i * 0.004, c.z + (s.id === 0 ? 0 : i * 0.04)],
        hole: s.id !== 0,
        hand: -1,
      });
    });
  }
  game.board.forEach((card, i) => {
    slots.push({ key: boardKey(game.handNo, i), delayKey: boardKey(game.handNo, i), card, pos: boardPos(i), hole: false, hand: -1 });
  });
  return slots;
}

function labelAnchors(): Anchors {
  const a: Anchors = {};
  for (let i = 0; i < 6; i++) {
    const p = seatLabelPos(i);
    a[`seat${i}`] = [p.x, p.y, p.z];
  }
  a.pot = [POT_POS.x, 0.05, POT_POS.z + 0.42];
  return a;
}
const ANCHORS = labelAnchors();

function PokerCamera() {
  useFrame((state) => {
    const cam = state.camera as THREE.PerspectiveCamera;
    const narrow = state.size.width / state.size.height < 1.15;
    const fov = narrow ? 62 : 42;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    if (narrow) cam.position.set(0, 10.2, 7.2);
    else cam.position.set(0, 7.0, 7.5);
    cam.lookAt(0, 0, narrow ? 0.4 : 0.15);
  });
  return null;
}

function Scene({ game, epoch, delays, revealed, labelEls }: PokerSceneProps & { labelEls: React.RefObject<Map<string, HTMLDivElement>> }) {
  const slots = slotsFor(game, revealed);
  const done = game.street === "done";
  const inMiddle = game.pot - game.seats.reduce((n, s) => n + s.committed, 0);

  return (
    <>
      <Environment />
      <PokerTableBody />
      <ShaderWarmup />
      <DealerButton to={buttonPos(game.button)} />

      {slots.map((s) => (
        <Card3D
          key={s.key}
          slot={s}
          from={DEAL_ORIGIN}
          epoch={epoch}
          delay={delays[s.key] ?? 0}
          flipDelay={0.15}
          flipDuration={0.5}
          dim={false}
          burn={false}
          highlight={done && game.winners.some((w) => w.seat === 0 && w.hand) && s.key.includes(":h0:") ? "blackjack" : null}
        />
      ))}

      {/* current-street bets in front of each player */}
      {!done &&
        game.seats.map((s) =>
          s.committed > 0 ? (
            <ChipPile key={`${game.handNo}:${game.street}:bet${s.id}`} amount={s.committed} to={betPos(s.id)} from={holePos(s.id)} />
          ) : null,
        )}
      {/* the pot, or the winnings sliding to each winner */}
      {!done && inMiddle > 0 && <ChipPile key={`${game.handNo}:pot`} amount={inMiddle} to={POT_POS} />}
      {done &&
        game.winners.map((w) => <ChipPile key={`${game.handNo}:win${w.seat}:${w.pot}`} amount={w.amount} to={betPos(w.seat)} from={POT_POS} />)}

      <LabelProjector anchors={ANCHORS} els={labelEls} />
      <PokerCamera />
      <Effects />
    </>
  );
}

/** Compile every program in parallel before the first frame, then fade the table in. */
function Precompile({ onReady }: { onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    let cancelled = false;
    const finish = () => !cancelled && onReady();
    const warm = () => {
      if (cancelled) return;
      advance(0);
      requestAnimationFrame(() => {
        if (cancelled) return;
        advance(1 / 60);
        requestAnimationFrame(finish);
      });
    };
    const raf = requestAnimationFrame(() => {
      gl.compileAsync(scene, camera).then(warm, warm);
    });
    const fallback = setTimeout(finish, 3000);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
  }, [gl, scene, camera, advance, onReady]);
  return null;
}

export default function PokerScene(props: PokerSceneProps) {
  const labelEls = useRef(new Map<string, HTMLDivElement>());
  const register = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) labelEls.current.set(id, el);
      else labelEls.current.delete(id);
    },
    [],
  );
  const [fontsReady, setFontsReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [live, setLive] = useState(false);
  const markLive = useCallback(() => setLive(true), []);
  useEffect(() => {
    let alive = true;
    document.fonts.ready.then(() => alive && setFontsReady(true));
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    queueMicrotask(sync);
    mq.addEventListener("change", sync);
    return () => {
      alive = false;
      mq.removeEventListener("change", sync);
    };
  }, []);
  const fx = useMemo<SceneFx>(() => ({ ...props.fx, reducedMotion }), [props.fx, reducedMotion]);

  return (
    <div className="relative h-[460px] overflow-hidden rounded-[28px] ring-1 ring-ember-500/25 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9),0_0_60px_-20px_rgba(255,90,31,0.35)] sm:h-[560px] sm:rounded-[44px]">
      <div className={`felt absolute inset-0 transition-opacity duration-500 ${live ? "opacity-0" : "animate-pulse opacity-100"}`} />
      {fontsReady && (
        <Canvas
          frameloop={live ? "always" : "never"}
          className={`transition-opacity duration-500 ${live ? "opacity-100" : "opacity-0"}`}
          shadows="percentage"
          dpr={[1, 1.5]}
          camera={{ position: [0, 7.0, 7.5], fov: 42, near: 0.1, far: 60 }}
          gl={{ antialias: false, powerPreference: "high-performance" }}
          aria-label="3D poker table"
          onCreated={({ gl }) => {
            gl.debug.checkShaderErrors = process.env.NODE_ENV !== "production";
          }}
        >
          <Precompile onReady={markLive} />
          <SceneFxContext.Provider value={fx}>
            <Scene {...props} labelEls={labelEls} />
          </SceneFxContext.Provider>
        </Canvas>
      )}
      <div className={`pointer-events-none absolute inset-0 z-10 overflow-hidden transition-opacity duration-500 ${live ? "opacity-100" : "opacity-0"}`}>
        {Object.entries(props.labels).map(([id, node]) => (
          <div key={id} ref={register(id)} className="absolute left-0 top-0 opacity-0 will-change-transform">
            {node}
          </div>
        ))}
      </div>
    </div>
  );
}
