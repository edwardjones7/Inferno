"use client";

/**
 * Shaders for the table's molten parts: the flowing lava seam tube and the shimmer
 * patch for the felt cracks. Uniform values are driven from table-body.tsx.
 */
import * as THREE from "three";

const NOISE = /* glsl */ `
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm3(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int k = 0; k < 4; k++) { s += a * vnoise3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s / 0.9375;
}
`;

export function lavaSeamUniforms(length: number) {
  return {
    /** integrated flow distance (advanced on the CPU so speed changes never jump) */
    uFlow: { value: 0 },
    /** seconds, for the pulse */
    uTime: { value: 0 },
    /** damped session heat, -1 .. 1 */
    uHeat: { value: 0 },
    /** pulse amount, 0 when reduced motion is requested */
    uPulse: { value: 1 },
    /** world length of the tube, so noise is isotropic along it */
    uLength: { value: length },
  };
}

export const lavaSeamVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vViewDir;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

export const lavaSeamFragment = /* glsl */ `
uniform float uFlow;
uniform float uTime;
uniform float uHeat;
uniform float uPulse;
uniform float uLength;
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vViewDir;
${NOISE}
void main() {
  float hot = clamp(uHeat, 0.0, 1.0);
  float cold = clamp(-uHeat, 0.0, 1.0);
  float ang = vUv.y * 6.2831853;
  float along = vUv.x * uLength;

  // isotropic coordinates on the tube surface (the tube is ~0.02 thick, so the
  // circumference only gets a hint of variation)
  vec3 p = vec3(along * 7.0, cos(ang) * 0.6, sin(ang) * 0.6);
  vec3 q = p - vec3(uFlow * 7.0, 0.0, 0.0);
  float warp = fbm3(q * 0.7 + vec3(0.0, uFlow * 0.9, 0.0));
  float n = fbm3(q + vec3(warp * 2.2, warp * 1.3, uFlow * 0.35));
  // ridged noise -> thin bright veins
  float ridge = 1.0 - abs(n * 2.0 - 1.0);
  float veins = pow(ridge, mix(mix(7.0, 12.0, cold), 4.5, hot));
  float body = smoothstep(0.2, 0.85, n);

  float pulse = 1.0 + uPulse * (0.1 + 0.08 * hot) * sin(uTime * mix(1.2, 2.6, hot) + along * 1.3);

  vec3 deep = mix(vec3(1.6, 0.26, 0.05), vec3(2.6, 0.62, 0.1), hot);
  deep = mix(deep, vec3(0.22, 0.015, 0.012), cold);
  vec3 bright = mix(vec3(3.2, 1.0, 0.22), vec3(5.0, 2.2, 0.6), hot);
  bright = mix(bright, vec3(0.75, 0.08, 0.03), cold);
  vec3 vein = mix(vec3(6.0, 3.8, 1.5), vec3(10.0, 8.0, 4.6), hot);
  vein = mix(vein, vec3(1.3, 0.22, 0.06), cold);

  vec3 col = mix(deep, bright, body) + vein * veins;

  // cooling crust: grey patches that drift slowly and leave the veins alive between them
  float crustN = fbm3(p * 0.35 - vec3(uFlow * 1.5, 0.0, 0.0));
  float crust = smoothstep(0.42, 0.62, crustN) * smoothstep(0.0, 1.0, cold * 1.4);
  crust *= 1.0 - smoothstep(0.25, 0.6, veins);
  vec3 crustCol = vec3(0.05, 0.045, 0.042) * (0.6 + 0.8 * vnoise3(p * 3.0));
  col = mix(col, crustCol, crust * 0.92);

  // a touch brighter where the tube faces the viewer (molten core shows through)
  float facing = clamp(dot(normalize(vNormalV), normalize(vViewDir)), 0.0, 1.0);
  col *= (0.7 + 0.45 * facing) * pulse;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Shared uniforms for the felt crack shimmer (patched into the felt material). */
export function crackUniforms() {
  return { uCrackTime: { value: 0 } };
}

/**
 * Patches a lit material whose emissiveMap is the crack mask so the glow crawls
 * through the cracks instead of glowing flat.
 */
export function patchCrackShimmer(shader: THREE.WebGLProgramParametersWithUniforms, uniforms: ReturnType<typeof crackUniforms>) {
  shader.uniforms.uCrackTime = uniforms.uCrackTime;
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      /* glsl */ `#include <common>
uniform float uCrackTime;
float crackHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float crackNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(crackHash(i), crackHash(i + vec2(1, 0)), f.x), mix(crackHash(i + vec2(0, 1)), crackHash(i + vec2(1, 1)), f.x), f.y);
}`,
    )
    .replace(
      "#include <emissivemap_fragment>",
      /* glsl */ `#include <emissivemap_fragment>
#ifdef USE_EMISSIVEMAP
  vec2 cp = vEmissiveMapUv * vec2(90.0, 56.0);
  float shimmer = crackNoise(cp + vec2(uCrackTime * 0.35, -uCrackTime * 0.22)) * 0.6
                + crackNoise(cp * 2.3 - vec2(uCrackTime * 0.5, uCrackTime * 0.3)) * 0.4;
  totalEmissiveRadiance *= 0.35 + 1.3 * shimmer;
#endif`,
    );
}
