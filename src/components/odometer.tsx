"use client";

import { useAnimate, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { EmberBurst } from "@/components/ember-burst";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

type Slot = { key: string; char: string; digit: boolean; fromRight: number };

/**
 * Keys every character by its place relative to the decimal point, so the ones
 * column stays the ones column when the number grows or the fraction length changes.
 */
function slots(text: string): Slot[] {
  const dot = text.indexOf(".");
  const intEnd = dot === -1 ? text.length : dot;
  const out: Slot[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const key = i < intEnd ? `i${intEnd - i}` : i === intEnd ? "dot" : `f${i - intEnd}`;
    out.push({ key, char: ch, digit: ch >= "0" && ch <= "9", fromRight: text.length - 1 - i });
  }
  return out;
}

/**
 * Mechanical-odometer number. Each digit is a 0-9 strip that scrolls to its
 * value, right-most columns first. Separators and decimals come straight from
 * the formatted string.
 *
 * `trend` is a direction/serial pair from the caller; a new serial fires the
 * gold flare (up) or the ash dip (down) once.
 */
export function Odometer({
  value,
  trend,
  className = "",
}: {
  value: string;
  trend?: { dir: "up" | "down"; id: number } | null;
  className?: string;
}) {
  const [scope, animate] = useAnimate<HTMLSpanElement>();
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!trend || !scope.current) return;
    const up = trend.dir === "up";
    const controls = animate(
      scope.current,
      up
        ? {
            color: ["#f6ede3", "#ffe1a1", "#ffc24b", "#f6ede3"],
            textShadow: [
              "0 0 0px rgba(255,154,46,0)",
              "0 0 10px rgba(255,194,75,0.95)",
              "0 0 6px rgba(255,122,31,0.7)",
              "0 0 0px rgba(255,154,46,0)",
            ],
          }
        : {
            color: ["#f6ede3", "#b06a52", "#8f7b6c", "#f6ede3"],
            opacity: [1, 0.55, 0.7, 1],
            textShadow: ["0 0 0px rgba(179,32,12,0)", "0 0 8px rgba(179,32,12,0.6)", "0 0 4px rgba(179,32,12,0.3)", "0 0 0px rgba(179,32,12,0)"],
          },
      { duration: reduced ? 0.3 : up ? 1.1 : 0.8, times: [0, 0.2, 0.55, 1], ease: "easeOut" },
    );
    return () => controls.stop();
  }, [trend, animate, scope, reduced]);

  const parts = slots(value);
  return (
    <span className={`relative inline-flex ${className}`}>
      <span ref={scope} aria-hidden className="inline-flex h-5 overflow-hidden leading-5">
        {parts.map((p) =>
          p.digit ? (
            <span key={p.key} className="relative inline-block h-5 w-[1ch] overflow-hidden">
              <span
                className="absolute inset-x-0 top-0 flex flex-col"
                style={{
                  transform: `translateY(${-Number(p.char) * 1.25}rem)`,
                  transition: "transform 680ms cubic-bezier(0.22, 1, 0.36, 1)",
                  transitionDelay: `${Math.min(p.fromRight, 10) * 28}ms`,
                }}
              >
                {DIGITS.map((d) => (
                  <span key={d} className="block h-5 text-center leading-5">
                    {d}
                  </span>
                ))}
              </span>
            </span>
          ) : (
            <span key={p.key} className="inline-block">
              {p.char}
            </span>
          ),
        )}
      </span>
      {trend?.dir === "up" && !reduced && (
        <span aria-hidden className="pointer-events-none absolute inset-0">
          <EmberBurst key={trend.id} seed={trend.id} count={14} intensity={0.24} />
        </span>
      )}
    </span>
  );
}

/**
 * Tracks a numeric value and emits `{dir, id}` each time it changes within the
 * same `scope` (e.g. a currency). Switching scope resets without a flare.
 */
export function useTrend(value: number | null, scope: string) {
  const [prev, setPrev] = useState({ value, scope });
  const [trend, setTrend] = useState<{ dir: "up" | "down"; id: number } | null>(null);
  if (prev.value !== value || prev.scope !== scope) {
    setPrev({ value, scope });
    if (prev.scope === scope && prev.value !== null && value !== null) {
      setTrend({ dir: value > prev.value ? "up" : "down", id: (trend?.id ?? 0) + 1 });
    } else if (trend) {
      setTrend(null);
    }
  }
  return trend;
}
