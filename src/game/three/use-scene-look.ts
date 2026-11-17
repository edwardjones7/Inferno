"use client";

import { useLayoutEffect } from "react";
import { useTableLook, type TableLook } from "@/lib/settings";
import { setCardBackDesign } from "./card-textures";

/**
 * The table and card designs for a 3D scene, resolved for Pro (a lapsed member sees the
 * free defaults). Also keeps the shared card back texture painted with the current design.
 * Table bodies call this; textures are cached per design, so switching costs one repaint.
 */
export function useSceneLook(): TableLook {
  const look = useTableLook();
  useLayoutEffect(() => setCardBackDesign(look.back), [look.back]);
  return look;
}
