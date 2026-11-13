"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { cardGeometry, CardRig } from "./card-rig";
import { useSceneFx } from "./fx-context";
import { easeOut, FLIGHT, SHOE_MOUTH, type CardSlot } from "./table-layout";

export interface Card3DProps {
  slot: CardSlot;
  /** seconds after `epoch` before the card leaves the shoe */
  delay: number;
  /** seconds after `epoch` before a face-down card that just became known flips */
  flipDelay: number;
  /** how long the flip takes; longer during a dramatic reveal (slow motion) */
  flipDuration: number;
  /** bumps every time the server answers; delays are relative to it */
  epoch: number;
  /** losing hand: fade/darken */
  dim: boolean;
  /** losing hand once the result is shown: burn the card away to ash */
  burn: boolean;
  /** where the card is dealt from (defaults to the blackjack shoe) */
  from?: THREE.Vector3;
  /** "blackjack" makes the card flash gold when the result is shown */
  highlight: "blackjack" | null;
}

/** Flips longer than this are treated as the cinematic, slow-motion reveal. */
const DRAMATIC_FLIP = 0.8;
const BURN_SECONDS = 1.4;
const BURN_SECONDS_CALM = 0.9;
/** burn progress at which the trailing ash has finished drifting */
const BURN_END = 1.95;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Ease that slows to a hang at the midpoint (card standing on its edge). */
const hang = (p: number) => {
  const x = 2 * p - 1;
  const q = 0.5 + 0.5 * Math.sign(x) * Math.pow(Math.abs(x), 1.7);
  return q * 0.5 + smooth(0, 1, q) * 0.5;
};

function hashSeed(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export function Card3D({ slot, delay, flipDelay, flipDuration, epoch, dim, burn, highlight, from }: Card3DProps) {
  const origin = from ?? SHOE_MOUTH;
  const group = useRef<THREE.Group>(null);
  const flipper = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const fx = useSceneFx();
  const [rig] = useState(() => new CardRig(hashSeed(slot.key)));
  const geo = cardGeometry();
  const st = useRef({
    born: -1,
    epochAt: -1,
    pendingEpoch: true,
    angle: Math.PI,
    prevAngle: Math.PI,
    target: new THREE.Vector3(),
    prevPos: new THREE.Vector3(),
    flipStart: -1,
    flipFrom: Math.PI,
    burnStart: -1,
    burnDur: BURN_SECONDS,
    hlStart: -1,
    hlFade: 0,
    bend: new THREE.Vector2(),
    bendVel: new THREE.Vector2(),
    bendGoal: new THREE.Vector2(),
    foilPhase: 0,
    gold: new THREE.Vector4(-3, 0, 0, 0),
  });

  useEffect(() => {
    st.current.pendingEpoch = true;
  }, [epoch]);

  useEffect(() => {
    rig.setCard(slot.card);
  }, [rig, slot.card]);

  useEffect(() => () => rig.dispose(), [rig]);

  useFrame((state, rawDt) => {
    const g = group.current;
    const f = flipper.current;
    if (!g || !f) return;
    const dt = Math.min(rawDt, 1 / 20);
    const s = st.current;
    const now = state.clock.elapsedTime;
    if (s.pendingEpoch) {
      s.epochAt = now;
      s.pendingEpoch = false;
    }
    if (s.born < 0) {
      s.born = now + delay;
      g.position.copy(origin);
      s.prevPos.copy(origin);
    }
    s.target.set(...slot.pos);

    const t = (now - s.born) / FLIGHT;
    if (t < 0) {
      g.visible = false;
      return;
    }
    const faceUpTarget = slot.card ? 0 : Math.PI;
    const landed = t >= 1;

    // ---------------------------------------------------------------- burn clock
    if (burn && landed && s.burnStart < 0) {
      s.burnStart = now;
      s.burnDur = fx.reducedMotion ? BURN_SECONDS_CALM : BURN_SECONDS;
    } else if (!burn && s.burnStart >= 0) {
      s.burnStart = -1;
    }
    const burnT = s.burnStart >= 0 ? (now - s.burnStart) / s.burnDur : 0;
    // fire catches slowly then races across the card
    const burnP = burnT <= 0 ? 0 : burnT < 1 ? 0.35 * burnT + 0.65 * burnT * burnT : burnT;
    if (burnT >= (fx.reducedMotion ? 1 : BURN_END)) {
      g.visible = false;
      return;
    }
    g.visible = true;
    if (body.current) body.current.visible = burnT < 1;

    s.bendGoal.set(0, 0);
    let flipping = false;

    if (!landed) {
      const e = easeOut(t);
      g.position.lerpVectors(origin, s.target, e);
      g.position.y += Math.sin(Math.PI * t) * 0.45;
      g.rotation.y = (1 - e) * 0.8;
      // open cards turn over in the air; the hole card stays down
      s.angle = slot.hole ? Math.PI : Math.PI * (1 - e) + faceUpTarget * e;
      // the card bows slightly as it cuts through the air
      s.bendGoal.y = Math.sin(Math.PI * t) * 0.022;
    } else {
      const k = 1 - Math.exp(-dt * 9);
      const lift = smooth(0, 0.5, burnP) * 0.035;
      s.target.y += lift;
      g.position.lerp(s.target, k);
      g.rotation.y += (0 - g.rotation.y) * k;
      const due = now >= Math.max(s.born + FLIGHT, s.epochAt + flipDelay);
      if (s.flipStart < 0 && s.angle > faceUpTarget + 1e-3 && due) {
        s.flipStart = now;
        s.flipFrom = s.angle;
      }
      if (s.flipStart >= 0 && s.angle > faceUpTarget + 1e-3) {
        flipping = true;
        const p = Math.min(1, (now - s.flipStart) / Math.max(flipDuration, 1e-3));
        if (flipDuration >= DRAMATIC_FLIP) {
          // cinematic: lift, turn toward the camera, hang on edge, then slap down
          const up = smooth(0, 0.18, p) * (1 - smooth(0.84, 1, p));
          const q = hang(Math.min(1, Math.max(0, (p - 0.12) / 0.76)));
          s.angle = faceUpTarget + (s.flipFrom - faceUpTarget) * (1 - q);
          g.position.y = s.target.y + up * 0.28 + Math.sin(s.angle) * 0.1;
          g.rotation.y = fx.reducedMotion ? 0 : -0.55 * up;
          s.bendGoal.x = 0.01 * up;
        } else {
          const e = smooth(0, 1, p);
          s.angle = faceUpTarget + (s.flipFrom - faceUpTarget) * (1 - e);
          g.position.y = s.target.y + Math.sin(s.angle) * 0.22;
        }
        if (p >= 1) s.angle = faceUpTarget;
      }
      if (!flipping && s.angle <= faceUpTarget + 1e-3) s.flipStart = -1;
    }
    f.rotation.z = s.angle;

    // ---------------------------------------------------------------- bend spring
    const angVel = (s.angle - s.prevAngle) / Math.max(dt, 1e-4);
    s.prevAngle = s.angle;
    if (flipping || !landed) s.bendGoal.x += Math.max(-0.028, Math.min(0.028, -angVel * 0.0032));
    s.bendVel.x += (s.bendGoal.x - s.bend.x) * 320 * dt;
    s.bendVel.y += (s.bendGoal.y - s.bend.y) * 320 * dt;
    s.bendVel.multiplyScalar(Math.exp(-dt * 16));
    s.bend.addScaledVector(s.bendVel, dt);
    if (landed && !flipping) {
      // resting on the felt: never bow down into the cards beneath
      const up = Math.cos(s.angle) >= 0 ? 1 : -1;
      if (s.bend.x * up < 0) s.bend.x = 0;
      if (s.bend.y * up < 0) s.bend.y = 0;
    }

    // ---------------------------------------------------------------- foil drift
    const speed = g.position.distanceTo(s.prevPos) / Math.max(dt, 1e-4);
    s.prevPos.copy(g.position);
    s.foilPhase += dt * (0.06 + speed * 0.35 + Math.abs(angVel) * 0.08);

    // ---------------------------------------------------------------- blackjack
    if (highlight === "blackjack" && landed && !flipping && s.hlStart < 0) s.hlStart = now;
    let pop = 1;
    if (highlight === "blackjack" && s.hlStart >= 0) {
      const ht = now - s.hlStart;
      const flash = ht < 0.1 ? ht / 0.1 : Math.exp(-(ht - 0.1) * 3.2);
      const rim = smooth(0.25, 1.1, ht) * (0.5 + 0.08 * Math.sin(ht * 2.4)) + flash * 0.6;
      s.hlFade = 1;
      s.gold.set(-1.7 + ht * 3.8, ht < 1.1 ? 1 : 0, flash * (fx.reducedMotion ? 0.5 : 1), rim);
      if (!fx.reducedMotion) pop = 1 + 0.06 * Math.sin(Math.PI * Math.min(1, ht / 0.5));
    } else {
      s.hlStart = -1;
      s.hlFade = Math.max(0, s.hlFade - dt * 2);
      s.gold.set(-3, 0, 0, s.gold.w * s.hlFade);
    }
    g.scale.setScalar(pop);

    rig.frame({
      time: now,
      dt,
      dim,
      burn: burnP,
      bend: s.bend,
      curl: fx.reducedMotion ? 0 : smooth(0, 1, burnP) * 0.07,
      gold: s.gold,
      foilPhase: s.foilPhase,
      viewH: state.size.height * state.viewport.dpr,
    });
  });

  return (
    <group ref={group} visible={false}>
      <group ref={flipper}>
        <mesh
          ref={body}
          geometry={geo}
          material={rig.materials}
          customDepthMaterial={rig.depth}
          rotation-x={-Math.PI / 2}
          castShadow
          receiveShadow
        />
      </group>
      {burn && !fx.reducedMotion && <points geometry={rig.particleGeometry} material={rig.particles} frustumCulled={false} renderOrder={2} />}
    </group>
  );
}
