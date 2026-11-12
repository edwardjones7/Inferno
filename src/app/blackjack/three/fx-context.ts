"use client";

import { createContext, useContext } from "react";

/**
 * Game-feel signals the scene reacts to. Provided by table-3d.tsx; read anywhere in
 * the scene with useSceneFx(). Values change at React speed; smooth them inside
 * useFrame (e.g. damp a ref toward `heat`) rather than snapping.
 */
export interface SceneFx {
  /**
   * Session heat from the win/loss streak, -1 (ice cold, losing streak) .. 0 (neutral)
   * .. +1 (on fire, winning streak). Drives lava speed/brightness, embers, light
   * temperature and colour grading.
   */
  heat: number;
  /**
   * True while a dramatic dealer reveal is playing: the camera eases toward the hole
   * card, depth of field focuses on it, and the flip runs in slow motion. Goes back to
   * false once the dealer has finished drawing.
   */
  drama: boolean;
  /** Increments each time a player blackjack is revealed (fire the flame jet / gold flash). */
  blackjackKey: number;
  /** Increments on every winning result (win flash, ember burst). */
  winKey: number;
  /** Increments on every losing result. */
  loseKey: number;
  /** True when the user prefers reduced motion; keep effects calm and skip camera moves. */
  reducedMotion: boolean;
}

export const DEFAULT_FX: SceneFx = { heat: 0, drama: false, blackjackKey: 0, winKey: 0, loseKey: 0, reducedMotion: false };

export const SceneFxContext = createContext<SceneFx>(DEFAULT_FX);
export const useSceneFx = () => useContext(SceneFxContext);
