"use client";

import { motion } from "motion/react";
import { useMemo } from "react";

/** One-shot shower of sparks for wins. Re-mount (via key) to fire again. */
/** Deterministic hash noise in [0,1) so renders stay pure. */
const noise = (i: number, seed: number) => {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function EmberBurst({ count = 36, intensity = 1, seed = 1 }: { count?: number; intensity?: number; seed?: number }) {
  const sparks = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const r = (k: number) => noise(i * 5 + k, seed);
        const angle = (i / count) * Math.PI * 2 + r(0) * 0.4;
        const dist = (90 + r(1) * 180) * intensity;
        return {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist * 0.7 - 40,
          size: 3 + r(2) * 5,
          dur: 0.9 + r(3) * 0.8,
          hue: 20 + r(4) * 30,
        };
      }),
    [count, intensity, seed],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
      {sparks.map((s, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            width: s.size,
            height: s.size,
            background: `hsl(${s.hue} 100% 62%)`,
            boxShadow: `0 0 ${s.size * 3}px hsl(${s.hue} 100% 55%)`,
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: s.x, y: [0, s.y, s.y + 80], opacity: [1, 1, 0], scale: [1, 1, 0.3] }}
          transition={{ duration: s.dur, ease: "easeOut", times: [0, 0.6, 1] }}
        />
      ))}
    </div>
  );
}
