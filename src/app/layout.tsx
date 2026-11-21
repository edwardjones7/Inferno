import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope, Unbounded } from "next/font/google";
import { Toaster } from "sonner";
import { AppShell } from "@/components/app-shell";
import { EmberField } from "@/components/ember-field";
import { NativeBridge } from "@/components/native-bridge";
import { PrefetchTable } from "@/components/prefetch-table";
import { PaywallHost } from "@/components/pro/paywall-host";
import { StreakKeeper } from "@/components/streak/streak-keeper";
import { OnlineKeeper } from "@/components/online/online-keeper";
import { TableLookSync } from "@/components/table-look-sync";
import "./globals.css";

// Modern back-room type: Unbounded for headings and buttons (heavy, wide, confident),
// Manrope for reading, JetBrains Mono for numbers. The mob flavour comes from the brass and
// ember palette and the copy, not from period fonts.
const unbounded = Unbounded({ variable: "--font-unbounded", subsets: ["latin"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Inferno: Poker & Blackjack Trainer", template: "%s · Inferno" },
  description: "Play poker against bots with personalities, play blackjack with a coach, and train every decision until it's automatic.",
  applicationName: "Inferno",
  appleWebApp: { capable: true, title: "Inferno", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0705",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${unbounded.variable} ${manrope.variable} ${jetbrains.variable} antialiased`}>
      <body>
        <EmberField />
        <AppShell>{children}</AppShell>
        <PrefetchTable />
        <NativeBridge />
        <PaywallHost />
        <StreakKeeper />
        <OnlineKeeper />
        <TableLookSync />
        <Toaster
          theme="dark"
          position="top-center"
          offset={{ top: "calc(env(safe-area-inset-top) + 64px)" }}
          mobileOffset={{ top: "calc(env(safe-area-inset-top) + 64px)" }}
          toastOptions={{
            style: { background: "#17110d", border: "1px solid rgb(184 153 90 / 0.45)", borderRadius: "6px", color: "#f6ede3", fontFamily: "var(--font-manrope)" },
          }}
        />
      </body>
    </html>
  );
}
