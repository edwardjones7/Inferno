"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { stepSpring, type Spring } from "./camera-spring";
import { useSceneFx } from "./fx-context";

/**
 * Blackjack camera. The table is framed to fit whatever screen it's on (a tall phone in
 * portrait sees it from higher up so the dealer, your hand and your bet all fit between
 * the HUD and the controls), then three deliberate moves layer on top:
 * - focus "hand": when it's your decision the camera leans in over your cards;
 * - drama: the slow push-in on the dealer's hole card (fx.drama);
 * - celebrate: a short arc around the table when a blackjack lands.
 * All moves are critically damped springs (no overshoot) and are skipped with reduced motion.
 */

export interface CameraFocus {
  /** "table" while betting / waiting, "hand" while the player is deciding */
  focus: "table" | "hand";
  /** x of the hand being played */
  focusX: number;
  /** half-width of table content that must stay in frame (grows with splits) */
  spanX: number;
  /** pixels covered by the HUD at the top and the controls at the bottom */
  insets: { top: number; bottom: number };
  /** bumps when a blackjack is revealed */
  celebrateKey: number;
}

interface Pose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
}

const DEALER_LOOK_Z = -0.95;
const OMEGA = 8; // ~0.8 s to settle
const CELEBRATE_S = 2.6;

const tmp = { a: new THREE.Vector3(), b: new THREE.Vector3() };

/**
 * Framing for a viewport of the given aspect (of the area between the overlays).
 * Landscape keeps the original three-quarter view; portrait raises the camera and widens
 * the lens until `spanX` fits across the screen.
 */
function basePose(aspect: number, spanX: number, out: Pose): Pose {
  if (aspect >= 1.15) {
    // tuned for ~16:10; wider screens get a touch closer, squarer ones back off
    const k = THREE.MathUtils.clamp(1.55 / aspect, 0.85, 1.25);
    const fit = Math.max(1, spanX / 2.4);
    out.fov = 36;
    out.look.set(0, 0, 0.25);
    out.pos.set(0, 5.0 * k * fit, 0.25 + 5.0 * k * fit);
    return out;
  }
  const fov = aspect < 0.7 ? 52 : 46;
  const elev = THREE.MathUtils.degToRad(aspect < 0.7 ? 60 : 54);
  const half = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const dist = Math.max(5.4, spanX / (half * aspect));
  out.fov = fov;
  out.look.set(0, 0, 0.3);
  out.pos.set(0, Math.sin(elev) * dist, 0.3 + Math.cos(elev) * dist);
  return out;
}

function handPose(base: Pose, focusX: number, aspect: number, out: Pose): Pose {
  // slide toward the active hand and drop in a little closer and lower
  const portrait = aspect < 1.15;
  const toward = portrait ? 0.82 : 0.78;
  out.fov = base.fov;
  out.look.set(focusX * 0.6, 0, portrait ? 0.62 : 0.6);
  out.pos.copy(base.pos).sub(base.look).multiplyScalar(toward).add(out.look);
  out.pos.y -= portrait ? 0.15 : 0.35;
  return out;
}

function dramaPose(aspect: number, out: Pose): Pose {
  if (aspect >= 1.15) {
    out.fov = 34;
    out.look.set(0, 0, DEALER_LOOK_Z);
    out.pos.set(0, 2.25, 1.75);
  } else {
    out.fov = 50;
    out.look.set(0, 0, DEALER_LOOK_Z);
    out.pos.set(0, 3.4, 1.9);
  }
  return out;
}

const mkPose = (): Pose => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 });

export function CameraRig({ focus, focusX, spanX, insets, celebrateKey }: CameraFocus) {
  const fx = useSceneFx();
  const drama = useRef<Spring>({ x: 0, v: 0 });
  const hand = useRef<Spring>({ x: 0, v: 0 });
  const span = useRef<Spring>({ x: spanX, v: 0 });
  const fxPos = useRef<Spring>({ x: focusX, v: 0 });
  const shift = useRef<Spring>({ x: 0, v: 0 });
  const celebrate = useRef({ key: celebrateKey, t: -1 });
  const poses = useRef({ base: mkPose(), hand: mkPose(), drama: mkPose() });

  useFrame((state, delta) => {
    const cam = state.camera as THREE.PerspectiveCamera;
    const dt = Math.min(delta, 0.1);
    const { width, height } = state.size;
    // frame the table in the band between the HUD and the controls
    const usable = Math.max(120, height - insets.top - insets.bottom);
    const aspect = width / usable;

    const still = fx.reducedMotion;
    const springTo = (s: Spring, target: number, omega = OMEGA) => {
      if (still) {
        s.x = target;
        s.v = 0;
      } else stepSpring(s, target, omega, dt);
      return s.x;
    };
    const sp = springTo(span.current, spanX, 5);
    const fxX = springTo(fxPos.current, focusX, 6);
    const tDrama = THREE.MathUtils.clamp(fx.drama && !still ? springTo(drama.current, 1) : springTo(drama.current, 0), 0, 1);
    const tHand = THREE.MathUtils.clamp(springTo(hand.current, focus === "hand" ? 1 : 0, 6), 0, 1);
    // lens shift (px) that centres the table between the overlays
    const px = springTo(shift.current, (insets.bottom - insets.top) / 2, 10);

    const P = poses.current;
    basePose(aspect, sp, P.base);
    handPose(P.base, fxX, aspect, P.hand);
    dramaPose(aspect, P.drama);

    // base -> hand -> drama
    const pos = tmp.a.copy(P.base.pos).lerp(P.hand.pos, tHand).lerp(P.drama.pos, tDrama);
    const look = tmp.b.copy(P.base.look).lerp(P.hand.look, tHand).lerp(P.drama.look, tDrama);
    const fov = THREE.MathUtils.lerp(THREE.MathUtils.lerp(P.base.fov, P.hand.fov, tHand), P.drama.fov, tDrama);

    // celebration: a slow arc around the look point and back
    const c = celebrate.current;
    if (celebrateKey !== c.key) {
      c.key = celebrateKey;
      c.t = still ? -1 : 0;
    }
    if (c.t >= 0) {
      c.t += dt;
      const u = Math.min(1, c.t / CELEBRATE_S);
      const yaw = Math.sin(u * Math.PI) * 0.42 * (1 - u * 0.3);
      pos.sub(look).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).add(look);
      pos.y += Math.sin(u * Math.PI) * 0.35;
      if (u >= 1) c.t = -1;
    }

    cam.position.copy(pos);
    cam.lookAt(look);
    cam.fov = fov;
    // the projection's vertical extent is the full canvas; the fit used the usable band,
    // so widen the lens by the ratio and shift it so the band is centred on the table
    if (height > usable) {
      const half = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * (height / usable);
      cam.fov = THREE.MathUtils.radToDeg(Math.atan(half) * 2);
    }
    cam.updateProjectionMatrix();
    if (px !== 0) {
      // constant NDC offset: moves the whole image up by px pixels
      cam.projectionMatrix.elements[9] -= (2 * px) / height;
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    }
  });
  return null;
}
