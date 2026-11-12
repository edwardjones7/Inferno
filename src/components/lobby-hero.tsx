"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useState, useSyncExternalStore, type ReactNode } from "react";

const HeroScene = dynamic(() => import("@/components/lobby-hero-scene"), { ssr: false, loading: () => null });

/* Can this device run the live hero? WebGL, motion allowed, and at least `sm` wide
   (the art is hidden below that, so phones never download three.js). */
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
const QUERY = "(min-width: 640px) and (prefers-reduced-motion: no-preference)";
function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const canRun = () => window.matchMedia(QUERY).matches && hasWebGL();

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The static art is server-rendered and stays visible until the live scene has
 * drawn its first frame, then cross-fades out. If WebGL is missing, motion is
 * reduced, or the scene throws, the static art simply stays.
 */
export function LobbyHero({ fallback }: { fallback: ReactNode }) {
  const live = useSyncExternalStore(subscribe, canRun, () => false);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const showScene = live && ready;

  return (
    <div aria-hidden className="relative mx-auto hidden h-[360px] w-full max-w-[460px] sm:block">
      <div className={`absolute inset-0 transition-opacity duration-700 ${showScene ? "opacity-0" : "opacity-100"}`}>{fallback}</div>
      {live && (
        <div className={`absolute -inset-x-10 -inset-y-8 transition-opacity duration-700 ${showScene ? "opacity-100" : "opacity-0"}`}>
          <SceneBoundary>
            <HeroScene onReady={onReady} />
          </SceneBoundary>
        </div>
      )}
    </div>
  );
}
