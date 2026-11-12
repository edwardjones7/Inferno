/**
 * Critically damped spring (exact closed-form step, stable for any dt). Never overshoots
 * when starting from rest, so it is safe for camera moves and effect ramps.
 * `omega` sets the speed: the remaining error is ~1% after 6.6 / omega seconds.
 */
export interface Spring {
  x: number;
  v: number;
}

export function stepSpring(s: Spring, target: number, omega: number, dt: number) {
  const d = s.x - target;
  const k = s.v + omega * d;
  const e = Math.exp(-omega * dt);
  s.x = target + (d + k * dt) * e;
  s.v = (s.v - omega * k * dt) * e;
  // settle exactly so the resting pose is pixel-identical to the static one
  if (Math.abs(s.x - target) < 1e-4 && Math.abs(s.v) < 1e-3) {
    s.x = target;
    s.v = 0;
  }
  return s.x;
}
