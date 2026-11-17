"use client";

import { useEffect, useSyncExternalStore } from "react";
import { lookForBot } from "@/game/characters/looks";
import type { BotProfile } from "@/lib/poker/roster";
import type { PortraitRenderer } from "./render";

/**
 * Bot portraits, rendered from the 3D characters once per session and cached.
 *
 * Avatars ask for a portrait with `useBotPortrait`; requests are queued and drawn after first
 * paint (on idle) by one shared offscreen renderer, which is released a few seconds after the
 * queue empties so it never holds a WebGL context next to a live table. Results stay in memory
 * and in sessionStorage, keyed by the look, so a changed outfit re-renders.
 *
 * Without WebGL (where the tables fall back to flat 2D), or if rendering fails once, nothing is queued and
 * avatars keep their sigil.
 */

const VERSION = 2;
const STORE_PREFIX = "inferno:portrait:";

const urls = new Map<string, string>();
const listeners = new Set<() => void>();
const queue: BotProfile[] = [];
const queued = new Set<string>();
let broken = false;
let scheduled = false;
let running = false;
let renderer: PortraitRenderer | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** keys already looked up in sessionStorage (so a miss isn't re-read on every render) */
const checked = new Set<string>();
const keyCache = new Map<string, string>();
function keyFor(bot: BotProfile) {
  let k = keyCache.get(bot.id);
  if (!k) {
    k = `${bot.id}:${VERSION}:${hash(JSON.stringify(lookForBot(bot.id, bot.colors)))}`;
    keyCache.set(bot.id, k);
  }
  return k;
}

function cached(bot: BotProfile): string | null {
  const key = keyFor(bot);
  const hit = urls.get(key);
  if (hit || checked.has(key)) return hit ?? null;
  checked.add(key);
  try {
    const stored = sessionStorage.getItem(STORE_PREFIX + key);
    if (stored) {
      urls.set(key, stored);
      return stored;
    }
  } catch {}
  return null;
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

function request(bot: BotProfile) {
  if (broken || cached(bot) || queued.has(bot.id)) return;
  queued.add(bot.id);
  queue.push(bot);
  schedule();
}

function schedule() {
  if (scheduled || running) return;
  scheduled = true;
  const start = () => {
    scheduled = false;
    void drain();
  };
  // after first paint and whatever the page does on load
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(start, { timeout: 1500 });
  else setTimeout(start, 300);
}

async function drain() {
  running = true;
  if (releaseTimer) clearTimeout(releaseTimer);
  try {
    if (!renderer) {
      const { createPortraitRenderer } = await import("./render");
      renderer = await createPortraitRenderer();
    }
    while (queue.length) {
      const bot = queue.shift()!;
      queued.delete(bot.id);
      if (cached(bot)) continue;
      const url = await renderer.render(lookForBot(bot.id, bot.colors));
      const key = keyFor(bot);
      urls.set(key, url);
      try {
        sessionStorage.setItem(STORE_PREFIX + key, url);
      } catch {}
      emit();
      // one portrait per task, so a full roster never blocks input
      await new Promise((r) => setTimeout(r, 0));
    }
  } catch (err) {
    broken = true;
    queue.length = 0;
    queued.clear();
    release();
    console.warn("[portraits] falling back to sigils:", err);
    emit();
  } finally {
    running = false;
  }
  if (queue.length) schedule();
  else if (renderer) releaseTimer = setTimeout(release, 4000);
}

function release() {
  renderer?.dispose();
  renderer = null;
}

let webgl: boolean | null = null;
function hasWebGL() {
  if (webgl === null) {
    try {
      const c = document.createElement("canvas");
      webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
      // don't keep a context alive just for the probe
      (c.getContext("webgl2") ?? c.getContext("webgl"))?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

/**
 * Whether portraits can be shown at all. Server and first client render assume yes (so the
 * frame is stable through hydration); devices without WebGL (the flat, 2D fallback) switch to sigils.
 */
export function usePortraitsEnabled() {
  const gl = useSyncExternalStore(subscribe, hasWebGL, () => true);
  const failed = useSyncExternalStore(subscribe, () => broken, () => false);
  return gl && !failed;
}

/** The bot's portrait as an image URL, or null until it's ready (or when portraits are off). */
export function useBotPortrait(bot: BotProfile, enabled: boolean): string | null {
  const url = useSyncExternalStore(
    subscribe,
    () => (enabled ? cached(bot) : null),
    () => null,
  );
  useEffect(() => {
    if (enabled) request(bot);
  }, [enabled, bot]);
  return url;
}
