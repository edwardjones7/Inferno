"use client";

/**
 * Inferno Pro membership: who has it, and how to ask for it.
 *
 * Shared contract for the whole app. Screens only read `useIsPro()` / `isPro()` and call
 * `openPaywall()`; the purchase flow (src/lib/purchases.ts, in-app purchases) is the only
 * thing that calls `setPro()`. The entitlement is cached on the device so Pro works offline.
 */
import { useSyncExternalStore } from "react";

export const PRO_NAME = "Inferno Pro";

const KEY = "inferno:pro:v1";
const PAYWALL_EVENT = "inferno:paywall";

export interface ProState {
  active: boolean;
  /** when the current period ends (ms), if known */
  expiresAt: number | null;
  /** store product id that granted it, if known */
  productId: string | null;
  /** false when the player has cancelled and Pro ends at `expiresAt`; null/absent if unknown */
  willRenew?: boolean | null;
  /** true while the current period is a free trial */
  trial?: boolean;
  /** set only by the development override in src/lib/purchases.ts */
  dev?: boolean;
}

const NONE: ProState = { active: false, expiresAt: null, productId: null };

let cache: ProState | null = null;
const listeners = new Set<() => void>();

function load(): ProState {
  if (cache) return cache;
  let s: ProState = NONE;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = { ...NONE, ...(JSON.parse(raw) as Partial<ProState>) };
  } catch {}
  if (s.active && s.expiresAt !== null && s.expiresAt < Date.now()) s = { ...s, active: false };
  cache = s;
  return s;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getProState(): ProState {
  return load();
}

export function isPro(): boolean {
  return load().active;
}

export function useProState(): ProState {
  return useSyncExternalStore(subscribe, load, () => NONE);
}

export function useIsPro(): boolean {
  return useProState().active;
}

/** Only the purchase flow should call this. */
export function setPro(next: ProState) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

/** Ask the app to show the paywall. `reason` says what the player tried to open (for copy and analytics). */
export function openPaywall(reason?: string) {
  window.dispatchEvent(new CustomEvent(PAYWALL_EVENT, { detail: { reason: reason ?? null } }));
}

export function onPaywallRequest(fn: (reason: string | null) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<{ reason: string | null }>).detail?.reason ?? null);
  window.addEventListener(PAYWALL_EVENT, h);
  return () => window.removeEventListener(PAYWALL_EVENT, h);
}
