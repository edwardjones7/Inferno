"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { buildShoe } from "@/lib/blackjack/cards";
import { CardRig, cardGeometry } from "./card-rig";
import { cardFace, cardFoilMask, isFoil } from "./card-textures";

/** Frames to keep the warm-up meshes alive; long enough for every program to link. */
const WARM_FRAMES = 24;

/**
 * Removes first-deal jank. Without this the GPU compiles the card surface, shadow and
 * ash-particle programs the moment the first card (or first burn) appears, which froze
 * the page for ~150 ms on the first deal and ~80 ms on the first loss.
 *
 * - A throwaway card + its ash points render for a few frames under the table (hidden
 *   by the table body), so every card program compiles while the table is idle.
 * - All 52 card faces are painted and uploaded to the GPU during idle time.
 */
export function ShaderWarmup() {
  const gl = useThree((s) => s.gl);
  const [rig] = useState(() => {
    const r = new CardRig(0.5);
    r.setCard("AS"); // foil path on, so the foil mask is bound too
    return r;
  });
  const [done, setDone] = useState(false);
  const frames = useRef(0);

  useEffect(() => () => rig.dispose(), [rig]);

  useEffect(() => {
    const cards = buildShoe(1);
    let i = 0;
    let cancelled = false;
    const idle: (cb: () => void) => void =
      typeof window.requestIdleCallback === "function" ? (cb) => window.requestIdleCallback(cb, { timeout: 500 }) : (cb) => setTimeout(cb, 16);
    const step = () => {
      if (cancelled) return;
      const t0 = performance.now();
      while (i < cards.length && performance.now() - t0 < 6) {
        const c = cards[i++];
        gl.initTexture(cardFace(c));
        if (isFoil(c)) gl.initTexture(cardFoilMask(c));
      }
      if (i < cards.length) idle(step);
    };
    idle(step);
    return () => {
      cancelled = true;
    };
  }, [gl]);

  useFrame(() => {
    if (!done && ++frames.current > WARM_FRAMES) setDone(true);
  });

  if (done) return null;
  return (
    <group position={[0, -0.9, 0]}>
      <mesh geometry={cardGeometry()} material={rig.materials} customDepthMaterial={rig.depth} rotation-x={-Math.PI / 2} castShadow />
      <points geometry={rig.particleGeometry} material={rig.particles} frustumCulled={false} />
    </group>
  );
}
