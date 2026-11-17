"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Component, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { IconChevron } from "@/components/icons";
import { StationPanel } from "@/components/lobby/station-panel";
import type { LobbyNav } from "@/game/lobby/lobby-room";
import { STATIONS, type StationId } from "@/game/lobby/stations";
import { resolveQuality, useGraphics } from "@/lib/settings";
import { useStored } from "@/lib/use-stored";

const RoomScene = dynamic(() => import("@/components/lobby-hero-scene"), { ssr: false, loading: () => null });

let webgl: boolean | null = null;
function hasWebGL() {
  if (webgl === null) {
    try {
      const c = document.createElement("canvas");
      webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}
const noopSubscribe = () => () => {};

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const STATION_KEY = "inferno:lobby-station";
const isStation = (v: unknown): v is StationId => STATIONS.some((s) => s.id === v);
const LAST = STATIONS.length - 1;

/**
 * The Home room. A 3D room with one station per thing you can do (blackjack table,
 * poker room, training corner): swipe or drag sideways, use the arrow keys, or tap a
 * label to glide between them; tap the focused station or its button to go in.
 *
 * Without WebGL (or if the scene throws) the same labels and station cards work over
 * the static `fallback` art, so Home stays fully usable.
 */
export function LobbyHero({ fallback }: { fallback: ReactNode }) {
  const router = useRouter();
  const [stationId, setStationId] = useStored<StationId>(STATION_KEY, "blackjack", isStation);
  const index = Math.max(0, STATIONS.findIndex((s) => s.id === stationId));
  const station = STATIONS[index];

  const live = useSyncExternalStore(noopSubscribe, hasWebGL, () => false);
  const [graphics] = useGraphics();
  const quality = useSyncExternalStore(noopSubscribe, () => resolveQuality(graphics), () => "high" as const);
  const reduced = useReducedMotion() ?? false;
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);

  // Next keeps Home alive in a hidden <Activity> after you navigate away; its effect
  // cleanups free the WebGL renderer, so drop the scene while hidden and mount a fresh
  // one (new key) when the page is shown again.
  const [sceneOn, setSceneOn] = useState(true);
  const [sceneKey, setSceneKey] = useState(0);
  useEffect(() => {
    queueMicrotask(() => setSceneOn(true));
    return () => {
      setSceneOn(false);
      setReady(false);
      setSceneKey((k) => k + 1);
    };
  }, []);

  const nav = useRef<LobbyNav>({ target: index, drag: 0, dragging: false });
  useEffect(() => {
    nav.current.target = index;
  }, [index]);

  const go = useCallback(
    (i: number) => {
      const c = Math.max(0, Math.min(LAST, i));
      nav.current.target = c;
      setStationId(STATIONS[c].id);
    },
    [setStationId],
  );

  /* ------------------------------------------------ swipe / drag */
  const root = useRef<HTMLElement>(null);
  const moved = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("a,button")) return;
    const el = root.current;
    if (!el) return;
    const width = el.clientWidth;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let last = { x: x0, t: performance.now() };
    let vx = 0;
    let horizontal: boolean | null = null;
    moved.current = false;

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (horizontal === null) {
        if (Math.hypot(dx, dy) < 6) return;
        horizontal = Math.abs(dx) > Math.abs(dy);
        moved.current = true;
        if (!horizontal) return end();
        nav.current.dragging = true;
      }
      const now = performance.now();
      const dt = now - last.t;
      if (dt > 0) vx = 0.7 * vx + 0.3 * ((ev.clientX - last.x) / dt);
      last = { x: ev.clientX, t: now };
      // a full-width drag moves about one and a half stations
      nav.current.drag = -dx / (width * 0.65);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      if (nav.current.dragging) {
        const d = nav.current.drag - vx * 0.35;
        const from = nav.current.target;
        const step = Math.abs(d) > 1.2 ? Math.round(d) : Math.abs(d) > 0.12 ? Math.sign(d) : 0;
        nav.current.dragging = false;
        nav.current.drag = 0;
        // the rig picks up from where the drag left the camera
        nav.current.target = from;
        go(from + step);
      }
      end();
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // tap on a station in the scene: focus it, or open it if it is already focused
  const onTap = useCallback(
    (i: number) => {
      if (moved.current) return;
      if (i === nav.current.target) router.push(STATIONS[i].href);
      else go(i);
    },
    [go, router],
  );

  /* ------------------------------------------------ keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input,textarea,select,[contenteditable=true],[role=slider]")) return;
      const el = root.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 80 || r.top > window.innerHeight - 80) return;
      if (e.key === "ArrowRight") go(nav.current.target + 1);
      else if (e.key === "ArrowLeft") go(nav.current.target - 1);
      else if (e.key === "Enter" && t === el) router.push(STATIONS[nav.current.target].href);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, router]);

  const showScene = live && ready;

  return (
    <section
      ref={root}
      tabIndex={0}
      aria-roledescription="carousel"
      aria-label="Choose where to play or train. Use the arrow keys to move, Enter to go in."
      onPointerDown={onPointerDown}
      className="relative h-[calc(100svh-3.5rem-72px-env(safe-area-inset-top)-env(safe-area-inset-bottom)-20px)] min-h-[560px] touch-pan-y select-none overflow-hidden outline-none lg:h-[min(calc(100dvh-4rem),800px)] lg:min-h-[620px]"
    >
      {/* static art: shown until the room has drawn, and for good when it can't run */}
      <div aria-hidden className={`absolute inset-0 transition-opacity duration-700 ${showScene ? "opacity-0" : "opacity-100"}`}>
        <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_32%,rgba(255,90,31,0.16),transparent_70%)]" />
        <div className="absolute left-1/2 top-[9%] h-[46%] w-[min(92%,460px)] -translate-x-1/2">{fallback}</div>
      </div>
      {live && sceneOn && (
        <div aria-hidden className={`absolute inset-0 transition-opacity duration-700 ${showScene ? "opacity-100" : "opacity-0"}`}>
          <SceneBoundary>
            <RoomScene key={sceneKey} nav={nav} reduced={reduced} quality={quality} onTap={onTap} onReady={onReady} />
          </SceneBoundary>
        </div>
      )}

      {/* vignette and a fade into the page below */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,transparent_55%,rgba(10,7,5,0.75))]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-ash-950 via-ash-950/80 to-transparent lg:h-1/3 lg:via-ash-950/40" />

      {/* station labels (also the dots) */}
      <div className="absolute inset-x-0 top-0 flex justify-center px-4 pt-3 lg:pt-6">
        <div role="tablist" aria-label="Stations" className="flex rounded-xl bg-ash-950/60 p-1 ring-1 ring-brass-500/40 backdrop-blur-md">
          {STATIONS.map((s, i) => {
            const on = i === index;
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={on}
                onClick={() => go(i)}
                className={`relative flex h-9 items-center rounded-md px-3.5 font-display text-[13px] tracking-[0.05em] transition-colors sm:px-5 ${on ? "text-[#fff3df]" : "text-ash-300 hover:text-bone"}`}
              >
                {on && (
                  <motion.span
                    layoutId="lobby-tab"
                    transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
                    className="absolute inset-0 rounded-md bg-[linear-gradient(180deg,#b84f20,#7f2810)] shadow-[inset_0_0_0_1px_rgb(214_186_128/0.65),0_0_18px_-4px_rgba(255,122,31,0.6)]"
                  />
                )}
                <span className="relative">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* arrows (pointer devices; on touch you swipe) */}
      <button
        aria-label="Previous station"
        onClick={() => go(index - 1)}
        disabled={index === 0}
        className="btn-ash absolute left-4 top-[42%] hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full transition-opacity disabled:pointer-events-none disabled:opacity-0 sm:grid lg:left-6"
      >
        <IconChevron className="h-5 w-5 rotate-180" />
      </button>
      <button
        aria-label="Next station"
        onClick={() => go(index + 1)}
        disabled={index === LAST}
        className="btn-ash absolute right-4 top-[42%] hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full transition-opacity disabled:pointer-events-none disabled:opacity-0 sm:grid lg:right-6"
      >
        <IconChevron className="h-5 w-5" />
      </button>

      {/* the focused station: what you learn there and how you're doing */}
      <div className="absolute inset-x-0 bottom-0 px-4 pb-4 lg:inset-x-auto lg:left-8 lg:w-[440px] lg:pb-8">
        <div className="mb-3 flex items-center justify-center gap-2 lg:justify-start" aria-hidden>
          {STATIONS.map((s, i) => (
            <span key={s.id} className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-6 bg-ember-400" : "w-1.5 bg-ash-600"}`} />
          ))}
          <span className="ml-1 text-[11px] font-semibold text-ash-500 lg:hidden">Swipe to explore</span>
        </div>
        <div className="panel rounded-3xl p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:p-5" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={station.id}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <StationPanel id={station.id} href={station.href} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
