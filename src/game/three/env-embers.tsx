"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { prng } from "./canvas-utils";
import type { MoodRef } from "./env-mood";

const EMBER_COUNT = 420;
const ASH_COUNT = 170;
const HEIGHT = 3.3;

const EMBER = new THREE.Color(1.0, 0.5, 0.18);
const EMBER_HOT = new THREE.Color(1.0, 0.42, 0.1);
const ASHEN = new THREE.Color(0.42, 0.38, 0.36);

function scatter(count: number, seed: number) {
  const rand = prng(seed);
  const pos = new Float32Array(count * 3);
  const r = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rand() - 0.5) * 10.5;
    pos[i * 3 + 1] = rand(); // life phase
    pos[i * 3 + 2] = -3.4 + rand() * 6.6;
    r[i * 4] = rand();
    r[i * 4 + 1] = rand();
    r[i * 4 + 2] = rand();
    r[i * 4 + 3] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aRand", new THREE.BufferAttribute(r, 4));
  return g;
}

const EMBER_VERT = /* glsl */ `
uniform float uTime;
uniform float uDensity;
uniform float uSize;
uniform float uDpr;
uniform float uFlicker;
attribute vec4 aRand;
varying float vAlpha;
varying float vHeat;
void main() {
  float speed = mix(0.14, 0.46, aRand.x);
  float life = fract(position.y + uTime * speed / ${HEIGHT.toFixed(2)});
  vec3 p = vec3(position.x, life * ${HEIGHT.toFixed(2)} - 0.15, position.z);
  float sw = uTime * (0.5 + aRand.y) + aRand.w * 6.2831;
  p.x += sin(sw) * 0.2 * (0.3 + life);
  p.z += cos(sw * 0.8) * 0.15 * (0.3 + life);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float visible = step(aRand.w, uDensity);
  float flicker = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * 11.0 * (0.4 + aRand.y) + aRand.x * 40.0));
  vAlpha = visible * smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.55, 1.0, life)) * flicker;
  vHeat = 1.0 - life;
  gl_PointSize = visible * uSize * (0.45 + aRand.z) * mix(1.0, 0.45, life) * uDpr / -mv.z;
}
`;

const EMBER_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uBright;
varying float vAlpha;
varying float vHeat;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  vec3 col = uColor * uBright * (0.45 + 0.9 * vHeat);
  gl_FragColor = vec4(col, a * vAlpha);
}
`;

const ASH_VERT = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform float uDpr;
attribute vec4 aRand;
varying float vAlpha;
void main() {
  float speed = mix(0.07, 0.2, aRand.x);
  float life = fract(position.y + uTime * speed / ${HEIGHT.toFixed(2)});
  // falls from the top down to the felt
  vec3 p = vec3(position.x, (1.0 - life) * ${HEIGHT.toFixed(2)}, position.z);
  float sw = uTime * (0.35 + 0.5 * aRand.y) + aRand.w * 6.2831;
  p.x += sin(sw) * 0.35;
  p.z += sin(sw * 0.7 + 1.3) * 0.2;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  // tumbling flake: size pulses as it turns
  float tumble = 0.55 + 0.45 * abs(sin(uTime * (1.5 + 2.0 * aRand.z) + aRand.w * 9.0));
  vAlpha = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.85, 1.0, life)) * (0.4 + 0.6 * tumble);
  gl_PointSize = uSize * (0.5 + aRand.z) * tumble * uDpr / -mv.z;
}
`;

const ASH_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c * vec2(1.0, 1.6));
  float a = smoothstep(0.5, 0.2, d);
  gl_FragColor = vec4(uColor, a * vAlpha * uOpacity);
}
`;

/**
 * Rising embers (density, speed and brightness follow heat) plus a layer of drifting grey ash
 * that shows up when the table runs cold or right after a loss. Two fixed-size Points, two draws.
 */
export function Embers({ mood }: { mood: MoodRef }) {
  const emberMat = useRef<THREE.ShaderMaterial>(null);
  const ashMat = useRef<THREE.ShaderMaterial>(null);
  const embers = useMemo(() => scatter(EMBER_COUNT, 0xe3b3), []);
  const ash = useMemo(() => scatter(ASH_COUNT, 0xa54), []);
  const emberUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDensity: { value: 0.3 },
      uSize: { value: 38 },
      uDpr: { value: 1 },
      uFlicker: { value: 0.35 },
      uColor: { value: EMBER.clone() },
      uBright: { value: 1.6 },
    }),
    [],
  );
  const ashUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uSize: { value: 30 }, uDpr: { value: 1 }, uColor: { value: ASHEN.clone() }, uOpacity: { value: 0 } }),
    [],
  );

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const m = mood.current;
    const e = emberMat.current?.uniforms;
    const a = ashMat.current?.uniforms;
    if (!e || !a) return;
    const dpr = state.viewport.dpr;
    const bj = m.bjAge < 2.5 ? Math.exp(-m.bjAge * 1.3) : 0;
    const surge = Math.max(m.win * 0.6, bj);

    const speed = (1 + 1.4 * m.hot - 0.6 * m.cold + 1.5 * surge) * (m.reduced ? 0.3 : 1);
    e.uTime.value += dt * speed;
    e.uDpr.value = dpr;
    e.uDensity.value = Math.min(1, 0.3 + 0.7 * m.hot - 0.2 * m.cold + 0.5 * surge);
    e.uBright.value = (1.6 + 1.5 * m.hot - 0.95 * m.cold) * (1 - 0.3 * m.lose) * (1 + 0.8 * surge);
    e.uFlicker.value = m.reduced ? 0 : 0.35;
    const c = e.uColor.value as THREE.Color;
    c.copy(EMBER).lerp(EMBER_HOT, m.hot).lerp(ASHEN, m.cold * 0.7);

    a.uTime.value += dt * (m.reduced ? 0.4 : 1);
    a.uDpr.value = dpr;
    a.uOpacity.value = Math.min(1, m.cold * 0.85 + m.lose * 0.8);
  });

  return (
    <>
      <points geometry={embers} frustumCulled={false} renderOrder={3}>
        <shaderMaterial
          ref={emberMat}
          args={[{ uniforms: emberUniforms, vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG }]}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <points geometry={ash} frustumCulled={false} renderOrder={3}>
        <shaderMaterial
          ref={ashMat}
          args={[{ uniforms: ashUniforms, vertexShader: ASH_VERT, fragmentShader: ASH_FRAG }]}
          transparent
          depthWrite={false}
        />
      </points>
    </>
  );
}
