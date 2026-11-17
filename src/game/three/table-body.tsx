"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TABLE } from "./canvas-utils";
import { cardBack } from "./card-textures";
import { tableOf, type TableId } from "@/lib/blackjack/tables";
import { feltTexture } from "./felt-texture";
import { useSceneFx, type SceneFx } from "./fx-context";
import { railGlowFragment, railGlowUniforms, railGlowVertex, stepRailGlow } from "./rail-glow";
import { HAND_Z, SHOE_POS } from "./table-layout";
import { feltNormalTexture, leatherNormalTexture } from "./table-textures";

/** Polished brass, shared by the rail trim, dealer lip and shoe. */
export const BRASS = { color: "#c9954a", metalness: 1, roughness: 0.26, clearcoat: 0.4, clearcoatRoughness: 0.18 } as const;
/** Padded oxblood leather for the rails. */
export const LEATHER = { color: "#3a1009", roughness: 0.52, clearcoat: 0.45, clearcoatRoughness: 0.35, sheen: 0.35, sheenColor: "#8a3a22", sheenRoughness: 0.45 } as const;
/** Baize sheen: the lamp catching the nap of the cloth. */
export const BAIZE = { roughness: 0.94, sheen: 0.45, sheenColor: "#6f9a7c", sheenRoughness: 0.6 } as const;

const damp = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));

/**
 * Damped heat plus a short flare on every win / blackjack, for the rail glow. Call once
 * per frame; returns the same object.
 */
export function useRailMood(fx: SceneFx) {
  const s = useRef({ heat: fx.heat, flare: 0, t: 0, win: fx.winKey, bj: fx.blackjackKey });
  return (dt: number) => {
    const m = s.current;
    if (fx.winKey !== m.win) {
      m.win = fx.winKey;
      if (fx.winKey) m.flare = Math.max(m.flare, 0.6);
    }
    if (fx.blackjackKey !== m.bj) {
      m.bj = fx.blackjackKey;
      if (fx.blackjackKey) m.flare = 1;
    }
    m.heat = damp(m.heat, fx.heat, 1.2, dt);
    m.flare *= Math.exp(-dt * 2.4);
    m.t += dt;
    return m;
  };
}

/** Baize felt, padded oxblood leather rail, brass trim, a low warm glow at the rail, dealer lip. */
export function TableBody({ tableId = "classic" }: { tableId?: TableId }) {
  const fx = useSceneFx();

  const { felt, weave, leather, shape } = useMemo(() => {
    const { halfWidth: W, halfDepth: D } = TABLE;
    const shape = new THREE.Shape();
    shape.moveTo(-W, D);
    shape.lineTo(W, D);
    shape.absellipse(0, D, W, D * 2, 0, Math.PI, true);
    // the felt cap's UVs are raw table coordinates; map them onto the whole canvas
    const rules = tableOf(tableId).rules;
    const felt = feltTexture({ payout: rules.blackjackPays === 1.5 ? "3 TO 2" : "6 TO 5", dealerHitsSoft17: rules.dealerHitsSoft17 });
    felt.repeat.set(1 / (W * 2), 1 / (D * 2));
    felt.offset.set(0.5, 0.5);
    return { felt, weave: feltNormalTexture(), leather: leatherNormalTexture(), shape };
  }, [tableId]);

  const geometry = useMemo(
    () => new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 96 }),
    [shape],
  );

  const railCurves = useMemo(() => {
    const { halfWidth: W, halfDepth: D } = TABLE;
    const arc = (rx: number, rz: number, y: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 120; i++) {
        const a = Math.PI * (i / 120);
        pts.push(new THREE.Vector3(Math.cos(a) * rx, y, -D + Math.sin(a) * rz));
      }
      return new THREE.CatmullRomCurve3(pts);
    };
    // rail | brass trim | glow groove | felt, each a little further in from the edge
    return {
      rail: arc(W + 0.08, D * 2 + 0.08, 0.06),
      brass: arc(W - 0.125, D * 2 - 0.125, 0.012),
      glow: arc(W - 0.19, D * 2 - 0.19, 0.003),
    };
  }, []);

  const glowUniforms = useMemo(() => railGlowUniforms(railCurves.glow.getLength()), [railCurves]);
  const railMood = useRailMood(fx);
  const glowMat = useRef<THREE.ShaderMaterial>(null);

  useFrame((_, rawDt) => {
    const m = railMood(Math.min(rawDt, 0.1));
    stepRailGlow(glowMat.current, m.heat, m.flare, m.t, fx.reducedMotion);
  });

  return (
    <group>
      <mesh geometry={geometry} rotation-x={-Math.PI / 2} position-y={-0.34} receiveShadow>
        <meshPhysicalMaterial attach="material-0" map={felt} normalMap={weave} normalScale={[0.35, 0.35]} {...BAIZE} />
        <meshStandardMaterial attach="material-1" color="#140a06" roughness={0.6} metalness={0.2} />
      </mesh>
      {/* padded leather rail */}
      <mesh castShadow receiveShadow>
        <tubeGeometry args={[railCurves.rail, 240, 0.2, 20, false]} />
        <meshPhysicalMaterial {...LEATHER} normalMap={leather} normalScale={[0.8, 0.8]} />
      </mesh>
      {/* brass trim where the rail meets the felt */}
      <mesh castShadow>
        <tubeGeometry args={[railCurves.brass, 240, 0.024, 10, false]} />
        <meshPhysicalMaterial {...BRASS} />
      </mesh>
      {/* low warm glow in the groove inside the trim */}
      <mesh>
        <tubeGeometry args={[railCurves.glow, 240, 0.012, 8, false]} />
        <shaderMaterial ref={glowMat} uniforms={glowUniforms} vertexShader={railGlowVertex} fragmentShader={railGlowFragment} toneMapped={false} />
      </mesh>
      {/* dealer-side lip, leather with a brass nosing toward the felt */}
      <mesh position={[0, 0.02, -TABLE.halfDepth - 0.04]} receiveShadow>
        <boxGeometry args={[TABLE.halfWidth * 2 + 0.3, 0.08, 0.1]} />
        <meshPhysicalMaterial {...LEATHER} />
      </mesh>
      <mesh position={[0, 0.06, -TABLE.halfDepth + 0.012]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.018, 0.018, TABLE.halfWidth * 2 + 0.3, 12]} />
        <meshPhysicalMaterial {...BRASS} />
      </mesh>
    </group>
  );
}

/** Brass frame of the shoe (plinth, corner posts, top rim, mouth rails) as one mesh. */
function shoeBrassGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => parts.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  const hx = 0.405;
  const hz = 0.585;
  box(0.88, 0.035, 1.24, 0, 0.0175, 0); // plinth
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.03, 0.4, 0.03, sx * hx, 0.22, sz * hz); // corner posts
  box(0.03, 0.03, 1.2, -hx, 0.42, 0); // top rim
  box(0.03, 0.03, 1.2, hx, 0.42, 0);
  box(0.84, 0.03, 0.03, 0, 0.42, -hz);
  box(0.84, 0.03, 0.03, 0, 0.42, hz);
  box(0.68, 0.016, 0.022, 0, 0.334, hz); // rails framing the mouth
  box(0.68, 0.016, 0.022, 0, 0.266, hz);
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

export function Shoe() {
  const back = cardBack();
  const brass = useMemo(() => shoeBrassGeometry(), []);
  return (
    <group position={SHOE_POS} rotation-y={-0.55}>
      {/* polished mahogany body */}
      <RoundedBox args={[0.78, 0.4, 1.14]} radius={0.025} smoothness={3} position-y={0.22} castShadow receiveShadow>
        <meshPhysicalMaterial color="#2a1209" metalness={0} roughness={0.38} clearcoat={0.9} clearcoatRoughness={0.12} />
      </RoundedBox>
      <mesh geometry={brass} castShadow receiveShadow>
        <meshPhysicalMaterial {...BRASS} />
      </mesh>
      <mesh position={[0, 0.43, -0.05]} rotation-x={-Math.PI / 2 + 0.25}>
        <planeGeometry args={[0.66, 0.92]} />
        <meshStandardMaterial map={back} roughness={0.5} />
      </mesh>
      {/* smoked glass cover over the cards */}
      <mesh position={[0, 0.4416, -0.047]} rotation-x={-Math.PI / 2 + 0.25}>
        <planeGeometry args={[0.72, 0.98]} />
        <meshPhysicalMaterial color="#2a1810" transparent opacity={0.42} roughness={0.04} metalness={0.2} clearcoat={1} clearcoatRoughness={0.02} depthWrite={false} />
      </mesh>
      {/* the next card's edge showing in the mouth */}
      <mesh position={[0, 0.3, 0.588]}>
        <boxGeometry args={[0.6, 0.03, 0.01]} />
        <meshStandardMaterial color="#e9dcc6" roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Pulsing gold ring under the hand being played (only shown after a split). */
export function ActiveRing({ x }: { x: number }) {
  const fx = useSceneFx();
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((state, dt) => {
    if (mat.current) mat.current.opacity = fx.reducedMotion ? 0.7 : 0.55 + Math.sin(state.clock.elapsedTime * 4) * 0.25;
    if (mesh.current) mesh.current.position.x += (x - mesh.current.position.x) * (1 - Math.exp(-dt * 8));
  });
  return (
    <mesh ref={mesh} position={[x, 0.003, HAND_Z - 0.1]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.62, 0.68, 64]} />
      <meshBasicMaterial ref={mat} color={new THREE.Color(2.4, 1.5, 0.55)} toneMapped={false} transparent depthWrite={false} />
    </mesh>
  );
}
