"use client";

import { useStored } from "./use-stored";

/**
 * Graphics quality for the 3D tables.
 * - high: full post-processing (bloom, depth of field, grading), soft shadows, retina DPR
 * - low: no post-processing, cheaper shadows, capped DPR: smooth on phones
 * - flat: the 2D tables, no WebGL at all
 * - auto: low on phones and small/low-memory devices, high elsewhere
 */
export type Graphics = "auto" | "high" | "low" | "flat";
export const isGraphics = (v: unknown): v is Graphics => v === "auto" || v === "high" || v === "low" || v === "flat";
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

export function resolveQuality(g: Graphics): "high" | "low" | "flat" {
  return g === "auto" ? autoQuality() : g;
}

export type Toggle = "0" | "1";
export const isToggle = (v: unknown): v is Toggle => v === "0" || v === "1";
export const HAPTICS_KEY = "inferno:haptics";
