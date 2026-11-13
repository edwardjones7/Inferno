"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RoundView } from "@/lib/blackjack/engine";
import type { Timing } from "../timing";
import { CameraRig } from "./camera";
import { Card3D } from "./cards";
import { Stakes, ChipTray } from "./chips";
import { Effects } from "./effects";
import { Environment } from "./environment";
import { SceneFxContext, type SceneFx } from "./fx-context";
import { describe, LabelProjector, Labels } from "./labels";
import { handX, labelAnchors, layoutCards } from "./table-layout";
import { ActiveRing, Shoe, TableBody } from "./table-body";
import { ShaderWarmup } from "./warmup";

export interface Table3DProps {
  view: RoundView | null;
  roundId: string | null;
  timing: Timing;
  /** bumps every time a new server response is applied; card delays are relative to it */
  epoch: number;
  revealed: boolean;
  pendingBetUsd: number;
  toUsd: (units: number) => number;
  fx: Omit<SceneFx, "reducedMotion">;
}


function Scene(props: Table3DProps & { labelEls: React.RefObject<Map<string, HTMLDivElement>> }) {
  const { view, roundId, timing, epoch, revealed, pendingBetUsd, toUsd, labelEls } = props;
  const slots = view && roundId ? layoutCards(view, roundId) : [];
  const shown = view?.phase === "settled" && revealed;

  return (
    <>
      <Environment />
      <TableBody />
      <Shoe />
      <ChipTray />
      <ShaderWarmup />

      {slots.map((s) => {
        const hand = s.hand >= 0 ? view!.hands[s.hand] : null;
        const lost = !!(shown && hand && (hand.result === "lose" || hand.result === "surrender"));
        return (
          <Card3D
            key={s.key}
            slot={s}
            epoch={epoch}
            delay={timing.delays[s.delayKey] ?? 0}
            flipDelay={s.hole ? timing.flip : 0}
            flipDuration={s.hole ? timing.flipDuration : 0.42}
            dim={lost}
            burn={lost}
            highlight={shown && hand?.result === "blackjack" ? "blackjack" : null}
          />
        );
      })}

      <Stakes view={view} roundId={roundId} revealed={revealed} pendingBetUsd={pendingBetUsd} toUsd={toUsd} />
      {view && view.hands.length > 1 && view.phase === "player" && <ActiveRing x={handX(view.active, view.hands.length)} />}

      <LabelProjector anchors={labelAnchors(view)} els={labelEls} />
      <CameraRig />
      <Effects />
    </>
  );
}

/**
 * Compiles every material in the scene in parallel (KHR_parallel_shader_compile) before
 * the first frame is drawn. Without it the first render compiles ~40 programs
 * synchronously and the page freezes for most of a second when the table opens.
 */
function Precompile({ onReady }: { onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    let cancelled = false;
    const finish = () => !cancelled && onReady();
    // Shadow-map and post-processing programs aren't covered by compileAsync; render two
    // frames while the canvas is still invisible so they compile behind the placeholder
    // (whose pulse runs on the compositor and keeps animating), then reveal the table.
    const warm = () => {
      if (cancelled) return;
      // With frameloop "never", advance(t) *sets* clock.elapsedTime to t, so keep t near 0;
      // passing wall-clock time made card birth times land far in the future (cards vanished).
      advance(0);
      requestAnimationFrame(() => {
        if (cancelled) return;
        advance(1 / 60);
        requestAnimationFrame(finish);
      });
    };
    // let the scene graph mount first, then compile everything that will be drawn
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

export default function Table3D(props: Table3DProps) {
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
  useEffect(() => {
    let live = true;
    document.fonts.ready.then(() => live && setFontsReady(true));
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    queueMicrotask(sync);
    mq.addEventListener("change", sync);
    return () => {
      live = false;
      mq.removeEventListener("change", sync);
    };
  }, []);

  const fx = useMemo<SceneFx>(() => ({ ...props.fx, reducedMotion }), [props.fx, reducedMotion]);
  const [live, setLive] = useState(false);
  const markLive = useCallback(() => setLive(true), []);

  return (
    <div className="relative h-[420px] overflow-hidden rounded-[28px] ring-1 ring-ember-500/25 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9),0_0_60px_-20px_rgba(255,90,31,0.35)] sm:h-[540px] sm:rounded-[44px]">
      {/* felt placeholder stays underneath until the scene has compiled, then the canvas fades in */}
      <div className={`felt absolute inset-0 transition-opacity duration-500 ${live ? "opacity-0" : "animate-pulse opacity-100"}`} />
      {fontsReady && (
        <Canvas
          frameloop={live ? "always" : "never"}
          className={`transition-opacity duration-500 ${live ? "opacity-100" : "opacity-0"}`}
          shadows="percentage"
          dpr={[1, 1.5]}
          camera={{ position: [0, 5.0, 5.25], fov: 36, near: 0.1, far: 60 }}
          gl={{ antialias: false, powerPreference: "high-performance" }}
          aria-label="3D blackjack table"
          // Shader error checks call getProgramInfoLog, which forces every compile to finish
          // synchronously (~250 ms of main-thread stall on first open). Dev only.
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
        <Labels view={props.view} revealed={props.revealed} pendingBetUsd={props.pendingBetUsd} toUsd={props.toUsd} register={register} />
      </div>
      <p className="sr-only" aria-live="polite">
        {describe(props.view)}
      </p>
    </div>
  );
}
