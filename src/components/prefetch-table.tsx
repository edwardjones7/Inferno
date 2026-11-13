"use client";

import { useEffect } from "react";

/**
 * On capable desktops, quietly loads the 3D table code and pre-paints its textures a
 * couple of seconds after any page settles, so opening Blackjack doesn't stall while
 * three.js parses and the felt/cards are painted.
 */
export function PrefetchTable() {
  useEffect(() => {
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (nav.connection?.saveData) return;
    if (!window.matchMedia("(min-width: 640px)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => {
      void import("@/app/blackjack/three/table-3d");
      void import("@/app/blackjack/three/prewarm").then((m) => m.prewarmTableAssets());
    }, 2000);
    return () => clearTimeout(t);
  }, []);
  return null;
}
