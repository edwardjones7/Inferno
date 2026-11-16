"use client";

import { Capacitor } from "@capacitor/core";
import { useEffect } from "react";

/**
 * Platform glue, mounted once.
 * - Native app (Capacitor): dark translucent status bar, hide the splash once the first
 *   screen has painted, and make Android's back button walk browser history.
 * - Web: register the service worker (production only) so the app installs and works offline.
 */
export function NativeBridge() {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      document.documentElement.dataset.native = Capacitor.getPlatform();
      let remove: (() => void) | undefined;
      void (async () => {
        const [{ StatusBar, Style }, { SplashScreen }, { App }] = await Promise.all([
          import("@capacitor/status-bar"),
          import("@capacitor/splash-screen"),
          import("@capacitor/app"),
        ]);
        await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
        if (Capacitor.getPlatform() === "android") {
          await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
        }
        requestAnimationFrame(() => void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {}));
        const handle = await App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack) window.history.back();
          else void App.minimizeApp();
        });
        remove = () => void handle.remove();
      })();
      return () => remove?.();
    }
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      const register = () => void navigator.serviceWorker.register("/sw.js").catch(() => {});
      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
    }
  }, []);
  return null;
}
