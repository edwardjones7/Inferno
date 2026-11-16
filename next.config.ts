import type { NextConfig } from "next";

/**
 * Inferno is a fully static app: every game, bot and drill runs on the device. `next build`
 * writes plain HTML/JS/CSS to `out/`, which is served as the website/PWA and bundled into
 * the iOS and Android apps by Capacitor (see capacitor.config.ts).
 */
const nextConfig: NextConfig = {
  output: "export",
  // `/play/` -> `/play/index.html`, which static hosts and the native WebView resolve directly
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
