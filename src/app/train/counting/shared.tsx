"use client";

import { useEffect, useRef } from "react";
import { IconFlame } from "@/components/icons";
import { fmtCount } from "@/lib/blackjack/counting";

/** Session stat chip, same look as the strategy trainer's strip. */
export function Pill({ label, value, hot, flame }: { label: string; value: string; hot?: boolean; flame?: boolean }) {
  return (
    <span className={`tabular flex items-center gap-1.5 rounded-full px-3 py-1.5 ring-1 ${hot ? "bg-ember-500/15 ring-ember-500/50" : "bg-ash-900 ring-ash-700"}`}>
      <span className="text-ash-500">{label}</span>
      <span className={`flex items-center gap-1 font-bold ${hot ? "text-ember-200" : "text-bone"}`}>
        {flame && <IconFlame className="h-3.5 w-3.5 text-ember-400" />}
        {value}
      </span>
    </span>
  );
}

export interface Tally {
  n: number;
  correct: number;
  streak: number;
  best: number;
}

export const EMPTY_TALLY: Tally = { n: 0, correct: 0, streak: 0, best: 0 };

export function tallied(t: Tally, ok: boolean): Tally {
  const streak = ok ? t.streak + 1 : 0;
  return { n: t.n + 1, correct: t.correct + (ok ? 1 : 0), streak, best: Math.max(t.best, streak) };
}

export function TallyStrip({ t, children }: { t: Tally; children?: React.ReactNode }) {
  const acc = t.n ? Math.round((t.correct / t.n) * 100) : 0;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
      <Pill label="Answered" value={String(t.n)} />
      <Pill label="Accuracy" value={t.n ? `${acc}%` : "–"} hot={t.n >= 5 && acc >= 90} />
      <Pill label="Streak" value={String(t.streak)} hot={t.streak >= 10} flame={t.streak >= 5} />
      {children}
    </div>
  );
}

/** Keydown listener that ignores typing in form fields and modified keys. */
export function useKeys(handler: (key: string, e: KeyboardEvent) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      ref.current(e.key, e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/**
 * Signed integer entry. A phone's numeric keyboard often has no minus key, so this is an
 * on-screen pad (± toggles the sign) that also takes digits, "-", Backspace and Enter.
 */
export function CountPad({ value, onChange, onSubmit, disabled }: { value: string; onChange: (v: string) => void; onSubmit: () => void; disabled?: boolean }) {
  const press = (k: string) => {
    if (disabled) return;
    if (k === "±") onChange(value.startsWith("-") ? value.slice(1) : `-${value}`);
    else if (k === "⌫") onChange(value.slice(0, -1));
    else if (/^\d$/.test(k)) {
      const digits = value.replace("-", "");
      if (digits.length >= 3) return;
      onChange(value === "0" ? k : value === "-0" ? `-${k}` : value + k);
    }
  };

  useKeys((key, e) => {
    if (disabled) return;
    if (/^\d$/.test(key)) press(key);
    else if (key === "-" || key === "+") onChange(key === "-" ? (value.startsWith("-") ? value : `-${value}`) : value.replace("-", ""));
    else if (key === "Backspace") press("⌫");
    else if (key === "Enter") {
      e.preventDefault();
      onSubmit();
    } else return;
    e.preventDefault();
  });

  const shown = value === "" || value === "-" ? (value === "-" ? "−" : "?") : fmtCount(Number(value));
  return (
    <div className="mx-auto w-full max-w-xs">
      <div
        aria-live="polite"
        className={`tabular mb-3 flex h-16 items-center justify-center rounded-2xl bg-ash-950/80 font-display text-4xl font-black ring-1 ${
          value === "" ? "text-ash-600 ring-ash-700" : "text-bone ring-ember-500/50"
        }`}
      >
        {shown}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "±", "0", "⌫"].map((k) => (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => press(k)}
            aria-label={k === "±" ? "Toggle sign" : k === "⌫" ? "Delete" : k}
            className="btn-ash tabular h-14 rounded-xl text-xl font-bold"
          >
            {k}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled || value === "" || value === "-"}
        onClick={onSubmit}
        className="btn-fire mt-2 h-14 w-full rounded-xl text-base font-bold"
      >
        Submit <kbd className="ml-1 hidden rounded bg-ash-950/20 px-1.5 py-0.5 font-mono text-[10px] sm:inline">Enter</kbd>
      </button>
    </div>
  );
}

/** Coloured Hi-Lo tag for review lists. */
export function Tag({ v }: { v: number }) {
  return (
    <span className={`tabular text-[10px] font-bold ${v > 0 ? "text-emerald-300" : v < 0 ? "text-ember-400" : "text-ash-500"}`}>{fmtCount(v)}</span>
  );
}

export const fmtSecs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
