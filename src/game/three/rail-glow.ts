"use client";

/**
 * The thin warm line where the rail meets the felt: lamp light pooling along a brass
 * groove, like a coal that never quite goes out. Below the bloom threshold at neutral,
 * it warms up and blooms a little when the table runs hot and all but dies when it runs
 * cold. Uniform values are driven by the table bodies.
 */

export function railGlowUniforms(length: number) {
  return {
    /** seconds, for the slow breathing (frozen for reduced motion) */
    uTime: { value: 0 },
    /** damped session heat, -1 .. 1 */
    uHeat: { value: 0 },
    /** 0..1 flare on a win / blackjack */
    uFlare: { value: 0 },
    /** world length of the tube, so the variation along it has a fixed scale */
    uLength: { value: length },
  };
}

type Uniforms = Record<string, { value: unknown }>;

export const railGlowVertex = /* glsl */ `
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

export const railGlowFragment = /* glsl */ `
uniform float uTime;
uniform float uHeat;
uniform float uFlare;
uniform float uLength;
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vViewDir;
void main() {
  float hot = clamp(uHeat, 0.0, 1.0);
  float cold = clamp(-uHeat, 0.0, 1.0);
  float along = vUv.x * uLength;
  // slow, uneven breathing along the groove, like coals
  float breathe = 0.9 + 0.1 * sin(uTime * 0.7 + along * 0.9) * sin(uTime * 0.43 + along * 0.37);
  float level = mix(0.42, 1.25, hot) * (1.0 - 0.8 * cold) * breathe + 0.9 * uFlare;
  vec3 col = vec3(1.0, 0.46, 0.15) * level;
  float facing = clamp(dot(normalize(vNormalV), normalize(vViewDir)), 0.0, 1.0);
  col *= 0.65 + 0.45 * facing;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Write the glow's per-frame values into its material's uniforms (call from useFrame). */
export function stepRailGlow(mat: { uniforms: Uniforms } | null, heat: number, flare: number, time: number, calm: boolean) {
  if (!mat) return;
  const u = mat.uniforms;
  u.uHeat.value = heat;
  u.uFlare.value = flare;
  u.uTime.value = calm ? 0 : time;
}
