"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { MoodRef } from "./env-mood";

const EMBER = new THREE.Color(3.2, 0.9, 0.2);
const tmp = new THREE.Color();

/** Where the cigar's tip sits relative to the ashtray (its smoke rises from here). */
export const CIGAR_TIP: [number, number, number] = [0.28, 0.055, -0.01];

/**
 * A heavy smoked-glass ashtray with a cigar resting on the rim. The tip smoulders: a slow
 * glow that brightens now and then as if someone just drew on it, and flares on a win.
 */
export function Ashtray({ position, rotation = 0, mood, light }: { position: [number, number, number]; rotation?: number; mood: MoodRef; light: boolean }) {
  const ember = useRef<THREE.MeshBasicMaterial>(null);
  const glow = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const m = mood.current;
    const t = m.time;
    // a draw on the cigar every ~7s, then it settles back to a dull glow
    const cycle = (t % 7.3) / 7.3;
    const draw = m.reduced ? 0 : Math.exp(-cycle * 9) * (cycle < 0.02 ? cycle / 0.02 : 1);
    const k = (0.45 + 0.08 * Math.sin(t * 2.3) * (m.reduced ? 0 : 1) + 0.9 * draw + 0.8 * m.win) * (1 - 0.3 * m.cold);
    if (ember.current) ember.current.color.copy(tmp.copy(EMBER).multiplyScalar(k));
    if (glow.current) glow.current.intensity = 0.5 * k;
  });

  return (
    <group position={position} rotation-y={rotation}>
      {/* smoked glass dish */}
      <mesh castShadow receiveShadow position-y={0.03}>
        <cylinderGeometry args={[0.2, 0.18, 0.06, 28]} />
        <meshStandardMaterial color="#2a1a10" roughness={0.12} metalness={0.35} />
      </mesh>
      <mesh position-y={0.061} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.15, 24]} />
        <meshStandardMaterial color="#0e0806" roughness={0.9} />
      </mesh>
      {/* a little grey ash in the bowl */}
      <mesh position={[-0.04, 0.064, 0.03]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.05, 12]} />
        <meshStandardMaterial color="#4a4542" roughness={1} />
      </mesh>
      {/* the cigar across the rim, lit end out over the felt */}
      <group position={[0.09, 0.075, 0.04]} rotation={[0, 0.25, -0.12]}>
        <mesh rotation-z={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.024, 0.026, 0.34, 12]} />
          <meshStandardMaterial color="#4a2814" roughness={0.75} />
        </mesh>
        <mesh rotation-z={Math.PI / 2} position-x={-0.11}>
          <cylinderGeometry args={[0.027, 0.027, 0.03, 12]} />
          <meshStandardMaterial color="#a8782c" metalness={0.8} roughness={0.35} />
        </mesh>
        <mesh rotation-z={Math.PI / 2} position-x={0.18}>
          <cylinderGeometry args={[0.025, 0.024, 0.03, 12]} />
          <meshStandardMaterial color="#5a5450" roughness={1} />
        </mesh>
        <mesh rotation-z={Math.PI / 2} position-x={0.197}>
          <cylinderGeometry args={[0.02, 0.022, 0.006, 12]} />
          <meshBasicMaterial ref={ember} color={EMBER} toneMapped={false} />
        </mesh>
      </group>
      {light && <pointLight ref={glow} position={[0.3, 0.12, 0.06]} color="#ff7a2a" intensity={0.25} distance={0.9} decay={2} />}
    </group>
  );
}
