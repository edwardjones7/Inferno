"use client";

import { useEffect } from "react";
import { useTableLook } from "@/lib/settings";

/**
 * Marks the page with the active table design (`<html data-felt="…">`) so the flat CSS
 * tables and loading placeholders (the `felt` utility) match the 3D table.
 */
export function TableLookSync() {
  const { felt } = useTableLook();
  useEffect(() => {
    document.documentElement.dataset.felt = felt;
  }, [felt]);
  return null;
}
