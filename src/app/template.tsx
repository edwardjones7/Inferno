"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Root template: remounts whenever the top-level segment changes, so its mount
 * effect is our route-change hook. The page itself renders immediately (no
 * hidden initial state, nothing awaits), and the heat-shimmer is layered on top
 * with the Web Animations API, so streaming and interaction are untouched.
 */

// The very first mount is the initial page load, which should not animate.
const seen = { first: true };

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export default function Template({ children }: { children: React.ReactNode }) {
  const page = useRef<HTMLDivElement>(null);
  const sweep = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (seen.first) {
      // flip after this commit, so StrictMode's immediate effect replay is also skipped
      setTimeout(() => (seen.first = false), 0);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const anims: Animation[] = [];
    if (page.current) {
      anims.push(
        page.current.animate(
          [
            // opacity + transform only: compositor-friendly, no full-page blur while the
            // incoming page (often a WebGL scene) is doing its own first render
            { opacity: 0.4, transform: "translateY(10px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 320, easing: EASE },
        ),
      );
    }
    if (sweep.current) {
      anims.push(
        sweep.current.animate(
          [
            { transform: "translateY(100vh)", opacity: 0.9 },
            { transform: "translateY(-10vh)", opacity: 0 },
          ],
          { duration: 420, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
        ),
      );
    }
    return () => anims.forEach((a) => a.cancel());
  }, []);

  return (
    <>
      <div ref={page}>{children}</div>
      <div
        ref={sweep}
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-30 h-24"
        style={{
          transform: "translateY(100vh)",
          opacity: 0,
          // a thin rising heat line, not a full-screen smear
          background:
            "linear-gradient(0deg, transparent 0%, rgb(255 90 31 / 0.10) 40%, rgb(255 194 75 / 0.22) 50%, rgb(255 90 31 / 0.10) 60%, transparent 100%)",
        }}
      />
    </>
  );
}
