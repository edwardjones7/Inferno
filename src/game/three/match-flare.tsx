"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { prng } from "./canvas-utils";
import type { MoodRef } from "./env-mood";

/** seconds; everything is dark again after this */
const DURATION = 2.6;

const SPARK_VERT = /* glsl */ `
uniform float uAge;
uniform float uSize;
uniform float uDpr;
uniform vec3 uOrigin;
attribute vec4 aRand;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float delay = aRand.x * aRand.x * 0.22;
  float life = 0.55 + aRand.y * 0.95;
  float t = uAge - delay;
  if (t < 0.0 || t > life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    vColor = vec3(0.0);
    return;
  }
  float k = t / life;
  // thrown out fast, slowed by the air, pulled down onto the felt
  float speed = 1.8 + aRand.z * 3.4;
  float travel = (1.0 - exp(-t * 2.4)) / 2.4;
  vec3 p = uOrigin + position * speed * travel;
  p.y -= 2.4 * t * t;
  p.y = max(p.y, 0.012);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.35 + 0.65 * (1.0 - k)) * (0.5 + aRand.w) * uDpr / -mv.z;
  vec3 c1 = vec3(6.0, 4.6, 2.6);
  vec3 c2 = vec3(3.6, 1.4, 0.32);
  vec3 c3 = vec3(0.9, 0.16, 0.03);
  vColor = k < 0.3 ? mix(c1, c2, k / 0.3) : mix(c2, c3, (k - 0.3) / 0.7);
  float twinkle = 0.65 + 0.35 * sin(t * 60.0 * (0.5 + aRand.w) + aRand.x * 30.0);
  vAlpha = (1.0 - smoothstep(0.55, 1.0, k)) * twinkle;
}
`;

const SPARK_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor, a * a * a * vAlpha);
}
`;

const PUFF_VERT = /* glsl */ `
uniform float uAge;
uniform float uSize;
uniform float uDpr;
uniform vec3 uOrigin;
attribute vec4 aRand;
varying float vAlpha;
void main() {
  float t = (uAge - 0.12 - aRand.x * 0.3) / (1.6 + aRand.y * 0.8);
  if (t < 0.0 || t > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    return;
  }
  vec3 p = uOrigin + vec3(position.x * 0.6, 0.0, position.z * 0.4) * (0.4 + t);
  p.y += 0.1 + 1.3 * t * (0.6 + 0.4 * aRand.z);
  p.x += sin(t * 4.0 + aRand.w * 6.28) * 0.12 * t;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * mix(0.5, 1.6, t) * (0.7 + 0.6 * aRand.z) * uDpr / -mv.z;
  vAlpha = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.35, 1.0, t));
}
`;

const PUFF_FRAG = /* glsl */ `
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(0.62, 0.56, 0.5, a * a * vAlpha * 0.06);
}
`;

function burstGeometry(count: number, seed: number, upward: number) {
  const rand = prng(seed);
  const dir = new Float32Array(count * 3);
  const r = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    // a cone that fans upward and outward, like sparks off a struck match
    const a = rand() * Math.PI * 2;
    const up = upward + (1 - upward) * rand();
    const s = Math.sqrt(1 - up * up);
    dir[i * 3] = Math.cos(a) * s;
    dir[i * 3 + 1] = up;
    dir[i * 3 + 2] = Math.sin(a) * s * 0.8;
    for (let k = 0; k < 4; k++) r[i * 4 + k] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(dir, 3));
  g.setAttribute("aRand", new THREE.BufferAttribute(r, 4));
  return g;
}

/**
 * Blackjack payoff: a shower of sparks off the player's cards like a struck match, a warm
 * flash on the felt and a curl of smoke left behind (the lamp flares with it, see
 * MoodLights). Driven off mood.bjAge; nothing allocates per frame. Reduced motion keeps
 * only the light; the low tier throws fewer sparks and skips the smoke.
 */
export function MatchFlare({ mood, at, quality }: { mood: MoodRef; at: [number, number, number]; quality: "high" | "low" }) {
  const sparkMat = useRef<THREE.ShaderMaterial>(null);
  const puffMat = useRef<THREE.ShaderMaterial>(null);
  const group = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  // render (invisibly) for the first few frames so the shaders compile up front
  const warmup = useRef(0);
  const low = quality === "low";

  const sparks = useMemo(() => burstGeometry(low ? 120 : 320, 0x5a2c, 0.35), [low]);
  const puff = useMemo(() => burstGeometry(90, 0x9f1, 0), []);
  const origin = useMemo(() => new THREE.Vector3(...at), [at]);
  const sparkUniforms = useMemo(() => ({ uAge: { value: 99 }, uSize: { value: 64 }, uDpr: { value: 1 }, uOrigin: { value: origin } }), [origin]);
  const puffUniforms = useMemo(() => ({ uAge: { value: 99 }, uSize: { value: 420 }, uDpr: { value: 1 }, uOrigin: { value: origin } }), [origin]);

  useFrame((state) => {
    const m = mood.current;
    const age = m.bjAge;
    const active = age < DURATION;
    const warming = warmup.current < 3;
    if (warming) warmup.current++;
    if (group.current) group.current.visible = (active && !m.reduced) || warming;
    if (light.current) {
      const env = active ? Math.min(1, age / 0.04) * Math.exp(-age * 2.6) : 0;
      const flick = m.reduced ? 1 : 0.8 + 0.2 * Math.sin(age * 53) * Math.sin(age * 31);
      light.current.intensity = env * flick * 22;
    }
    if (!active) return;
    const dpr = state.viewport.dpr;
    for (const u of [sparkMat.current?.uniforms, puffMat.current?.uniforms]) {
      if (!u) continue;
      u.uAge.value = age;
      u.uDpr.value = dpr;
    }
  });

  return (
    <>
      <pointLight ref={light} position={[at[0], at[1] + 0.6, at[2]]} color="#ffb060" intensity={0} distance={5} decay={1.6} />
      <group ref={group} visible={false}>
        {!low && (
          <points geometry={puff} frustumCulled={false} renderOrder={5}>
            <shaderMaterial ref={puffMat} args={[{ uniforms: puffUniforms, vertexShader: PUFF_VERT, fragmentShader: PUFF_FRAG }]} transparent depthWrite={false} />
          </points>
        )}
        <points geometry={sparks} frustumCulled={false} renderOrder={6}>
          <shaderMaterial
            ref={sparkMat}
            args={[{ uniforms: sparkUniforms, vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG }]}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      </group>
    </>
  );
}
