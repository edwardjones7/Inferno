/**
 * Shared GLSL snippets and constants for the atmosphere (lamp beam, haze, embers, flame jet).
 */
import * as THREE from "three";

/** Cheap 2D value noise + 4-octave fbm. */
export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}
`;

/** The padded rail's centre line (matches table-body.tsx): x = cos(a)*RX, z = RAIL_Z0 + sin(a)*RZ, a in [0, PI]. */
export const RAIL = { rx: 4.28, rz: 5.28, z0: -2.6, y: 0.06, tube: 0.2 } as const;

/**
 * Pendant lamp placement. The camera looks down at ~45 degrees from (0, 5, 5.25), so the
 * shade has to hang fairly low for its lower half to peek into the top of the frame; at
 * these heights it sits in the strip above the dealer-side rail and never covers cards.
 */
export const LAMP = { x: 0, z: 0, y: 2.2, yNarrow: 2.55, topR: 0.46, floorR: 2.25 } as const;

/** Map heat -1..1 to a colour: cold <- neutral -> hot. Writes into `out`, no allocation. */
export function heatColor(out: THREE.Color, heat: number, cold: THREE.Color, neutral: THREE.Color, hot: THREE.Color) {
  out.copy(neutral);
  if (heat >= 0) out.lerp(hot, heat);
  else out.lerp(cold, -heat);
  return out;
}

/** Frame-rate independent exponential approach. */
export const damp = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));
