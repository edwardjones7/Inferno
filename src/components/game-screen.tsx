"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { play } from "@/lib/sound";
import { MuteButton } from "./app-shell";
import { IconBack, IconSettings, IconX } from "./icons";

/**
 * Full-screen frame for the 3D games. The scene fills the viewport; a thin HUD floats on
 * top, the controls float at the bottom (thumb zone), and everything else (coach settings,
 * rules, match stats) lives in a drawer: a bottom sheet on phones, a side panel on desktop.
 *
 * The heights of the top and bottom overlays are measured and published through
 * `useGameInsets()`, so the 3D camera can frame the table in the space between them.
 */

export interface GameInsets {
  top: number;
  bottom: number;
}

const InsetsContext = createContext<GameInsets>({ top: 0, bottom: 0 });
export const useGameInsets = () => useContext(InsetsContext);

function useHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, h] as const;
}

export function GameScreen({
  title,
  hud,
  bottom,
  drawer,
  drawerTitle = "Table",
  drawerOpen,
  onDrawerChange,
  backHref = "/play/",
  onBack,
  children,
}: {
  /** accessible name for the screen */
  title: string;
  /** extra HUD items shown in the top bar (centre/right) */
  hud?: React.ReactNode;
  /** controls pinned to the bottom of the screen */
  bottom?: React.ReactNode;
  /** settings / info shown in the drawer */
  drawer?: React.ReactNode;
  drawerTitle?: string;
  drawerOpen: boolean;
  onDrawerChange: (open: boolean) => void;
  backHref?: string;
  /** replaces the default back navigation (e.g. closing an overlay) */
  onBack?: () => void;
  /** the 3D scene; fills the screen */
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [topRef, topH] = useHeight<HTMLDivElement>();
  const [bottomRef, bottomH] = useHeight<HTMLDivElement>();

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDrawerChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, onDrawerChange]);

  const back = () => {
    play("click");
    if (onBack) onBack();
    else if (window.history.length > 1) router.back();
    else router.push(backHref);
  };

  return (
    <InsetsContext.Provider value={{ top: topH, bottom: bottomH }}>
      <section aria-label={title} className="relative h-dvh w-full touch-manipulation select-none overflow-hidden bg-ash-950">
        <div className="absolute inset-0">{children}</div>

        {/* top HUD */}
        <div
          ref={topRef}
          className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-ash-950/80 via-ash-950/35 to-transparent pb-6 pt-[env(safe-area-inset-top)]"
        >
          <div className="flex h-14 items-center gap-2 px-3 sm:h-16 sm:px-5">
            <button
              onClick={back}
              aria-label="Back"
              className="pointer-events-auto grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ash-950/60 text-ash-200 ring-1 ring-brass-500/40 backdrop-blur-md active:bg-ash-800"
            >
              <IconBack className="h-5 w-5" />
            </button>
            <div className="pointer-events-auto flex min-w-0 flex-1 items-center justify-end gap-2">{hud}</div>
            <div className="pointer-events-auto rounded-xl bg-ash-950/60 ring-1 ring-brass-500/40 backdrop-blur-md">
              <MuteButton />
            </div>
            {drawer && (
              <button
                onClick={() => {
                  play("click");
                  onDrawerChange(true);
                }}
                aria-label={`Open ${drawerTitle.toLowerCase()} settings`}
                aria-expanded={drawerOpen}
                className="pointer-events-auto grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ash-950/60 text-ash-200 ring-1 ring-brass-500/40 backdrop-blur-md active:bg-ash-800"
              >
                <IconSettings className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* bottom controls */}
        {bottom && (
          <div
            ref={bottomRef}
            className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-ash-950/90 via-ash-950/55 to-transparent pb-[calc(env(safe-area-inset-bottom)+10px)] pt-8"
          >
            <div className="pointer-events-auto mx-auto w-full max-w-3xl px-3 sm:px-5">{bottom}</div>
          </div>
        )}

        {/* drawer */}
        <AnimatePresence>
          {drawerOpen && drawer && (
            <>
              <motion.button
                key="scrim"
                aria-label="Close settings"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => onDrawerChange(false)}
                className="absolute inset-0 z-40 bg-ash-950/50 backdrop-blur-[2px]"
              />
              <motion.aside
                key="sheet"
                role="dialog"
                aria-modal="true"
                aria-label={drawerTitle}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 38 }}
                className="absolute inset-x-0 bottom-0 z-50 max-h-[82dvh] overflow-y-auto rounded-t-3xl border-t border-brass-500/45 bg-ash-900/95 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-[0_-20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl lg:inset-x-auto lg:inset-y-0 lg:right-0 lg:max-h-none lg:w-[380px] lg:rounded-none lg:rounded-l-3xl lg:border-l lg:border-t-0"
              >
                <div className="sticky top-0 z-10 bg-ash-900/95 px-5 pb-2 pt-3 backdrop-blur-xl lg:pt-[calc(env(safe-area-inset-top)+20px)]">
                  <span className="mx-auto mb-2 block h-1 w-10 rounded-full bg-ash-600 lg:hidden" aria-hidden />
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-lg text-brass-100">{drawerTitle}</h2>
                    <button
                      onClick={() => onDrawerChange(false)}
                      aria-label="Close"
                      className="grid h-9 w-9 place-items-center rounded-xl text-ash-300 hover:bg-ash-800"
                    >
                      <IconX className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-3 px-5 pb-4 pt-1">{drawer}</div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </section>
    </InsetsContext.Provider>
  );
}

/** A card-like group inside the drawer. */
export function DrawerSection({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-brass-500/25 bg-ash-950/60 p-4 shadow-[inset_0_0_0_3px_rgb(10_7_5/0.5),inset_0_0_0_4px_rgb(174_147_93/0.1)]">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h3 className="caps-label text-brass-300">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
