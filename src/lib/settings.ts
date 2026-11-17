"use client";

import { BACK_KEY, DEFAULT_BACK, DEFAULT_FELT, FELT_KEY, isBackId, isFeltId, type CardBackId, type FeltId } from "./cosmetics";
import { activeCosmetic } from "./gates";
import { isPro, useIsPro } from "./pro";
import { useStored } from "./use-stored";

/**
 * Graphics quality for the 3D tables.
 * - high: full post-processing (bloom, depth of field, grading), soft shadows, retina DPR
 * - low: no post-processing, cheaper shadows, capped DPR: smooth on phones
 * - auto: low on phones and small/low-memory devices, high elsewhere
 */
export type Graphics = "auto" | "high" | "low";
export const isGraphics = (v: unknown): v is Graphics => v === "auto" || v === "high" || v === "low";
export const GRAPHICS_KEY = "inferno:graphics";

export function useGraphics() {
  return useStored<Graphics>(GRAPHICS_KEY, "auto", isGraphics);
}

let autoTier: "high" | "low" | null = null;
/** What "auto" resolves to on this device. */
export function autoQuality(): "high" | "low" {
  if (autoTier) return autoTier;
  if (typeof window === "undefined") return "high";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const small = Math.min(window.screen.width, window.screen.height) < 600;
  const weak = (nav.deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency ?? 8) <= 4;
  autoTier = (coarse && small) || weak ? "low" : "high";
  return autoTier;
}

export function resolveQuality(g: Graphics): "high" | "low" {
  return g === "auto" ? autoQuality() : g;
}

export type Toggle = "0" | "1";
export const isToggle = (v: unknown): v is Toggle => v === "0" || v === "1";
export const HAPTICS_KEY = "inferno:haptics";

/* ------------------------------------------------------------------ table and card designs */

/**
 * The player's chosen designs: a device preference (like graphics), so it lives in
 * localStorage beside the other settings rather than in the progress document.
 * These hooks return the saved choice, which may be a member design.
 */
export function useFeltChoice() {
  return useStored<FeltId>(FELT_KEY, DEFAULT_FELT, isFeltId);
}

export function useBackChoice() {
  return useStored<CardBackId>(BACK_KEY, DEFAULT_BACK, isBackId);
}

export interface TableLook {
  felt: FeltId;
  back: CardBackId;
}

/** The designs to draw: the saved choice, or the free default when it needs Pro and the player doesn't have it. */
export function useTableLook(): TableLook {
  const pro = useIsPro();
  const [felt] = useFeltChoice();
  const [back] = useBackChoice();
  return { felt: activeCosmetic("felt", felt, pro), back: activeCosmetic("back", back, pro) };
}

/** Same as `useTableLook()`, outside React (texture painters that run before any component). */
export function readTableLook(): TableLook {
  let felt: string | null = null;
  let back: string | null = null;
  try {
    felt = localStorage.getItem(FELT_KEY);
    back = localStorage.getItem(BACK_KEY);
  } catch {}
  const pro = typeof window !== "undefined" && isPro();
  return { felt: activeCosmetic("felt", felt, pro), back: activeCosmetic("back", back, pro) };
}
