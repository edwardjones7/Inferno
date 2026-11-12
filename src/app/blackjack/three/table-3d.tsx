"use client";

import { Canvas } from "@react-three/fiber";
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

  return (
    <div className="relative h-[420px] overflow-hidden rounded-[28px] ring-1 ring-ember-500/25 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9),0_0_60px_-20px_rgba(255,90,31,0.35)] sm:h-[540px] sm:rounded-[44px]">
      {fontsReady ? (
        <Canvas
          shadows="percentage"
          dpr={[1, 1.5]}
          camera={{ position: [0, 5.0, 5.25], fov: 36, near: 0.1, far: 60 }}
          gl={{ antialias: false, powerPreference: "high-performance" }}
          aria-label="3D blackjack table"
        >
          <SceneFxContext.Provider value={fx}>
            <Scene {...props} labelEls={labelEls} />
          </SceneFxContext.Provider>
        </Canvas>
      ) : (
        <div className="felt h-full w-full animate-pulse" />
      )}
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        <Labels view={props.view} revealed={props.revealed} pendingBetUsd={props.pendingBetUsd} toUsd={props.toUsd} register={register} />
      </div>
      <p className="sr-only" aria-live="polite">
        {describe(props.view)}
      </p>
    </div>
  );
}
