import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shells for iOS and Android. They bundle the static export in `out/` (see
 * next.config.ts), so the app runs fully offline. Rebuild + copy with `npm run cap:sync`.
 */
const config: CapacitorConfig = {
  appId: "app.inferno.trainer",
  appName: "Inferno",
  webDir: "out",
  backgroundColor: "#0a0705",
  ios: {
    contentInset: "never",
    backgroundColor: "#0a0705",
    scrollEnabled: true,
  },
  android: {
    backgroundColor: "#0a0705",
  },
  plugins: {
    SplashScreen: {
      // hidden by NativeBridge once the first screen has painted
      launchAutoHide: false,
      launchShowDuration: 3000,
      backgroundColor: "#0a0705",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      overlaysWebView: true,
    },
  },
};

export default config;
