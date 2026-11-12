"use client";

/**
 * Per-card render rig: one shared, subdivided card geometry (front, back and a thin
 * paper edge) plus a small set of materials patched with onBeforeCompile for the bend,
 * rounded corners, burn-to-ash dissolve, blackjack gold flash and foil shimmer.
 *
 * All per-frame writes happen through CardRig methods so React components only hold
 * the instance and call into it from useFrame.
 */
import * as THREE from "three";
import type { Card } from "@/lib/blackjack/cards";
import { CARD } from "./canvas-utils";
import { cardBack, cardFace, cardFoilMask, isFoil, paperGrain } from "./card-textures";

export const CARD_THICKNESS = 0.003;
const RADIUS = 0.05;
const HW = CARD.w / 2;
const HH = CARD.h / 2;

/* --------------------------------------------------------------- geometry */

let sharedGeometry: THREE.BufferGeometry | null = null;

/**
 * Front and back are subdivided grids (so the card can bow); the rounded corners are
 * cut in the fragment shader. The edge is a strip that follows the rounded outline.
 * Groups: 0 = face, 1 = back, 2 = edge. Local frame: card in XY, face toward +Z.
 */
export function cardGeometry() {
  if (sharedGeometry) return sharedGeometry;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const t = CARD_THICKNESS / 2;
  const NX = 8;
  const NY = 12;

  const grid = (front: boolean) => {
    const base = pos.length / 3;
    for (let j = 0; j <= NY; j++) {
      for (let i = 0; i <= NX; i++) {
        const x = -HW + (i / NX) * CARD.w;
        const y = -HH + (j / NY) * CARD.h;
        pos.push(x, y, front ? t : -t);
        nrm.push(0, 0, front ? 1 : -1);
        uv.push(i / NX, front ? j / NY : 1 - j / NY);
      }
    }
    const start = idx.length;
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const a = base + j * (NX + 1) + i;
        const b = a + 1;
        const c = a + NX + 1;
        const d = c + 1;
        if (front) idx.push(a, b, d, a, d, c);
        else idx.push(a, d, b, a, c, d);
      }
    }
    return [start, idx.length - start] as const;
  };

  const face = grid(true);
  const back = grid(false);

  // rounded outline, walked counter-clockwise, with straight runs subdivided to bend
  const outline: [number, number, number, number][] = [];
  const corners: [number, number, number][] = [
    [HW - RADIUS, -HH + RADIUS, -Math.PI / 2],
    [HW - RADIUS, HH - RADIUS, 0],
    [-HW + RADIUS, HH - RADIUS, Math.PI / 2],
    [-HW + RADIUS, -HH + RADIUS, Math.PI],
  ];
  const ARC = 6;
  corners.forEach(([cx, cy, a0], k) => {
    for (let s = 0; s <= ARC; s++) {
      const a = a0 + (s / ARC) * (Math.PI / 2);
      outline.push([cx + Math.cos(a) * RADIUS, cy + Math.sin(a) * RADIUS, Math.cos(a), Math.sin(a)]);
    }
    const [nx, ny] = corners[(k + 1) % 4];
    const ex = cx + Math.cos(a0 + Math.PI / 2) * RADIUS;
    const ey = cy + Math.sin(a0 + Math.PI / 2) * RADIUS;
    const a1 = corners[(k + 1) % 4][2];
    const sx = nx + Math.cos(a1) * RADIUS;
    const sy = ny + Math.sin(a1) * RADIUS;
    const len = Math.hypot(sx - ex, sy - ey);
    const steps = Math.max(1, Math.round(len / 0.08));
    const n = [Math.cos(a0 + Math.PI / 2), Math.sin(a0 + Math.PI / 2)];
    for (let s = 1; s < steps; s++) {
      const f = s / steps;
      outline.push([ex + (sx - ex) * f, ey + (sy - ey) * f, n[0], n[1]]);
    }
  });
  const ebase = pos.length / 3;
  outline.forEach(([x, y, nx, ny], k) => {
    pos.push(x, y, t, x, y, -t);
    nrm.push(nx, ny, 0, nx, ny, 0);
    const u = k / outline.length;
    uv.push(u, 1, u, 0);
  });
  const estart = idx.length;
  for (let k = 0; k < outline.length; k++) {
    const a = ebase + k * 2;
    const b = ebase + ((k + 1) % outline.length) * 2;
    idx.push(a, a + 1, b + 1, a, b + 1, b);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.addGroup(face[0], face[1], 0);
  geo.addGroup(back[0], back[1], 1);
  geo.addGroup(estart, idx.length - estart, 2);
  geo.computeBoundingSphere();
  geo.boundingSphere!.radius += 0.12; // room for bend and curl
  sharedGeometry = geo;
  return geo;
}

let sharedParticles: THREE.BufferGeometry | null = null;
const PARTICLES = 72;

function particleGeometry() {
  if (sharedParticles) return sharedParticles;
  const geo = new THREE.BufferGeometry();
  const rand = new Float32Array(PARTICLES * 4);
  let s = 1234567;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < PARTICLES; i++) {
    rand[i * 4] = rnd() * 2 - 1;
    rand[i * 4 + 1] = rnd() * 2 - 1;
    rand[i * 4 + 2] = rnd();
    rand[i * 4 + 3] = rnd();
  }
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PARTICLES * 3), 3));
  geo.setAttribute("aRand", new THREE.BufferAttribute(rand, 4));
  sharedParticles = geo;
  return geo;
}

/* ---------------------------------------------------------------- shaders */

const COMMON = /* glsl */ `
uniform float uBurn;
uniform float uSeed;
uniform vec2 uBend;
uniform float uCurl;
varying vec2 vCard;
const vec2 CARD_HALF = vec2(${HW.toFixed(4)}, ${HH.toFixed(4)});
const float CARD_R = ${RADIUS.toFixed(4)};

float cHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float cNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), u.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float cFbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * cNoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
float cSdf(vec2 p) {
  vec2 q = abs(p) - CARD_HALF + CARD_R;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - CARD_R;
}
// low values burn first: the rim, a noisy front, and a seeded side the fire starts from
float cBurnField(vec2 p) {
  float inner = clamp(-cSdf(p) / CARD_HALF.x, 0.0, 1.0);
  float a = uSeed * 6.2832;
  return inner * 0.62 + cFbm(p * 5.5 + uSeed * 31.0) * 0.5 + dot(p, vec2(cos(a), sin(a))) * 0.35;
}
float cBurnFront() { return mix(-0.1, 1.16, uBurn); }
float cLift(vec2 p) {
  vec2 n = p / CARD_HALF;
  return uBend.x * (1.0 - n.x * n.x) + uBend.y * (1.0 - n.y * n.y) + uCurl * 0.5 * (n.x * n.x * n.x * n.x + n.y * n.y * n.y * n.y);
}
vec2 cLiftGrad(vec2 p) {
  vec2 n = p / CARD_HALF;
  return vec2(
    (-2.0 * uBend.x * n.x + 2.0 * uCurl * n.x * n.x * n.x) / CARD_HALF.x,
    (-2.0 * uBend.y * n.y + 2.0 * uCurl * n.y * n.y * n.y) / CARD_HALF.y
  );
}
`;

const FRAG_PARS = /* glsl */ `
uniform float uDim;
uniform float uTime;
uniform vec4 uGold; // sweep position, sweep amount, flash, rim glow
uniform float uFoil;
uniform float uFoilPhase;
uniform sampler2D uFoilMap;
`;

const VERT_NORMAL = /* glsl */ `
#include <beginnormal_vertex>
objectNormal = normalize(objectNormal + vec3(-cLiftGrad(position.xy), 0.0) * sign(objectNormal.z));
`;

const VERT_BEGIN = /* glsl */ `
#include <begin_vertex>
vCard = position.xy;
transformed.z += cLift(position.xy);
`;

const FRAG_CUT = /* glsl */ `
float cF = 1e3;
float cEmber = 0.0;
float cChar = 0.0;
if (uBurn > 0.0) {
  cF = cBurnField(vCard) - cBurnFront();
  if (cF < 0.0) discard;
  cEmber = 1.0 - smoothstep(0.0, 0.045, cF);
  cChar = 1.0 - smoothstep(0.0, 0.2, cF);
}
if (cSdf(vCard) > 0.0015) discard;
`;

const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
${FRAG_CUT}
diffuseColor.rgb *= mix(1.0, 0.42, uDim);
diffuseColor.rgb *= mix(vec3(1.0), vec3(0.78, 0.6, 0.44), smoothstep(0.0, 0.6, uBurn) * 0.7);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.028, 0.02), cChar * cChar * 0.96);
`;

const FRAG_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
if (uBurn > 0.0) {
  float flick = 0.7 + 0.3 * cNoise(vCard * 18.0 + vec2(uTime * 5.0, -uTime * 3.0));
  vec3 hot = mix(vec3(4.5, 0.9, 0.08), vec3(7.0, 4.2, 1.2), cEmber * cEmber);
  totalEmissiveRadiance += hot * cEmber * flick;
  totalEmissiveRadiance += vec3(0.55, 0.09, 0.01) * max(cChar - cEmber, 0.0) * cChar * cChar * flick;
}
if (uGold.w > 0.0) {
  float rim = 1.0 - clamp(-cSdf(vCard) / 0.045, 0.0, 1.0);
  totalEmissiveRadiance += vec3(2.4, 1.5, 0.42) * rim * rim * uGold.w;
}
#if CARD_SIDE == 0
if (uGold.y > 0.0 || uGold.z > 0.0) {
  float sw = dot(vCard / CARD_HALF, vec2(0.8762, 0.4819));
  float band = exp(-pow((sw - uGold.x) * 3.4, 2.0));
  float luma = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  totalEmissiveRadiance += vec3(3.4, 2.3, 0.7) * band * uGold.y * (0.35 + 0.65 * luma);
  totalEmissiveRadiance += vec3(0.95, 0.62, 0.16) * uGold.z;
}
#endif
`;

const FRAG_FOIL = /* glsl */ `
#if CARD_SIDE == 0
if (uFoil > 0.0) {
  float fm = texture2D(uFoilMap, vCard / (2.0 * CARD_HALF) + 0.5).r * uFoil;
  if (fm > 0.003) {
    vec3 V = normalize(vViewPosition);
    vec3 N = normalize(normal);
    vec3 R = reflect(-V, N);
    float ph = R.x * 1.6 + R.y * 1.2 + dot(vCard, vec2(2.1, 3.4)) + uFoilPhase;
    vec3 film = 0.62 + 0.38 * cos(6.2832 * (ph * 0.55 + vec3(0.0, 0.13, 0.31)));
    film = mix(film, vec3(1.0, 0.76, 0.36), 0.5);
    float streak = pow(0.5 + 0.5 * sin(ph * 3.1 + vCard.y * 7.0), 8.0);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);
    vec3 foil = film * (0.12 + 0.6 * streak + 0.35 * fres) * mix(1.0, 0.45, uDim) * (1.0 - cChar);
    float inkL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    outgoingLight = mix(outgoingLight, outgoingLight * 0.5 + foil * mix(0.35, 1.0, smoothstep(0.05, 0.6, inkL)), fm);
  }
}
#endif
#include <opaque_fragment>
`;

type Uniforms = {
  uBurn: { value: number };
  uSeed: { value: number };
  uBend: { value: THREE.Vector2 };
  uCurl: { value: number };
  uDim: { value: number };
  uTime: { value: number };
  uGold: { value: THREE.Vector4 };
  uFoil: { value: number };
  uFoilPhase: { value: number };
  uFoilMap: { value: THREE.Texture };
};

function patchSurface(material: THREE.Material, side: 0 | 1 | 2, u: Uniforms) {
  material.defines = { ...(material.defines ?? {}), CARD_SIDE: side };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${COMMON}`)
      .replace("#include <beginnormal_vertex>", VERT_NORMAL)
      .replace("#include <begin_vertex>", VERT_BEGIN);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${COMMON}\n${FRAG_PARS}`)
      .replace("#include <color_fragment>", FRAG_COLOR)
      .replace("#include <emissivemap_fragment>", FRAG_EMISSIVE)
      .replace("#include <opaque_fragment>", FRAG_FOIL);
  };
}

function patchDepth(material: THREE.MeshDepthMaterial, u: Uniforms) {
  material.defines = { ...(material.defines ?? {}), CARD_DEPTH: 1 };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${COMMON}`)
      .replace("#include <begin_vertex>", VERT_BEGIN);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${COMMON}`)
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
if (uBurn > 0.0 && cBurnField(vCard) - cBurnFront() < 0.0) discard;
if (cSdf(vCard) > 0.0015) discard;`,
      );
  };
}

const PARTICLE_VERT = /* glsl */ `
uniform float uBurn;
uniform float uSeed;
uniform float uProg;
uniform float uViewH;
uniform float uCurl;
uniform vec2 uBend;
attribute vec4 aRand;
varying float vAge;
varying float vAsh;
${COMMON.replace(/uniform[^\n]*\n/g, "").replace("varying vec2 vCard;", "")}
void main() {
  vec2 p = aRand.xy * (CARD_HALF - 0.02);
  // each mote is born when the burn front reaches its spot on the card
  float born = clamp((cBurnField(p) + 0.1) / 1.26, 0.0, 1.0);
  float life = 0.35 + aRand.w * 0.55;
  float age = (uProg - born) / life;
  vAge = age;
  vAsh = step(0.45, fract(aRand.w * 7.13 + uSeed));
  float a = clamp(age, 0.0, 1.0);
  vec3 pos = vec3(p.x, 0.01 + cLift(p) * 0.6, -p.y);
  pos.y += a * (0.28 + aRand.w * 0.5) + a * a * 0.15;
  pos.x += sin(a * 5.0 + aRand.x * 9.0) * 0.05 * a + a * 0.08 * aRand.y;
  pos.z += cos(a * 4.0 + aRand.y * 7.0) * 0.04 * a;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float alive = step(0.0, age) * step(age, 1.0);
  float size = mix(0.014, 0.026, aRand.z) * (vAsh > 0.5 ? 1.2 : 0.7) * (1.0 - 0.35 * a);
  gl_PointSize = alive * size * projectionMatrix[1][1] * uViewH * 0.5 / max(-mv.z, 0.1);
}
`;

const PARTICLE_FRAG = /* glsl */ `
varying float vAge;
varying float vAsh;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = dot(c, c);
  if (r > 1.0) discard;
  float a = clamp(vAge, 0.0, 1.0);
  vec3 ember = mix(vec3(6.0, 2.4, 0.5), vec3(1.6, 0.25, 0.03), a);
  vec3 ash = mix(vec3(1.4, 0.45, 0.08), vec3(0.09, 0.075, 0.065), smoothstep(0.0, 0.3, a));
  vec3 col = mix(ember, ash, vAsh);
  float alpha = (1.0 - r) * (1.0 - a) * mix(1.0, 0.85, vAsh);
  gl_FragColor = vec4(col, alpha);
}
`;

/* ------------------------------------------------------------------ rig */

export interface CardFrame {
  time: number;
  dt: number;
  /** 0..1 dim amount target */
  dim: boolean;
  /** burn progress in [0, ~2]; > 1 lets the ash finish drifting */
  burn: number;
  bend: THREE.Vector2;
  curl: number;
  /** gold: sweep position, sweep amount, flash, rim glow */
  gold: THREE.Vector4;
  foilPhase: number;
  viewH: number;
}

export class CardRig {
  readonly face: THREE.MeshPhysicalMaterial;
  readonly back: THREE.MeshPhysicalMaterial;
  readonly edge: THREE.MeshStandardMaterial;
  readonly depth: THREE.MeshDepthMaterial;
  readonly particles: THREE.ShaderMaterial;
  readonly materials: THREE.Material[];
  private readonly u: Uniforms;
  private readonly pu: { uBurn: { value: number }; uSeed: { value: number }; uProg: { value: number }; uViewH: { value: number }; uCurl: { value: number }; uBend: { value: THREE.Vector2 } };
  private card: Card | null | undefined = undefined;

  constructor(seed: number) {
    const grain = paperGrain();
    this.u = {
      uBurn: { value: 0 },
      uSeed: { value: seed },
      uBend: { value: new THREE.Vector2() },
      uCurl: { value: 0 },
      uDim: { value: 0 },
      uTime: { value: 0 },
      uGold: { value: new THREE.Vector4(-3, 0, 0, 0) },
      uFoil: { value: 0 },
      uFoilPhase: { value: seed * 10 },
      uFoilMap: { value: grain },
    };
    this.face = new THREE.MeshPhysicalMaterial({
      map: cardBack(),
      roughness: 0.52,
      roughnessMap: grain,
      bumpMap: grain,
      bumpScale: 0.35,
      clearcoat: 0.22,
      clearcoatRoughness: 0.38,
    });
    this.back = new THREE.MeshPhysicalMaterial({
      map: cardBack(),
      roughness: 0.46,
      roughnessMap: grain,
      bumpMap: grain,
      bumpScale: 0.3,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
    });
    this.edge = new THREE.MeshStandardMaterial({ color: "#eadcc6", roughness: 0.88 });
    this.depth = new THREE.MeshDepthMaterial();
    patchSurface(this.face, 0, this.u);
    patchSurface(this.back, 1, this.u);
    patchSurface(this.edge, 2, this.u);
    patchDepth(this.depth, this.u);
    this.materials = [this.face, this.back, this.edge];

    this.pu = {
      uBurn: this.u.uBurn,
      uSeed: this.u.uSeed,
      uCurl: this.u.uCurl,
      uBend: this.u.uBend,
      uProg: { value: 0 },
      uViewH: { value: 800 },
    };
    this.particles = new THREE.ShaderMaterial({
      uniforms: this.pu,
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
  }

  get particleGeometry() {
    return particleGeometry();
  }

  /** Swap the face art (a hole card becomes known mid-round). */
  setCard(card: Card | null) {
    if (card === this.card) return;
    this.card = card;
    this.face.map = card ? cardFace(card) : cardBack();
    const foil = !!card && isFoil(card);
    this.u.uFoil.value = foil ? 1 : 0;
    if (card && foil) this.u.uFoilMap.value = cardFoilMask(card);
  }

  frame(f: CardFrame) {
    const u = this.u;
    u.uTime.value = f.time;
    u.uDim.value += ((f.dim ? 1 : 0) - u.uDim.value) * (1 - Math.exp(-f.dt * 4));
    u.uBurn.value = Math.min(1, Math.max(0, f.burn));
    u.uBend.value.copy(f.bend);
    u.uCurl.value = f.curl;
    u.uGold.value.copy(f.gold);
    u.uFoilPhase.value = f.foilPhase;
    this.pu.uProg.value = f.burn;
    this.pu.uViewH.value = f.viewH;
  }

  dispose() {
    for (const m of [...this.materials, this.depth, this.particles]) m.dispose();
  }
}
