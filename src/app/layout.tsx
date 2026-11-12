import type { Metadata } from "next";
import { JetBrains_Mono, Manrope, Unbounded } from "next/font/google";
import { Toaster } from "sonner";
import { EmberField } from "@/components/ember-field";
import { Header } from "@/components/header";
import { WalletProvider } from "@/components/wallet-provider";
import "./globals.css";

const unbounded = Unbounded({ variable: "--font-unbounded", subsets: ["latin"], weight: ["500", "700", "900"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Inferno — Provably fair crypto blackjack", template: "%s · Inferno" },
  description: "Provably fair crypto blackjack with paper funds. Play hot, verify every shuffle.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${unbounded.variable} ${manrope.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <WalletProvider>
          <EmberField />
          <Header />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-ash-800/80 px-4 py-6 text-center text-xs text-ash-500">
            Inferno is a demo with paper funds only. Nothing here has real-world value.
          </footer>
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: { background: "#17110d", border: "1px solid #3d2e24", color: "#f6ede3", fontFamily: "var(--font-manrope)" },
            }}
          />
        </WalletProvider>
      </body>
    </html>
  );
}
