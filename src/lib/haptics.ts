"use client";

/**
 * Haptic feedback. In the native app it goes through Capacitor's Haptics plugin (Taptic
 * Engine on iOS); in a mobile browser it falls back to navigator.vibrate where supported.
 * Desktop browsers do nothing.
 */
import { Capacitor } from "@capacitor/core";
import { HAPTICS_KEY } from "./settings";

export type Haptic = "tap" | "light" | "medium" | "heavy" | "success" | "warning" | "error";

const native = typeof window !== "undefined" && Capacitor.isNativePlatform();
let plugin: Promise<typeof import("@capacitor/haptics")> | null = null;

function enabled() {
  try {
    return localStorage.getItem(HAPTICS_KEY) !== "0";
  } catch {
    return true;
  }
}

const VIBRATE: Record<Haptic, number | number[]> = {
  tap: 6,
  light: 10,
  medium: 18,
  heavy: 30,
  success: [12, 60, 18],
  warning: [20, 50, 20],
  error: [30, 40, 30, 40, 30],
};

export function haptic(kind: Haptic, delaySec = 0) {
  if (typeof window === "undefined" || !enabled()) return;
  const fire = () => {
    if (native) {
      plugin ??= import("@capacitor/haptics");
      void plugin
        .then(({ Haptics, ImpactStyle, NotificationType }) => {
          if (kind === "success") return Haptics.notification({ type: NotificationType.Success });
          if (kind === "warning") return Haptics.notification({ type: NotificationType.Warning });
          if (kind === "error") return Haptics.notification({ type: NotificationType.Error });
          if (kind === "tap") return Haptics.selectionChanged();
          return Haptics.impact({ style: kind === "heavy" ? ImpactStyle.Heavy : kind === "medium" ? ImpactStyle.Medium : ImpactStyle.Light });
        })
        .catch(() => {});
      return;
    }
    try {
      navigator.vibrate?.(VIBRATE[kind]);
    } catch {}
  };
  if (delaySec > 0) setTimeout(fire, delaySec * 1000);
  else fire();
}
