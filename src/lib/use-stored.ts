"use client";

import { useCallback, useSyncExternalStore } from "react";

/** A string preference persisted in localStorage, hydration-safe and shared across components. */
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", l);
  };
};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useStored<T extends string>(key: string, fallback: T, valid: (v: unknown) => v is T): [T, (v: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      const v = read(key);
      return valid(v) ? v : fallback;
    },
    () => fallback,
  );
  const set = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(key, v);
      } catch {}
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}

export const isBoolString = (v: unknown): v is "0" | "1" => v === "0" || v === "1";
