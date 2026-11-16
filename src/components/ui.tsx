"use client";

import Link from "next/link";
import { useId } from "react";
import { play } from "@/lib/sound";
import { IconChevron } from "./icons";

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[11px] font-bold uppercase tracking-[0.28em] text-ember-400 ${className}`}>{children}</p>;
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-1 font-display text-2xl font-black leading-tight sm:text-3xl">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function SectionTitle({ title, href, cta }: { title: string; href?: string; cta?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-base font-bold sm:text-lg">{title}</h2>
      {href && (
        <Link href={href} className="flex items-center gap-0.5 text-xs font-bold text-ember-400 hover:text-ember-300">
          {cta ?? "See all"}
          <IconChevron className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

export function Stat({ label, value, sub, hot }: { label: string; value: React.ReactNode; sub?: React.ReactNode; hot?: boolean }) {
  return (
    <div className="panel rounded-2xl p-3.5 sm:p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ash-500">{label}</p>
      <p className={`tabular mt-1 font-display text-xl font-bold leading-none sm:text-2xl ${hot ? "molten-text" : "text-bone"}`}>{value}</p>
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
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-ember-500 shadow-[0_0_16px_-4px_rgba(255,90,31,0.9)]" : "bg-ash-700"}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-bone shadow transition-all ${on ? "left-6" : "left-1"}`} />
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
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-2xl bg-ash-950/70 p-1 ring-1 ring-ash-700/70">
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
          className={`h-9 flex-1 rounded-xl px-2 text-xs font-bold transition-colors disabled:opacity-35 sm:text-sm ${
            value === o.id ? "bg-ember-500 text-ash-950 shadow-[0_0_18px_-4px_rgba(255,90,31,0.8)]" : "text-ash-400 hover:text-bone"
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
        className={`h-full rounded-full ${v >= 90 ? "bg-gradient-to-r from-ember-500 to-ember-300" : v >= 70 ? "bg-ember-600" : "bg-ember-800"}`}
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
            <stop offset="0" stopColor="#ffc24b" />
            <stop offset="1" stopColor="#e5360f" />
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
  return <div className="panel rounded-3xl px-5 py-10 text-center text-sm text-ash-400">{children}</div>;
}
