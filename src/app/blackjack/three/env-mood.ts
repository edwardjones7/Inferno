"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import { damp } from "./env-glsl";
import { useSceneFx } from "./fx-context";

/**
 * Smoothed, per-frame view of the scene fx signals, shared by every atmosphere piece.
 * Written once per frame by useMood() (priority -1, so it runs before readers).
 */
export interface Mood {
  /** damped heat, -1..1 */
  heat: number;
  /** max(0, heat) / max(0, -heat) */
  hot: number;
  cold: number;
  /** 1 on a loss, decays to 0 over ~1.5s */
  lose: number;
  /** 1 on a win, decays to 0 over ~1s */
  win: number;
  /** seconds since the last blackjack (large when none) */
  bjAge: number;
  /** accumulated time, seconds */
  time: number;
  reduced: boolean;
}

export type MoodRef = RefObject<Mood>;

export function useMood(): MoodRef {
  const fx = useSceneFx();
  const mood = useRef<Mood>({ heat: 0, hot: 0, cold: 0, lose: 0, win: 0, bjAge: 99, time: 0, reduced: false });
  const seen = useRef({ win: fx.winKey, lose: fx.loseKey, bj: fx.blackjackKey });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const m = mood.current;
    const s = seen.current;
    if (fx.winKey !== s.win) {
      s.win = fx.winKey;
      if (fx.winKey) m.win = 1;
    }
    if (fx.loseKey !== s.lose) {
      s.lose = fx.loseKey;
      if (fx.loseKey) m.lose = 1;
    }
    if (fx.blackjackKey !== s.bj) {
      s.bj = fx.blackjackKey;
      if (fx.blackjackKey) m.bjAge = 0;
    }
    m.heat = damp(m.heat, Math.max(-1, Math.min(1, fx.heat)), 1.4, dt);
    m.hot = Math.max(0, m.heat);
    m.cold = Math.max(0, -m.heat);
    m.lose *= Math.exp(-dt * 2.2);
    m.win *= Math.exp(-dt * 2.5);
    m.bjAge = Math.min(99, m.bjAge + dt);
    m.time += dt;
    m.reduced = fx.reducedMotion;
  }, -1);

  return mood;
}
