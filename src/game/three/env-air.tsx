"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { prng } from "./canvas-utils";
import { heatColor, LAMP, NOISE_GLSL } from "./env-glsl";
import type { MoodRef } from "./env-mood";

/* The air of the back room: dust motes that only show where the lamp catches them, and
   thin ribbons of cigarette smoke curling up through the light cone. */

const DUST_COLD = new THREE.Color(0.7, 0.76, 0.9);
const DUST_NEUTRAL = new THREE.Color(1.0, 0.82, 0.6);
const DUST_HOT = new THREE.Color(1.0, 0.72, 0.45);
const SMOKE_COLD = new THREE.Color(0.55, 0.6, 0.7);
const SMOKE_NEUTRAL = new THREE.Color(0.8, 0.7, 0.6);
const SMOKE_HOT = new THREE.Color(0.85, 0.68, 0.52);

/** Lamp-cone test shared by the dust and the smoke: 1 inside the light, 0 outside. */
const CONE_GLSL = /* glsl */ `
uniform float uLampY;
uniform vec2 uRadii;
uniform vec2 uAxis;
float coneLit(vec3 w) {
  float h = clamp(w.y / uLampY, 0.0, 1.0);
  float r = mix(uRadii.y, uRadii.x, h);
  float d = length(w.xz - uAxis);
  return (1.0 - smoothstep(0.5 * r, 1.08 * r, d)) * (0.45 + 0.55 * h);
}
`;

const coneUniforms = (lampY: number) => ({
  uLampY: { value: lampY },
  uRadii: { value: new THREE.Vector2(LAMP.topR, LAMP.floorR) },
  uAxis: { value: new THREE.Vector2(LAMP.x, LAMP.z) },
});

/* ------------------------------------------------------------------ dust */

const DUST_VERT = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform float uDpr;
attribute vec4 aRand;
varying float vAlpha;
${CONE_GLSL}
void main() {
  float t = uTime;
  vec3 p = position;
  // slow air currents: each mote rises or sinks a little and wanders, wrapping in height
  float y = fract(position.y + t * (aRand.x - 0.5) * 0.025) * uLampY;
  p.y = y;
  p.x += sin(t * (0.09 + 0.16 * aRand.y) + aRand.w * 6.2831) * 0.32 + sin(t * (0.3 + 0.3 * aRand.z) + aRand.x * 9.0) * 0.05;
  p.z += cos(t * (0.08 + 0.14 * aRand.z) + aRand.y * 6.2831) * 0.28;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  // cone test in object space, so a scaled / moved copy (the Home room's stations) still works
  float lit = coneLit(p);
  // motes turn as they drift and catch the light now and then
  float glint = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(t * (0.7 + 1.5 * aRand.y) + aRand.w * 40.0), 3.0);
  float h = y / uLampY;
  float fade = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.82, 1.0, h));
  vAlpha = (0.04 + 0.96 * lit) * glint * fade;
  gl_PointSize = uSize * (0.45 + aRand.z) * uDpr / -mv.z;
}
`;

const DUST_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uBright;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(uColor * uBright, a * a * vAlpha);
}
`;

function dustGeometry(count: number) {
  const rand = prng(0xd057);
  const pos = new Float32Array(count * 3);
  const r = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    // denser near the lamp's axis, where they'll be seen
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * 2.6;
    pos[i * 3] = LAMP.x + Math.cos(a) * d;
    pos[i * 3 + 1] = rand();
    pos[i * 3 + 2] = LAMP.z + Math.sin(a) * d;
    for (let k = 0; k < 4; k++) r[i * 4 + k] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aRand", new THREE.BufferAttribute(r, 4));
  return g;
}

/**
 * Dust motes drifting in the lamp light. Outside the cone they all but vanish. They swirl
 * up when you win (the air stirs), brighten and warm when the table runs hot, and go dim
 * and cool when it runs cold. One draw.
 */
export function Dust({ mood, lampY, count }: { mood: MoodRef; lampY: number; count: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => dustGeometry(count), [count]);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uSize: { value: 15 }, uDpr: { value: 1 }, uColor: { value: DUST_NEUTRAL.clone() }, uBright: { value: 1 }, ...coneUniforms(lampY) }),
    [lampY],
  );

  useFrame((state, rawDt) => {
    const u = mat.current?.uniforms;
    if (!u) return;
    const dt = Math.min(rawDt, 0.1);
    const m = mood.current;
    const bj = m.bjAge < 2.5 ? Math.exp(-m.bjAge * 1.4) : 0;
    const stir = Math.max(m.win, bj);
    u.uTime.value += dt * (1 + 3.5 * stir + 0.4 * m.hot - 0.3 * m.cold) * (m.reduced ? 0.3 : 1);
    u.uDpr.value = state.viewport.dpr;
    heatColor(u.uColor.value, m.heat, DUST_COLD, DUST_NEUTRAL, DUST_HOT);
    u.uBright.value = (0.95 + 0.35 * m.hot - 0.4 * m.cold + 0.6 * stir) * (1 - 0.35 * m.lose);
  });

  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={3}>
      <shaderMaterial
        ref={mat}
        args={[{ uniforms, vertexShader: DUST_VERT, fragmentShader: DUST_FRAG }]}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ------------------------------------------------------------------ smoke */

export interface Wisp {
  /** where the plume starts (world) */
  at: [number, number, number];
  /** height of the plume */
  h: number;
  /** width of the billboard (how far it can wander sideways) */
  w: number;
  /** horizontal drift per unit of height (world x, z) */
  lean: [number, number];
  /** 0 = rises from a source (a cigar); > 0 = fades in mid-air (smoke from off-screen) */
  fadeIn: number;
  /** how strongly it shows outside the lamp light (a lit cigar's own plume) */
  base?: number;
}

const SMOKE_VERT = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aWisp;   // seed, width, height, fadeIn
attribute vec3 aLean;   // lean x, lean z, base visibility
varying vec2 vLocal;
varying vec3 vWorld;
varying vec4 vWisp;
varying float vBase;
void main() {
  vec3 o = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 toCam = cameraPosition - o;
  toCam.y = 0.0;
  vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-5, 0.0, 0.0));
  float y = aCorner.y * aWisp.z;
  vec3 wp = o + right * aCorner.x * aWisp.y * 0.5 + vec3(aLean.x * y, y, aLean.y * y);
  vLocal = vec2(aCorner.x * aWisp.y * 0.5, y);
  vWorld = wp;
  vWisp = aWisp;
  vBase = aLean.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const SMOKE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 vLocal;
varying vec3 vWorld;
varying vec4 vWisp;
varying float vBase;
${NOISE_GLSL}
${CONE_GLSL}
float band(float x, float c, float w) { float d = (x - c) / w; return exp(-d * d); }
void main() {
  float s = vWisp.x;
  float halfW = vWisp.y * 0.5;
  float H = vWisp.z;
  float x = vLocal.x;
  float y = vLocal.y;
  float k = y / H;
  float t = uTime;
  // the plume's centre line: a lazy sway that grows with height, plus a slow wander
  float wob = fbm(vec2(y * 0.8 - t * 0.16, s * 7.0)) - 0.5;
  float sway = sin(y * 2.6 - t * 0.6 + s * 6.2831) * (0.06 + 0.22 * k);
  float c1 = (sway + wob * 1.1 * k) * halfW;
  float c2 = c1 + sin(y * 4.1 - t * 0.9 + s * 3.0) * 0.12 * halfW * (0.3 + k);
  float w = halfW * (0.03 + 0.3 * k);
  float a = band(x, c1, w) + 0.55 * band(x, c2, w * 0.7);
  // higher up the ribbon tears into curls and drifts apart
  vec2 q = vec2(x * 2.4, y * 1.5 - t * 0.3) + s * 13.0;
  float n = fbm(q + 1.3 * vec2(fbm(q * 0.8 + t * 0.04), fbm(q * 0.8 - 4.0)));
  a *= mix(1.0, smoothstep(0.32, 0.78, n) * 1.7, smoothstep(0.05, 0.55, k));
  a *= smoothstep(vWisp.w, vWisp.w + 0.22, k) * (1.0 - smoothstep(0.55, 1.0, k));
  a *= 1.0 - smoothstep(0.8, 1.0, abs(x) / halfW);
  float lit = max(coneLit(vWorld), vBase * (1.0 - k));
  float alpha = a * uOpacity * lit;
  if (!(alpha > 0.002)) discard;
  gl_FragColor = vec4(uColor, min(alpha, 1.0));
}
`;

function wispGeometry(wisps: readonly Wisp[]) {
  const rand = prng(0x5307e);
  const pos: number[] = [];
  const corner: number[] = [];
  const wisp: number[] = [];
  const lean: number[] = [];
  const index: number[] = [];
  const corners = [-1, 0, 1, 0, 1, 1, -1, 1];
  wisps.forEach((wp, i) => {
    const seed = rand();
    for (let k = 0; k < 4; k++) {
      pos.push(...wp.at);
      corner.push(corners[k * 2], corners[k * 2 + 1]);
      wisp.push(seed, wp.w, wp.h, wp.fadeIn);
      lean.push(wp.lean[0], wp.lean[1], wp.base ?? 0);
    }
    const b = i * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aCorner", new THREE.Float32BufferAttribute(corner, 2));
  g.setAttribute("aWisp", new THREE.Float32BufferAttribute(wisp, 4));
  g.setAttribute("aLean", new THREE.Float32BufferAttribute(lean, 3));
  g.setIndex(index);
  return g;
}

/**
 * Thin ribbons of cigarette smoke curling up through the lamp light (one draw for all of
 * them). A plume with `base` > 0 also shows a little outside the light, near its source.
 * Positions are world space (the cone test uses world coordinates).
 */
export function SmokeWisps({ wisps, mood, lampY }: { wisps: readonly Wisp[]; mood: MoodRef; lampY: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => wispGeometry(wisps), [wisps]);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uOpacity: { value: 0.3 }, uColor: { value: SMOKE_NEUTRAL.clone() }, ...coneUniforms(lampY) }),
    [lampY],
  );

  useFrame((_, rawDt) => {
    const u = mat.current?.uniforms;
    if (!u) return;
    const m = mood.current;
    u.uTime.value += Math.min(rawDt, 0.1) * (m.reduced ? 0.25 : 1);
    heatColor(u.uColor.value, m.heat, SMOKE_COLD, SMOKE_NEUTRAL, SMOKE_HOT);
    u.uOpacity.value = 0.3 * (1 - 0.2 * m.cold);
  });

  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={2}>
      <shaderMaterial
        ref={mat}
        args={[{ uniforms, vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG }]}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
