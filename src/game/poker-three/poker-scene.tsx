"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useGameInsets } from "@/components/game-screen";
import { stepSpring, type Spring } from "@/game/three/camera-spring";
import { Card3D } from "@/game/three/cards";
import { Effects } from "@/game/three/effects";
import { Environment } from "@/game/three/environment";
import { SceneFxContext, useSceneFx, type SceneFx } from "@/game/three/fx-context";
import { LabelProjector } from "@/game/three/labels";
import type { Anchors, CardSlot } from "@/game/three/table-layout";
import { ShaderWarmup } from "@/game/three/warmup";
import type { Card } from "@/lib/blackjack/cards";
import type { PokerState } from "@/lib/poker/game-types";
import type { BotProfile } from "@/lib/poker/roster";
import { BotFigure } from "@/game/characters/bot-figure";
import type { BotMood } from "./bot-presence";
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
  fx: Omit<SceneFx, "reducedMotion" | "quality">;
  /** graphics tier, see lib/settings.ts */
  quality?: "high" | "low";
  /** overlay content for each label anchor id (seat0..5, pot), keyed by table position */
  labels: Record<string, React.ReactNode>;
  /** table position (0..5) for a seat id; heads-up maps seat 1 across the table */
  place?: (seatId: number) => number;
  /** fill the parent (full-screen game) instead of the framed card */
  fill?: boolean;
  /** "hand" leans the camera in over your cards while it's your decision */
  focus?: "table" | "hand";
  /** the bots seated at the table, with what they're doing */
  bots?: { seat: number; bot: BotProfile; mood: BotMood; actKey: number }[];
  /** chips you're about to bet, shown on your bet spot while sizing a raise */
  preview?: number;
  /** extra label anchors (world space) for overlay content in `labels` */
  anchors?: Anchors;
}

const identity = (i: number) => i;

export const holeKey = (handNo: number, seat: number, i: number) => `${handNo}:h${seat}:${i}`;
export const boardKey = (handNo: number, i: number) => `${handNo}:b${i}`;

function slotsFor(game: PokerState, revealed: ReadonlySet<number>, P: (i: number) => number): CardSlot[] {
  const slots: CardSlot[] = [];
  for (const s of game.seats) {
    if (s.hole.length !== 2 || s.folded) continue;
    const c = holePos(P(s.id));
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
  // beside the pot chips, leaving the space above your cards for the coach
  a.pot = [POT_POS.x - 1.0, 0.05, POT_POS.z];
  return a;
}
const ANCHORS = labelAnchors();

/**
 * The view from your chair: behind your cards, looking across the felt at the board and the
 * other players. The distance is fitted to the screen (a tall phone sits higher and further
 * back so the board still fits), the image is centred between the HUD and the controls, and
 * the camera leans in over your cards while it's your decision.
 */
function PokerCamera({ focus, span, insets }: { focus: "table" | "hand"; span: number; insets: { top: number; bottom: number } }) {
  const fx = useSceneFx();
  const lean = useRef<Spring>({ x: 0, v: 0 });
  const shift = useRef<Spring>({ x: 0, v: 0 });
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, delta) => {
    const cam = state.camera as THREE.PerspectiveCamera;
    const dt = Math.min(delta, 0.1);
    const { width, height } = state.size;
    const usable = Math.max(120, height - insets.top - insets.bottom);
    const aspect = width / usable;
    const portrait = aspect < 1.15;
    const fov = portrait ? 54 : 44;
    // phones sit a little lower so the hanging lamp clears the line to the far seats
    const elev = THREE.MathUtils.degToRad(portrait ? 35 : 36);
    const half = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const dist = Math.max(portrait ? 6.4 : 6.6, span / (half * aspect));
    const still = fx.reducedMotion;
    const step = (sp: Spring, target: number, omega: number) => {
      if (still) {
        sp.x = target;
        sp.v = 0;
      } else stepSpring(sp, target, omega, dt);
      return sp.x;
    };
    const t = THREE.MathUtils.clamp(step(lean.current, focus === "hand" ? 1 : 0, 5), 0, 1);
    const px = step(shift.current, (insets.bottom - insets.top) / 2, 10);

    // lean: a little closer and lower, looking slightly nearer (your cards and the board)
    const d = dist * (1 - 0.12 * t);
    const e = elev - THREE.MathUtils.degToRad(5) * t;
    look.set(0, 0, (portrait ? 0.05 : -0.25) + 0.25 * t);
    cam.position.set(0, look.y + Math.sin(e) * d, look.z + Math.cos(e) * d);
    cam.lookAt(look);
    cam.fov = fov;
    if (height > usable) cam.fov = THREE.MathUtils.radToDeg(Math.atan(half * (height / usable)) * 2);
    cam.updateProjectionMatrix();
    if (px !== 0) {
      cam.projectionMatrix.elements[9] -= (2 * px) / height;
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    }
  });
  return null;
}

/** Half-width of what must be in frame: the board heads-up, the whole table at 6-max. */
const spanFor = (seats: number, portrait: boolean) => (seats <= 2 ? 2.1 : portrait ? 2.6 : 4.4);

function FramedCamera({ focus, seats, insets }: { focus: "table" | "hand"; seats: number; insets: { top: number; bottom: number } }) {
  const size = useThree((st) => st.size);
  const portrait = size.width / Math.max(1, size.height - insets.top - insets.bottom) < 1.15;
  return <PokerCamera focus={focus} span={spanFor(seats, portrait)} insets={insets} />;
}

/** The original fixed camera, for the framed (non full-screen) table. */
function ClassicCamera() {
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

const PREVIEW_POS = new THREE.Vector3(0.55, 0, 1.08);
const NO_INSETS = { top: 0, bottom: 0 };

function Scene({
  game,
  epoch,
  delays,
  revealed,
  labelEls,
  place,
  focus,
  bots,
  preview,
  anchors,
  insets,
  fill,
}: PokerSceneProps & { labelEls: React.RefObject<Map<string, HTMLDivElement>>; insets: { top: number; bottom: number } }) {
  const P = place ?? identity;
  const slots = slotsFor(game, revealed, P);
  const done = game.street === "done";
  const inMiddle = game.pot - game.seats.reduce((n, s) => n + s.committed, 0);

  return (
    <>
      <Environment />
      <PokerTableBody />
      <ShaderWarmup />
      <DealerButton to={buttonPos(P(game.button))} />

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
            <ChipPile key={`${game.handNo}:${game.street}:bet${s.id}`} amount={s.committed} to={betPos(P(s.id))} from={holePos(P(s.id))} />
          ) : null,
        )}
      {/* the pot, or the winnings sliding to each winner */}
      {!done && inMiddle > 0 && <ChipPile key={`${game.handNo}:pot`} amount={inMiddle} to={POT_POS} />}
      {done &&
        game.winners.map((w) => <ChipPile key={`${game.handNo}:win${w.seat}:${w.pot}`} amount={w.amount} to={betPos(P(w.seat))} from={POT_POS} />)}

      {/* the raise you're sizing, slid out in front of you before you commit it */}
      {!done && preview && preview > 0 ? (
        <ChipPile key={`${game.handNo}:${game.street}:preview`} amount={preview} to={PREVIEW_POS} from={holePos(0)} />
      ) : null}

      {bots?.map((b) => <BotFigure key={b.seat} bot={b.bot} place={P(b.seat)} mood={b.mood} actKey={b.actKey} />)}

      <LabelProjector
        anchors={anchors ? { ...ANCHORS, ...anchors } : ANCHORS}
        els={labelEls}
        clamp={fill ? { x: 8, top: insets.top + 28, bottom: insets.bottom + 28 } : undefined}
      />
      {fill ? <FramedCamera focus={focus ?? "table"} seats={game.seats.length} insets={insets} /> : <ClassicCamera />}
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
  const insets = useGameInsets();
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
  const fx = useMemo<SceneFx>(() => ({ ...props.fx, reducedMotion, quality: props.quality ?? "high" }), [props.fx, reducedMotion, props.quality]);

  return (
    <div
      className={
        props.fill
          ? "absolute inset-0 overflow-hidden"
          : "relative h-[min(58dvh,460px)] overflow-hidden rounded-[28px] ring-1 ring-ember-500/25 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9),0_0_60px_-20px_rgba(255,90,31,0.35)] sm:h-[560px] sm:rounded-[44px]"
      }
    >
      <div className={`felt absolute inset-0 transition-opacity duration-500 ${live ? "opacity-0" : "animate-pulse opacity-100"}`} />
      {fontsReady && (
        <Canvas
          frameloop={live ? "always" : "never"}
          className={`transition-opacity duration-500 ${live ? "opacity-100" : "opacity-0"}`}
          shadows={props.quality === "low" ? "basic" : "percentage"}
          dpr={props.quality === "low" ? [1, 1.5] : [1, 2]}
          camera={{ position: [0, 7.0, 7.5], fov: 42, near: 0.1, far: 60 }}
          gl={{ antialias: props.quality === "low", powerPreference: "high-performance" }}
          aria-label="3D poker table"
          onCreated={({ gl }) => {
            gl.debug.checkShaderErrors = process.env.NODE_ENV !== "production";
          }}
        >
          <Precompile onReady={markLive} />
          <SceneFxContext.Provider value={fx}>
            <Scene {...props} labelEls={labelEls} insets={props.fill ? insets : NO_INSETS} />
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
