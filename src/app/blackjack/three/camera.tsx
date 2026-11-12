"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type * as THREE from "three";
import { stepSpring, type Spring } from "./camera-spring";
import { useSceneFx } from "./fx-context";

interface Pose {
  pos: [number, number, number];
  look: [number, number, number];
  fov: number;
}

/** Normal framing: the whole table. */
const WIDE: Pose = { pos: [0, 5.0, 5.25], look: [0, 0, 0.25], fov: 36 };
const NARROW: Pose = { pos: [0, 4.7, 3.9], look: [0, 0, 0.15], fov: 50 };

/**
 * Dramatic reveal framing: pushed in on the dealer's hand from a slightly lower angle,
 * with the "BLACKJACK PAYS 3 TO 2" arc (z ~ 0.25) just catching the bottom of frame.
 * Narrow keeps a wider view so a dealer drawing to 4-5 cards still fits.
 */
const WIDE_DRAMA: Pose = { pos: [0, 2.25, 1.75], look: [0, 0, -0.95], fov: 34 };
const NARROW_DRAMA: Pose = { pos: [0, 2.8, 2.15], look: [0, 0, -0.95], fov: 46 };

/** ~0.83s to arrive (1% error), critically damped: no overshoot. */
const OMEGA = 8;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Rock-steady camera. The only motion is the deliberate push-in toward the dealer's
 * cards while fx.drama is true (skipped entirely with reduced motion); it eases back to
 * the exact normal framing afterwards. No pointer parallax, no idle sway.
 */
export function CameraRig() {
  const fx = useSceneFx();
  const blend = useRef<Spring>({ x: 0, v: 0 });

  useFrame((state, delta) => {
    const cam = state.camera as THREE.PerspectiveCamera;
    const narrow = state.size.width / state.size.height < 1.15;
    const base = narrow ? NARROW : WIDE;
    const close = narrow ? NARROW_DRAMA : WIDE_DRAMA;

    const target = fx.drama && !fx.reducedMotion ? 1 : 0;
    const s = blend.current;
    if (fx.reducedMotion) {
      s.x = 0;
      s.v = 0;
    } else {
      stepSpring(s, target, OMEGA, Math.min(delta, 0.1));
    }
    const t = Math.min(1, Math.max(0, s.x));

    const fov = lerp(base.fov, close.fov, t);
    if (Math.abs(cam.fov - fov) > 1e-4) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.position.set(
      lerp(base.pos[0], close.pos[0], t),
      lerp(base.pos[1], close.pos[1], t),
      lerp(base.pos[2], close.pos[2], t),
    );
    cam.lookAt(
      lerp(base.look[0], close.look[0], t),
      lerp(base.look[1], close.look[1], t),
      lerp(base.look[2], close.look[2], t),
    );
  });
  return null;
}
