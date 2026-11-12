"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { prng } from "./canvas-utils";
import { heatColor, LAMP, NOISE_GLSL } from "./env-glsl";
import type { MoodRef } from "./env-mood";

const BEAM_COLD = new THREE.Color(0.62, 0.7, 0.85);
const BEAM_NEUTRAL = new THREE.Color(1.0, 0.74, 0.46);
const BEAM_HOT = new THREE.Color(1.0, 0.6, 0.3);
const BULB = new THREE.Color(7, 4.4, 2.0);
const LIP = new THREE.Color(4.2, 2.3, 0.9);

/** Brass-trimmed dark-metal pendant lamp; `y` is the height of the shade's bottom rim. */
export function PendantLamp({ y }: { y: number }) {
  const shade = useMemo(() => {
    const pts = [
      [0.52, 0],
      [0.505, 0.04],
      [0.46, 0.12],
      [0.38, 0.22],
      [0.26, 0.31],
      [0.14, 0.38],
      [0.085, 0.43],
      [0.075, 0.5],
    ].map(([r, h]) => new THREE.Vector2(r, h));
    return new THREE.LatheGeometry(pts, 48);
  }, []);

  return (
    <group position={[LAMP.x, y, LAMP.z]}>
      {/* cord up into the dark */}
      <mesh position-y={0.55 + 3}>
        <cylinderGeometry args={[0.012, 0.012, 6, 6, 1, true]} />
        <meshStandardMaterial color="#120c08" roughness={0.6} />
      </mesh>
      {/* brass cap */}
      <mesh position-y={0.53}>
        <cylinderGeometry args={[0.06, 0.09, 0.09, 20]} />
        <meshStandardMaterial color="#b9852f" metalness={1} roughness={0.28} />
      </mesh>
      {/* shade: dark burnished metal */}
      <mesh geometry={shade}>
        <meshStandardMaterial color="#21160f" metalness={0.85} roughness={0.34} side={THREE.DoubleSide} />
      </mesh>
      {/* brass rim */}
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.52, 0.02, 10, 64]} />
        <meshStandardMaterial color="#c8923c" metalness={1} roughness={0.22} />
      </mesh>
      {/* warm glowing inner lip */}
      <mesh rotation-x={Math.PI / 2} position-y={0.012}>
        <torusGeometry args={[0.487, 0.011, 8, 64]} />
        <meshBasicMaterial color={LIP} toneMapped={false} />
      </mesh>
      {/* bulb */}
      <mesh position-y={0.11}>
        <sphereGeometry args={[0.1, 20, 14]} />
        <meshBasicMaterial color={BULB} toneMapped={false} />
      </mesh>
    </group>
  );
}

const BEAM_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
varying vec3 vN;
varying vec3 vWorld;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec3 v = normalize(cameraPosition - vWorld);
  float nl = length(vN);
  vec3 nrm = nl > 1e-4 ? vN / nl : vec3(0.0, 1.0, 0.0);
  float facing = clamp(abs(dot(nrm, v)), 0.0, 1.0);
  float edge = facing * sqrt(max(facing, 0.0)); // ~pow(facing, 1.5) without pow(0, y)
  float top = clamp(vUv.y, 0.0, 1.0);
  float vertical = (0.18 + 0.82 * top * sqrt(top)) * smoothstep(0.0, 0.3, top);
  float n = clamp(fbm(vec2(vWorld.x * 1.3 + vWorld.z * 0.6, vWorld.y * 0.9 - uTime * 0.12)), 0.0, 1.0);
  float a = uIntensity * edge * vertical * (0.6 + 0.6 * n);
  // NaN-safe: comparisons with NaN are false, so a bad value is discarded instead of
  // poisoning the bloom pass (which spreads a single NaN pixel across the frame).
  if (!(a > 0.0) || !(a < 10.0)) discard;
  gl_FragColor = vec4(max(uColor, vec3(0.0)), a);
}
`;

/** Soft additive light cone from the lamp to the felt. */
export function LightBeam({ y, mood }: { y: number; mood: MoodRef }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(LAMP.topR, LAMP.floorR, y, 64, 1, true);
    g.translate(LAMP.x, y / 2, LAMP.z);
    return g;
  }, [y]);
  const uniforms = useMemo(
    () => ({ uColor: { value: BEAM_NEUTRAL.clone() }, uIntensity: { value: 0.07 }, uTime: { value: 0 } }),
    [],
  );

  useFrame(() => {
    const m = mood.current;
    const u = mat.current?.uniforms;
    if (!u) return;
    u.uTime.value = m.reduced ? 0 : m.time;
    heatColor(u.uColor.value, m.heat, BEAM_COLD, BEAM_NEUTRAL, BEAM_HOT);
    const bj = m.bjAge < 2 ? Math.exp(-m.bjAge * 2.5) : 0;
    u.uIntensity.value = 0.075 * (1 + 0.25 * m.hot - 0.35 * m.cold) * (1 - 0.4 * m.lose) + 0.05 * bj;
  });

  return (
    <mesh geometry={geometry} renderOrder={1}>
      <shaderMaterial
        ref={mat}
        args={[{ uniforms, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG }]}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

const HAZE_VERT = /* glsl */ `
attribute vec2 aCorner;
attribute vec2 aSeed;
varying vec2 vCorner;
varying vec2 vSeed;
varying vec3 vWorld;
void main() {
  vec3 center = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = center + (right * aCorner.x + up * aCorner.y) * aSeed.y;
  vWorld = wp;
  vCorner = aCorner;
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const HAZE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uLampY;
uniform vec2 uRadii;
uniform vec2 uAxis;
varying vec2 vCorner;
varying vec2 vSeed;
varying vec3 vWorld;
${NOISE_GLSL}
void main() {
  float mask = smoothstep(1.0, 0.15, length(vCorner));
  vec2 p = vCorner * 1.3 + vec2(vSeed.x * 17.0 + uTime * 0.035, vSeed.x * 5.0 - uTime * 0.055);
  float n = fbm(p + 0.6 * vec2(fbm(p * 0.7 + uTime * 0.02), fbm(p * 0.7 - 3.1)));
  float smoke = smoothstep(0.38, 0.82, n);
  // only the part of the haze inside the lamp's cone is lit
  float h = clamp(vWorld.y / uLampY, 0.0, 1.0);
  float r = mix(uRadii.y, uRadii.x, h);
  float d = length(vWorld.xz - uAxis);
  float lit = 1.0 - smoothstep(0.45 * r, 1.05 * r, d);
  lit *= 0.35 + 0.65 * h;
  float floorFade = smoothstep(0.05, 0.45, vWorld.y);
  gl_FragColor = vec4(uColor, uOpacity * mask * smoke * lit * floorFade);
}
`;

const HAZE_PUFFS = 6;

/** A handful of big, slowly churning smoke billboards caught in the beam (one draw call). */
export function BeamHaze({ y, mood }: { y: number; mood: MoodRef }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const rand = prng(0x5a0e);
    const pos: number[] = [];
    const corner: number[] = [];
    const seed: number[] = [];
    const index: number[] = [];
    for (let i = 0; i < HAZE_PUFFS; i++) {
      const h = 0.55 + rand() * (y - 0.9);
      const cx = LAMP.x + (rand() - 0.5) * 1.6;
      const cz = LAMP.z + (rand() - 0.5) * 1.2;
      const size = 0.75 + rand() * 0.55;
      const s = rand();
      const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
      for (let k = 0; k < 4; k++) {
        pos.push(cx, h, cz);
        corner.push(corners[k * 2], corners[k * 2 + 1]);
        seed.push(s, size);
      }
      const b = i * 4;
      index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aCorner", new THREE.Float32BufferAttribute(corner, 2));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 2));
    g.setIndex(index);
    return g;
  }, [y]);
  const uniforms = useMemo(
    () => ({
      uColor: { value: BEAM_NEUTRAL.clone() },
      uOpacity: { value: 0.1 },
      uTime: { value: 0 },
      uLampY: { value: y },
      uRadii: { value: new THREE.Vector2(LAMP.topR, LAMP.floorR) },
      uAxis: { value: new THREE.Vector2(LAMP.x, LAMP.z) },
    }),
    [y],
  );

  useFrame((_, dt) => {
    const m = mood.current;
    const u = mat.current?.uniforms;
    if (!u) return;
    u.uTime.value += Math.min(dt, 0.1) * (m.reduced ? 0.25 : 1 + 0.6 * m.hot);
    heatColor(u.uColor.value, m.heat, BEAM_COLD, BEAM_NEUTRAL, BEAM_HOT);
    const bj = m.bjAge < 2 ? Math.exp(-m.bjAge * 2) : 0;
    u.uOpacity.value = 0.11 * (1 + 0.2 * m.hot - 0.15 * m.cold) * (1 - 0.35 * m.lose) + 0.08 * bj;
  });

  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={2}>
      <shaderMaterial
        ref={mat}
        args={[{ uniforms, vertexShader: HAZE_VERT, fragmentShader: HAZE_FRAG }]}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
