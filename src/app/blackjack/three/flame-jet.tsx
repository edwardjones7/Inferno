"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { prng } from "./canvas-utils";
import { NOISE_GLSL, RAIL } from "./env-glsl";
import type { MoodRef } from "./env-mood";

const FLAME_COUNT = 900;
const SMOKE_COUNT = 180;
/** seconds; everything is dark again after this */
const DURATION = 2.0;

/** Shared GLSL: rail point + outward normal for arc parameter a, and the eruption wave delay. */
const RAIL_GLSL = /* glsl */ `
vec3 railPoint(float a) { return vec3(cos(a) * ${RAIL.rx.toFixed(3)}, ${(RAIL.y + RAIL.tube * 0.8).toFixed(3)}, ${RAIL.z0.toFixed(3)} + sin(a) * ${RAIL.rz.toFixed(3)}); }
vec2 railNormal(float a) { return normalize(vec2(cos(a) / ${RAIL.rx.toFixed(3)}, sin(a) / ${RAIL.rz.toFixed(3)})); }
// the eruption starts at the player-side front of the rail and races out to both ends
float railWave(float a) { return 0.24 * abs(a - 1.5708) / 1.5708; }
// shorter tongues right in front of the player's cards, full height on the flanks
float railHeight(float a) { return mix(0.5, 1.0, pow(abs(cos(a)), 0.7)); }
`;

const FLAME_VERT = /* glsl */ `
uniform float uAge;
uniform float uSize;
uniform float uDpr;
uniform float uRise;
attribute vec4 aRand;
varying vec3 vColor;
varying float vAlpha;
varying float vT;
${RAIL_GLSL}
void main() {
  float a = position.x;
  vec3 base = railPoint(a);
  vec2 n = railNormal(a);
  base.xz += n * (position.y - 0.5) * 0.34;
  float spawn = railWave(a) + aRand.x * 0.6;
  float life = 0.45 + aRand.y * 0.45;
  float t = (uAge - spawn) / life;
  if (t < 0.0 || t > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    vColor = vec3(0.0);
    vT = 0.0;
    return;
  }
  // later spawns are smaller tongues: the jet roars up, then settles
  float hs = railHeight(a) * mix(1.0, 0.5, aRand.x);
  vec3 p = base;
  p.y += uRise * hs * pow(t, 0.72);
  float tw = position.z * 6.2831;
  p.x += sin(t * 7.0 + tw) * 0.13 * t;
  p.z += cos(t * 6.0 + tw * 1.3) * 0.13 * t;
  p.xz += n * 0.22 * t * t;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float sz = mix(1.0, 0.3, t) * (0.6 + aRand.z * 0.8) * mix(1.0, 0.75, aRand.x);
  gl_PointSize = uSize * sz * uDpr / -mv.z;
  vec3 c1 = vec3(4.0, 3.1, 1.7);
  vec3 c2 = vec3(3.2, 1.15, 0.2);
  vec3 c3 = vec3(0.8, 0.12, 0.03);
  vColor = t < 0.28 ? mix(c1, c2, t / 0.28) : mix(c2, c3, (t - 0.28) / 0.72);
  vAlpha = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.5, 1.0, t));
  vT = t + aRand.w;
}
`;

const FLAME_FRAG = /* glsl */ `
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
varying float vT;
${NOISE_GLSL}
void main() {
  vec2 c = gl_PointCoord - 0.5;
  // licking, teardrop-ish sprite: wider at the bottom, noisy edge
  c.x *= 1.0 + 0.6 * (0.5 - gl_PointCoord.y);
  float edge = 0.5 - 0.14 * vnoise(gl_PointCoord * 5.0 + vT * 9.0);
  float a = smoothstep(edge, 0.0, length(c));
  a = pow(a, 1.5);
  gl_FragColor = vec4(vColor, a * vAlpha * uGain);
}
`;

const SMOKE_VERT = /* glsl */ `
uniform float uAge;
uniform float uSize;
uniform float uDpr;
uniform float uRise;
attribute vec4 aRand;
varying float vAlpha;
${RAIL_GLSL}
void main() {
  float a = position.x;
  vec3 base = railPoint(a);
  float spawn = railWave(a) + 0.2 + aRand.x * 0.55;
  float life = 0.85 + aRand.y * 0.3;
  float t = (uAge - spawn) / life;
  if (t < 0.0 || t > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    return;
  }
  float hs = railHeight(a);
  vec3 p = base;
  p.y += uRise * hs * (0.45 + 0.75 * t);
  float tw = position.z * 6.2831;
  p.x += sin(t * 3.0 + tw) * 0.25 * t;
  p.z += cos(t * 2.5 + tw) * 0.2 * t;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * mix(0.6, 1.5, t) * (0.7 + aRand.z * 0.6) * uDpr / -mv.z;
  vAlpha = smoothstep(0.0, 0.2, t) * (1.0 - smoothstep(0.45, 1.0, t));
}
`;

const SMOKE_FRAG = /* glsl */ `
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(0.05, 0.038, 0.032, a * a * vAlpha * 0.38);
}
`;

const GLOW_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const GLOW_FRAG = /* glsl */ `
uniform float uAge;
uniform float uGain;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorld;
${NOISE_GLSL}
float railWave(float a) { return 0.24 * abs(a - 1.5708) / 1.5708; }
void main() {
  float a = vUv.x * 3.14159265;
  float since = uAge - railWave(a);
  float lit = smoothstep(0.0, 0.06, since) * exp(-max(since, 0.0) * 1.7) * (1.0 - smoothstep(1.5, 1.95, uAge));
  float fres = 1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vWorld)));
  float flick = 0.7 + 0.3 * vnoise(vec2(vUv.x * 70.0, uAge * 9.0));
  vec3 col = vec3(3.2, 1.15, 0.25) * lit * (0.3 + 1.1 * fres * fres) * flick * uGain;
  gl_FragColor = vec4(col, 1.0);
}
`;

function railGeometry(count: number, seed: number) {
  const rand = prng(seed);
  const pos = new Float32Array(count * 3);
  const r = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = ((i + rand()) / count) * Math.PI; // even coverage along the arc
    pos[i * 3 + 1] = rand();
    pos[i * 3 + 2] = rand();
    for (let k = 0; k < 4; k++) r[i * 4 + k] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aRand", new THREE.BufferAttribute(r, 4));
  return g;
}

/**
 * Blackjack eruption: flames race along the padded rail, roar ~1.5 units up with an HDR
 * yellow-orange core, leave a smoky tail, the rail itself flares and a warm light floods
 * the felt. Everything is driven off mood.bjAge in the shaders; nothing allocates per frame.
 * With reduced motion only the rail glow and the light flash play.
 */
export function FlameJet({ mood }: { mood: MoodRef }) {
  const flameMat = useRef<THREE.ShaderMaterial>(null);
  const smokeMat = useRef<THREE.ShaderMaterial>(null);
  const glowMat = useRef<THREE.ShaderMaterial>(null);
  const group = useRef<THREE.Group>(null);
  const particles = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  // render (invisibly, uAge = 99) for the first few frames so the shaders compile up front
  const warmup = useRef(0);

  const flames = useMemo(() => railGeometry(FLAME_COUNT, 0xf1a3e), []);
  const smoke = useMemo(() => railGeometry(SMOKE_COUNT, 0x5302e), []);
  const glowGeometry = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = Math.PI * (i / 96);
      pts.push(new THREE.Vector3(Math.cos(a) * RAIL.rx, RAIL.y, RAIL.z0 + Math.sin(a) * RAIL.rz));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, RAIL.tube + 0.018, 14, false);
  }, []);

  const flameUniforms = useMemo(
    () => ({ uAge: { value: 99 }, uSize: { value: 150 }, uDpr: { value: 1 }, uRise: { value: 1.55 }, uGain: { value: 0.5 } }),
    [],
  );
  const smokeUniforms = useMemo(() => ({ uAge: { value: 99 }, uSize: { value: 200 }, uDpr: { value: 1 }, uRise: { value: 1.55 } }), []);
  const glowUniforms = useMemo(() => ({ uAge: { value: 99 }, uGain: { value: 1 } }), []);

  useFrame((state) => {
    const m = mood.current;
    const age = m.bjAge;
    const active = age < DURATION;
    const warming = warmup.current < 3;
    if (warming) warmup.current++;
    if (group.current) group.current.visible = active || warming;
    if (particles.current) particles.current.visible = (active && !m.reduced) || warming;
    if (light.current) {
      const env = active ? Math.min(1, age / 0.06) * Math.exp(-age * 2.1) : 0;
      const flick = m.reduced ? 1 : 0.85 + 0.15 * Math.sin(age * 47) * Math.sin(age * 23);
      light.current.intensity = env * flick * (m.reduced ? 30 : 60);
    }
    if (!active) return;
    const dpr = state.viewport.dpr;
    const f = flameMat.current?.uniforms;
    const s = smokeMat.current?.uniforms;
    const g = glowMat.current?.uniforms;
    if (f) {
      f.uAge.value = age;
      f.uDpr.value = dpr;
    }
    if (s) {
      s.uAge.value = age;
      s.uDpr.value = dpr;
    }
    if (g) {
      g.uAge.value = age;
      g.uGain.value = m.reduced ? 0.6 : 1;
    }
  });

  return (
    <>
      <pointLight ref={light} position={[0, 1.3, 1.7]} color="#ff8a2a" intensity={0} distance={11} decay={1.5} />
      <group ref={group} visible={false}>
        <mesh geometry={glowGeometry} renderOrder={4}>
          <shaderMaterial
            ref={glowMat}
            args={[{ uniforms: glowUniforms, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG }]}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <group ref={particles}>
          <points geometry={smoke} frustumCulled={false} renderOrder={5}>
            <shaderMaterial
              ref={smokeMat}
              args={[{ uniforms: smokeUniforms, vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG }]}
              transparent
              depthWrite={false}
            />
          </points>
          <points geometry={flames} frustumCulled={false} renderOrder={6}>
            <shaderMaterial
              ref={flameMat}
              args={[{ uniforms: flameUniforms, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG }]}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </points>
        </group>
      </group>
    </>
  );
}
