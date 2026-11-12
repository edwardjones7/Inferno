"use client";

export const CHIP_VALUES = [1, 5, 25, 100, 500, 1000] as const;

const STYLE: Record<number, { base: string; edge: string; text: string }> = {
  1: { base: "#ddd0c3", edge: "#8f7b6c", text: "#1e1611" },
  5: { base: "#e5360f", edge: "#ffc24b", text: "#fff3df" },
  25: { base: "#1f6f4a", edge: "#ffe1a1", text: "#fff3df" },
  100: { base: "#17110d", edge: "#ff9a2e", text: "#ffc24b" },
  500: { base: "#5b2a86", edge: "#ffc24b", text: "#fff3df" },
  1000: { base: "#ffc24b", edge: "#b3200c", text: "#3d0805" },
};

export const chipLabel = (v: number) => (v >= 1000 ? `${v / 1000}K` : String(v));

export function Chip({ value, size = 56, glow = false }: { value: number; size?: number; glow?: boolean }) {
  const s = STYLE[value] ?? STYLE[100];
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center rounded-full font-display font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * (value >= 1000 ? 0.24 : 0.28),
        color: s.text,
        background: `repeating-conic-gradient(${s.edge} 0 15deg, ${s.base} 15deg 45deg)`,
        boxShadow: `0 4px 0 rgba(0,0,0,.45), 0 8px 18px -6px rgba(0,0,0,.8)${glow ? ", 0 0 22px -2px rgba(255,122,31,.8)" : ""}`,
      }}
    >
      <span
        className="grid place-items-center rounded-full"
        style={{
          width: size * 0.7,
          height: size * 0.7,
          background: `radial-gradient(circle at 40% 30%, rgba(255,255,255,.25), transparent 60%), ${s.base}`,
          boxShadow: `inset 0 0 0 2px ${s.edge}, inset 0 0 0 ${Math.max(3, size * 0.07)}px ${s.base}, inset 0 0 0 ${Math.max(4, size * 0.09)}px ${s.edge}55`,
        }}
      >
        {chipLabel(value)}
      </span>
    </span>
  );
}

/** Break an amount into chips (largest first), for showing a stake on the felt. */
export function chipsFor(amount: number, max = 6): number[] {
  const out: number[] = [];
  let left = Math.round(amount);
  for (const v of [...CHIP_VALUES].reverse()) {
    while (left >= v && out.length < max) {
      out.push(v);
      left -= v;
    }
  }
  return out.length ? out : [1];
}
