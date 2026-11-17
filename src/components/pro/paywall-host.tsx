"use client";

import { AnimatePresence } from "motion/react";
import { usePathname } from "next/navigation";
import { lazy, Suspense, useEffect, useState } from "react";
import { onPaywallRequest } from "@/lib/pro";
import { initPurchases } from "@/lib/purchases";

// the sheet (and the lesson/bot copy it reads) loads the first time someone opens it
const Paywall = lazy(() => import("./paywall").then((m) => ({ default: m.Paywall })));

/**
 * Mounted once in the root layout. Starts the store connection (which refreshes the cached
 * entitlement on launch) and shows the paywall whenever a screen calls `openPaywall()`.
 */
export function PaywallHost() {
  const [open, setOpen] = useState<{ reason: string | null; n: number } | null>(null);
  const path = usePathname();
  const [shownOn, setShownOn] = useState(path);

  useEffect(() => {
    void initPurchases();
    return onPaywallRequest((reason) => setOpen((o) => ({ reason, n: (o?.n ?? 0) + 1 })));
  }, []);

  // navigating away (Android back, a link) closes it
  if (path !== shownOn) {
    setShownOn(path);
    if (open) setOpen(null);
  }

  return (
    <Suspense fallback={null}>
      <AnimatePresence>{open && <Paywall key={open.n} reason={open.reason} onClose={() => setOpen(null)} />}</AnimatePresence>
    </Suspense>
  );
}
