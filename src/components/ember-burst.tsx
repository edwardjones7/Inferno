"use client";

import { motion } from "motion/react";
import { useMemo } from "react";

/** Deterministic hash noise in [0,1) so renders stay pure. */
const noise = (i: number, seed: number) => {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * One-shot payoff for wins: sparks thrown off like a struck match (short bright streaks
 * that arc up and fall away, cooling from white-gold to ember) and a curl of smoke left
 * behind. Re-mount (via key) to fire again.
 */
export function EmberBurst({ count = 36, intensity = 1, seed = 1 }: { count?: number; intensity?: number; seed?: number }) {
  const sparks = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const r = (k: number) => noise(i * 7 + k, seed);
        // fan upward: angles mostly in the top half, a few spilling sideways
        const angle = -Math.PI / 2 + (r(0) - 0.5) * Math.PI * 1.25;
        const dist = (70 + r(1) * 170) * intensity;
        const x = Math.cos(angle) * dist;
        const peak = Math.sin(angle) * dist * 0.8;
        return {
          x,
          peak,
          fall: peak + 90 + r(2) * 80,
          len: 6 + r(3) * 10,
          rot: (angle * 180) / Math.PI,
          dur: 0.7 + r(4) * 0.7,
          delay: r(5) * 0.08,
        };
      }),
    [count, intensity, seed],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
      {/* the smoke left hanging after the flare */}
      <motion.span
        className="absolute -left-20 -top-20 h-40 w-40 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(214,200,184,0.28) 0%, rgba(190,175,160,0.1) 45%, rgba(180,165,150,0) 70%)", filter: "blur(6px)" }}
        initial={{ opacity: 0, scale: 0.4, y: 0 }}
        animate={{ opacity: [0, 0.9, 0], scale: [0.4, 1.1, 1.7 * intensity], y: [0, -30, -80] }}
        transition={{ duration: 2.2, ease: "easeOut", times: [0, 0.25, 1] }}
      />
      {/* the flash of the strike */}
      <motion.span
        className="absolute -left-12 -top-12 h-24 w-24 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,236,200,0.9) 0%, rgba(255,170,80,0.35) 35%, rgba(255,120,40,0) 70%)" }}
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: [0, 1, 0], scale: [0.3, 1.2, 1.5] }}
        transition={{ duration: 0.5, ease: "easeOut", times: [0, 0.15, 1] }}
      />
      {sparks.map((s, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            width: s.len,
            height: 2,
            marginLeft: -s.len / 2,
            rotate: s.rot,
            background: "linear-gradient(90deg, rgba(255,140,50,0), #ffd28a 70%, #fff4dc)",
            boxShadow: "0 0 6px rgba(255,170,80,0.8)",
          }}
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{ x: s.x, y: [0, s.peak, s.fall], opacity: [1, 1, 0], filter: ["brightness(1.2)", "brightness(1)", "brightness(0.6) hue-rotate(-12deg)"] }}
          transition={{ duration: s.dur, delay: s.delay, ease: "easeOut", times: [0, 0.45, 1] }}
        />
      ))}
    </div>
  );
}
