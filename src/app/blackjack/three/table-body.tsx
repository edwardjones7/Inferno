"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TABLE } from "./canvas-utils";
import { cardBack } from "./card-textures";
import { crackMaskTexture } from "./felt-cracks";
import { feltTexture } from "./felt-texture";
import { useSceneFx } from "./fx-context";
import { HAND_Z, SHOE_POS } from "./table-layout";
import { crackUniforms, lavaSeamFragment, lavaSeamUniforms, lavaSeamVertex, patchCrackShimmer } from "./table-lava";
import { feltNormalTexture, leatherNormalTexture } from "./table-textures";

/** Polished brass, shared by the rail trim, dealer lip and shoe. */
const BRASS = { color: "#d9a54c", metalness: 1, roughness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.12 } as const;
const LEATHER = "#22120b";

const damp = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));

/** Felt (with lava cracks), padded leather rail, brass trim, lava seam, dealer lip and floor. */
export function TableBody() {
  const fx = useSceneFx();

  const { felt, cracks, weave, leather, shape } = useMemo(() => {
    const { halfWidth: W, halfDepth: D } = TABLE;
    const shape = new THREE.Shape();
    shape.moveTo(-W, D);
    shape.lineTo(W, D);
    shape.absellipse(0, D, W, D * 2, 0, Math.PI, true);
    // the felt cap's UVs are raw table coordinates; map them onto the whole canvas
    const felt = feltTexture();
    felt.repeat.set(1 / (W * 2), 1 / (D * 2));
    felt.offset.set(0.5, 0.5);
    const cracks = crackMaskTexture();
    cracks.repeat.set(1 / (W * 2), 1 / (D * 2));
    cracks.offset.set(0.5, 0.5);
    return { felt, cracks, weave: feltNormalTexture(), leather: leatherNormalTexture(), shape };
  }, []);

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
    // rail | brass trim | lava seam | felt, each a little further in from the edge
    return {
      rail: arc(W + 0.08, D * 2 + 0.08, 0.06),
      brass: arc(W - 0.125, D * 2 - 0.125, 0.012),
      glow: arc(W - 0.2, D * 2 - 0.2, 0.004),
    };
  }, []);

  const seamUniforms = useMemo(() => lavaSeamUniforms(railCurves.glow.getLength()), [railCurves]);

  // crack shimmer uniforms live in a ref so the frame loop can advance them
  const crackU = useRef(crackUniforms());
  const onFeltCompile = useCallback((shader: THREE.WebGLProgramParametersWithUniforms) => patchCrackShimmer(shader, crackU.current), []);

  const feltMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const seamMat = useRef<THREE.ShaderMaterial>(null);
  const heat = useRef(fx.heat);
  const clock = useRef({ t: 0, crack: 0 });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const h = (heat.current = damp(heat.current, fx.heat, 1.2, dt));
    const calm = fx.reducedMotion;
    const c = clock.current;
    c.t += dt;
    c.crack += dt * (calm ? 0.15 : 0.6 + 0.6 * Math.max(h, 0));

    const seam = seamMat.current;
    if (seam) {
      // world units per second along the seam: ~0.04 cold, 0.12 neutral, 0.34 hot
      const speed = 0.12 * Math.pow(2, 1.5 * h) * (calm ? 0.3 : 1);
      seam.uniforms.uFlow.value += speed * dt;
      seam.uniforms.uTime.value = c.t;
      seam.uniforms.uHeat.value = h;
      seam.uniforms.uPulse.value = calm ? 0 : 1;
    }

    crackU.current.uCrackTime.value = c.crack;
    const m = feltMat.current;
    if (m) {
      const k = (h + 1) / 2;
      const pulse = calm ? 1 : 1 + 0.18 * Math.sin(c.t * 0.9) + 0.06 * Math.sin(c.t * 2.3);
      // nearly invisible when cold, unbloomed embers at neutral, blazing when hot
      m.emissiveIntensity = (0.02 + 3.2 * Math.pow(k, 3.6)) * pulse;
    }
  });

  return (
    <group>
      <mesh geometry={geometry} rotation-x={-Math.PI / 2} position-y={-0.34} receiveShadow>
        <meshPhysicalMaterial
          ref={feltMat}
          attach="material-0"
          map={felt}
          normalMap={weave}
          normalScale={[0.35, 0.35]}
          roughness={0.92}
          sheen={0.7}
          sheenColor="#ff8a4a"
          sheenRoughness={0.55}
          emissive="#ffffff"
          emissiveMap={cracks}
          emissiveIntensity={0.6}
          onBeforeCompile={onFeltCompile}
        />
        <meshStandardMaterial attach="material-1" color="#160c08" roughness={0.6} metalness={0.2} />
      </mesh>
      {/* padded leather rail */}
      <mesh castShadow receiveShadow>
        <tubeGeometry args={[railCurves.rail, 240, 0.2, 20, false]} />
        <meshPhysicalMaterial
          color={LEATHER}
          roughness={0.48}
          normalMap={leather}
          normalScale={[0.8, 0.8]}
          clearcoat={0.65}
          clearcoatRoughness={0.28}
          sheen={0.3}
          sheenColor="#7a3f22"
          sheenRoughness={0.4}
        />
      </mesh>
      {/* brass trim where the rail meets the felt */}
      <mesh castShadow>
        <tubeGeometry args={[railCurves.brass, 240, 0.024, 10, false]} />
        <meshPhysicalMaterial {...BRASS} />
      </mesh>
      {/* the lava seam that gives the table its glow */}
      <mesh>
        <tubeGeometry args={[railCurves.glow, 240, 0.022, 10, false]} />
        <shaderMaterial ref={seamMat} uniforms={seamUniforms} vertexShader={lavaSeamVertex} fragmentShader={lavaSeamFragment} toneMapped={false} />
      </mesh>
      {/* dealer-side lip, leather with a brass nosing toward the felt */}
      <mesh position={[0, 0.02, -TABLE.halfDepth - 0.04]} receiveShadow>
        <boxGeometry args={[TABLE.halfWidth * 2 + 0.3, 0.08, 0.1]} />
        <meshPhysicalMaterial color={LEATHER} roughness={0.45} clearcoat={0.6} clearcoatRoughness={0.3} />
      </mesh>
      <mesh position={[0, 0.06, -TABLE.halfDepth + 0.012]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.018, 0.018, TABLE.halfWidth * 2 + 0.3, 12]} />
        <meshPhysicalMaterial {...BRASS} />
      </mesh>
      {/* floor */}
      <mesh rotation-x={-Math.PI / 2} position-y={-1.4} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#0b0705" roughness={1} />
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
      {/* polished dark metal body */}
      <RoundedBox args={[0.78, 0.4, 1.14]} radius={0.025} smoothness={3} position-y={0.22} castShadow receiveShadow>
        <meshPhysicalMaterial color="#17100c" metalness={0.85} roughness={0.26} clearcoat={1} clearcoatRoughness={0.08} />
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
      {/* glowing mouth */}
      <mesh position={[0, 0.3, 0.588]}>
        <boxGeometry args={[0.6, 0.03, 0.01]} />
        <meshBasicMaterial color={new THREE.Color(4, 1.2, 0.3)} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Pulsing ember-and-gold ring under the hand being played (only shown after a split). */
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
      <meshBasicMaterial ref={mat} color={new THREE.Color(4.2, 2.2, 0.55)} toneMapped={false} transparent depthWrite={false} />
    </mesh>
  );
}
