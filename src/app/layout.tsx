import type { Metadata, Viewport } from "next";
import { Courier_Prime, Limelight, Manrope, Marcellus_SC } from "next/font/google";
import { Toaster } from "sonner";
import { AppShell } from "@/components/app-shell";
import { EmberField } from "@/components/ember-field";
import { NativeBridge } from "@/components/native-bridge";
import { PrefetchTable } from "@/components/prefetch-table";
import { PaywallHost } from "@/components/pro/paywall-host";
import "./globals.css";

// Speakeasy type: a marquee face for the big headlines, a calm deco small-caps face for
// the other headings and labels, a typewriter for numbers (the bookie's ledger), and
// Manrope for reading.
const limelight = Limelight({ variable: "--font-limelight", subsets: ["latin"], weight: "400" });
const marcellus = Marcellus_SC({ variable: "--font-marcellus", subsets: ["latin"], weight: "400" });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const courier = Courier_Prime({ variable: "--font-courier", subsets: ["latin"], weight: ["400", "700"] });

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
    <html lang="en" className={`${limelight.variable} ${marcellus.variable} ${manrope.variable} ${courier.variable} antialiased`}>
      <body>
        <EmberField />
        <AppShell>{children}</AppShell>
        <PrefetchTable />
        <NativeBridge />
        <PaywallHost />
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
