"use client";

import Link from "next/link";
import { useId } from "react";
import { play } from "@/lib/sound";
import { IconChevron } from "./icons";

/** Uppercase section label; `ruled` adds a short brass rule in front. */
export function Eyebrow({ children, ruled, className = "" }: { children: React.ReactNode; ruled?: boolean; className?: string }) {
  return <p className={`eyebrow ${ruled ? "eyebrow-ruled" : ""} ${className}`}>{children}</p>;
}

/** Page title: a ruled eyebrow over a heavy headline. */
export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <Eyebrow ruled>{eyebrow}</Eyebrow>
        <h1 className="mt-2 font-display font-black tracking-tight text-[26px] leading-[1.1] text-bone [text-shadow:0_0_28px_rgb(255_122_46/0.22)] sm:text-4xl">{title}</h1>
      </div>
      {children}
    </div>
  );
}

/** Section heading: bold title, a brass rule running to the optional link. */
export function SectionTitle({ title, href, cta }: { title: string; href?: string; cta?: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="shrink-0 font-display text-base font-bold text-bone sm:text-lg">{title}</h2>
      <span aria-hidden className="brass-rule min-w-6 flex-1" />
      {href && (
        <Link href={href} className="eyebrow flex shrink-0 items-center gap-0.5 hover:text-ember-300">
          {cta ?? "See all"}
          <IconChevron className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

/** Faint brass sunburst for hero panels; place inside a `relative overflow-hidden` parent. */
export function Sunburst({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`sunburst pointer-events-none absolute inset-0 ${className}`} />;
}

export function Stat({ label, value, sub, hot }: { label: string; value: React.ReactNode; sub?: React.ReactNode; hot?: boolean }) {
  return (
    <div className="panel rounded-2xl p-3.5 sm:p-4">
      <p className="caps-label">{label}</p>
      <p className={`tabular mt-1.5 text-xl font-bold leading-none sm:text-2xl ${hot ? "molten-text" : "text-bone"}`}>{value}</p>
      {sub && <p className="tabular mt-1.5 text-[11px] text-ash-400">{sub}</p>}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => {
        onChange(!on);
        play("click");
      }}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
        on ? "border-brass-300/70 bg-ember-700 shadow-[0_0_16px_-4px_rgba(255,90,31,0.8)]" : "border-brass-600/60 bg-ash-850"
      }`}
    >
      <span
        className={`absolute top-[3px] h-5 w-5 rounded-full shadow transition-all ${
          on ? "left-[23px] bg-[radial-gradient(circle_at_35%_30%,#f7e3b6,#cbb17c_60%,#8b7444)]" : "left-[3px] bg-[radial-gradient(circle_at_35%_30%,#b9a797,#5c4a3d)]"
        }`}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-xl bg-ash-950/70 p-1 ring-1 ring-brass-500/40">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          disabled={o.disabled}
          onClick={() => {
            onChange(o.id);
            play("click");
          }}
          className={`h-9 flex-1 rounded-md px-2 font-display text-[13px] transition-colors disabled:opacity-35 sm:text-sm ${
            value === o.id
              ? "bg-[linear-gradient(180deg,#b84f20,#7f2810)] text-[#fff3df] shadow-[inset_0_0_0_1px_rgb(214_186_128/0.65),0_0_18px_-6px_rgba(255,90,31,0.8)]"
              : "text-ash-300 hover:text-bone"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Thin horizontal meter. */
export function Meter({ value, className = "" }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-ash-800 ${className}`}>
      <div
        className={`h-full rounded-full ${v >= 90 ? "bg-gradient-to-r from-ember-600 to-brass-300" : v >= 70 ? "bg-ember-600" : "bg-ember-800"}`}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

/** Circular progress ring with content in the middle. */
export function Ring({ value, size = 64, stroke = 6, children }: { value: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const id = useId();
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e0cea2" />
            <stop offset="1" stopColor="#d9531a" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#2b2019" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.2,0.8,0.2,1)" }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center">{children}</span>
    </span>
  );
}

/** Rating sparkline. */
export function Sparkline({ points, className = "h-10 w-full" }: { points: number[]; className?: string }) {
  if (points.length < 2) return <div className={className} />;
  const W = 200;
  const H = 40;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - 3 - ((v - min) / span) * (H - 6);
  const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
      <path d={`${d}L${W},${H}L0,${H}Z`} fill="rgb(255 90 31 / 0.12)" />
      <path d={d} fill="none" stroke="#ff9a2e" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="panel relative rounded-3xl px-5 py-10 text-center text-sm text-ash-400">{children}</div>;
}
