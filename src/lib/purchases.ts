"use client";

/**
 * In-app purchases for Inferno Pro, through RevenueCat.
 *
 * There is no Inferno server, so RevenueCat validates the App Store / Google Play receipts
 * and holds the `pro` entitlement. This module is the only caller of `setPro()`: it keeps
 * the cached entitlement in src/lib/pro.ts in step with RevenueCat.
 *
 * - Native only. On the web there is no store: `usePurchases().store` is "none" and the
 *   paywall explains that Pro is sold in the iOS/Android app.
 * - Fail safe. If the SDK errors (offline, not configured, store hiccup) the cached
 *   entitlement is kept. Only an answer from RevenueCat changes it.
 * - Prices always come from the store's offerings, never from this code.
 *
 * Setup (README "Inferno Pro"): `NEXT_PUBLIC_REVENUECAT_IOS_KEY`,
 * `NEXT_PUBLIC_REVENUECAT_ANDROID_KEY`, an entitlement with id `pro`, and a current
 * offering with a Monthly and an Annual package.
 */
import { Capacitor } from "@capacitor/core";
import type { CustomerInfo, PurchasesPackage, PurchasesPlugin, PurchasesStoreProduct } from "@revenuecat/purchases-capacitor";
import { useSyncExternalStore } from "react";
import { getProState, setPro, type ProState } from "./pro";

export const ENTITLEMENT_ID = "pro";

export type PlanId = "annual" | "monthly";

export interface Plan {
  id: PlanId;
  productId: string;
  /** store-formatted price for one period, e.g. "$79.99" */
  price: string;
  /** store-formatted price per month, e.g. "$6.67" (null if the store can't say) */
  perMonth: string | null;
  /** length of the free trial in days, if this player can get one */
  trialDays: number | null;
}

/** Which store sells Pro on this device. */
export type StoreKind = "app_store" | "play_store" | "none";

export interface PurchasesState {
  store: StoreKind;
  /**
   * loading: talking to the store. ready: offerings loaded. unavailable: no store here (web)
   * or this build has no API key. error: the store didn't answer; prices show as "—".
   */
  status: "idle" | "loading" | "ready" | "unavailable" | "error";
  plans: Record<PlanId, Plan | null>;
  /** where the player manages or cancels their subscription (from RevenueCat) */
  managementURL: string | null;
  busy: null | "purchase" | "restore";
}

export type PurchaseOutcome = "purchased" | "cancelled" | "pending" | "failed" | "unavailable";
export type RestoreOutcome = "restored" | "nothing" | "failed" | "unavailable";

/** Stores' own subscription pages, used when RevenueCat has no management URL yet. */
const STORE_SUBSCRIPTIONS: Record<Exclude<StoreKind, "none">, string> = {
  app_store: "https://apps.apple.com/account/subscriptions",
  play_store: "https://play.google.com/store/account/subscriptions",
};

const NO_PLANS: Record<PlanId, Plan | null> = { annual: null, monthly: null };

/* ------------------------------------------------------------------ pure helpers (tested) */

/** The Pro state RevenueCat's customer info implies. */
export function entitlementState(info: CustomerInfo): ProState {
  const e = info.entitlements.active[ENTITLEMENT_ID];
  if (!e || !e.isActive) return { active: false, expiresAt: null, productId: null };
  return {
    active: true,
    expiresAt: e.expirationDateMillis ?? null,
    productId: e.productIdentifier,
    willRenew: e.willRenew,
    trial: e.periodType === "TRIAL",
  };
}

const DAYS: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

/** Length of the product's free trial in days, or null if it has none. */
export function trialDaysOf(product: PurchasesStoreProduct): number | null {
  const intro = product.introPrice;
  if (intro && intro.price === 0 && DAYS[intro.periodUnit]) return intro.periodNumberOfUnits * DAYS[intro.periodUnit];
  // Google Play: the free phase of the default offer
  const free = product.defaultOption?.freePhase;
  if (free && DAYS[free.billingPeriod.unit]) return free.billingPeriod.value * DAYS[free.billingPeriod.unit];
  return null;
}

function formatMoney(amount: number, currency: string): string | null {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return null;
  }
}

export function planFromPackage(id: PlanId, pkg: PurchasesPackage, trialEligible = true): Plan {
  const p = pkg.product;
  const perMonth = id === "monthly" ? p.priceString : (p.pricePerMonthString ?? formatMoney(p.price / 12, p.currencyCode));
  return { id, productId: p.identifier, price: p.priceString, perMonth, trialDays: trialEligible ? trialDaysOf(p) : null };
}

/** Whole-percent saving of the yearly plan over twelve months of the monthly one, if any. */
export function yearlySavings(annual: PurchasesStoreProduct, monthly: PurchasesStoreProduct): number | null {
  if (annual.currencyCode !== monthly.currencyCode || monthly.price <= 0) return null;
  const pct = Math.floor((1 - annual.price / (monthly.price * 12)) * 100);
  return pct > 0 ? pct : null;
}

/* ------------------------------------------------------------------ state */

const initial = (): PurchasesState => ({ store: "none", status: "idle", plans: NO_PLANS, managementURL: null, busy: null });

let state: PurchasesState = initial();
let packages: Partial<Record<PlanId, PurchasesPackage>> = {};
let savings: number | null = null;
let sdk: PurchasesPlugin | null = null;
let starting: Promise<void> | null = null;
const listeners = new Set<() => void>();

function patch(next: Partial<PurchasesState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getPurchasesState = () => state;

export function usePurchases(): PurchasesState {
  return useSyncExternalStore(subscribe, getPurchasesState, initial);
}

/** Percent saved by paying yearly, from the store's prices (null until offerings load). */
export const getYearlySavings = () => savings;

function storeOf(platform: string): StoreKind {
  return platform === "ios" ? "app_store" : platform === "android" ? "play_store" : "none";
}

function apiKey(store: StoreKind): string | undefined {
  // literal property access so Next inlines the values at build time
  if (store === "app_store") return process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY || undefined;
  if (store === "play_store") return process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_KEY || undefined;
  return undefined;
}

/** Take RevenueCat's word on the entitlement (unless a dev override is on). */
function apply(info: CustomerInfo) {
  if (info.managementURL !== state.managementURL) patch({ managementURL: info.managementURL });
  if (DEV_OVERRIDE_AVAILABLE && getProState().dev) return;
  setPro(entitlementState(info));
}

/* ------------------------------------------------------------------ lifecycle */

/**
 * Configure RevenueCat and refresh the entitlement. Call once at app start (the paywall
 * host does); later calls return the same promise. Never throws.
 */
export function initPurchases(): Promise<void> {
  starting ??= start();
  return starting;
}

async function start() {
  const store = Capacitor.isNativePlatform() ? storeOf(Capacitor.getPlatform()) : "none";
  if (store === "none") return patch({ store, status: "unavailable" });
  const key = apiKey(store);
  if (!key) return patch({ store, status: "unavailable" });
  patch({ store, status: "loading" });
  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    await Purchases.configure({ apiKey: key });
    sdk = Purchases;
  } catch {
    // keep the cached entitlement; prices will show as unavailable
    return patch({ status: "error" });
  }
  try {
    await sdk.addCustomerInfoUpdateListener(apply);
  } catch {}
  await Promise.all([refreshEntitlement(), loadOfferings()]);
  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("resume", () => void refreshEntitlement());
  } catch {}
}

/** Ask RevenueCat for the latest entitlement. On failure the cached one stays. */
export async function refreshEntitlement(): Promise<void> {
  if (!sdk) return;
  try {
    const { customerInfo } = await sdk.getCustomerInfo();
    apply(customerInfo);
  } catch {}
}

/** Load the current offering's Monthly and Annual packages and their store prices. */
export async function loadOfferings(): Promise<void> {
  if (!sdk) return;
  try {
    const offerings = await sdk.getOfferings();
    const current = offerings.current;
    const annual = current?.annual ?? null;
    const monthly = current?.monthly ?? null;
    let annualTrial = true;
    // iOS answers whether this Apple ID can still take the free trial; Google only offers eligible ones.
    if (annual && state.store === "app_store") {
      try {
        const elig = await sdk.checkTrialOrIntroductoryPriceEligibility({ productIdentifiers: [annual.product.identifier] });
        // INTRO_ELIGIBILITY_STATUS_INELIGIBLE = 1
        annualTrial = elig[annual.product.identifier]?.status !== 1;
      } catch {}
    }
    packages = { annual: annual ?? undefined, monthly: monthly ?? undefined };
    savings = annual && monthly ? yearlySavings(annual.product, monthly.product) : null;
    patch({
      status: annual || monthly ? "ready" : "error",
      plans: {
        annual: annual ? planFromPackage("annual", annual, annualTrial) : null,
        monthly: monthly ? planFromPackage("monthly", monthly) : null,
      },
    });
  } catch {
    patch({ status: "error" });
  }
}

/* ------------------------------------------------------------------ actions */

const isCancel = (e: unknown) => {
  const err = e as { userCancelled?: boolean | null; code?: string } | null;
  return !!err && (err.userCancelled === true || err.code === "1");
};

export async function purchasePlan(id: PlanId): Promise<PurchaseOutcome> {
  const pkg = packages[id];
  if (!sdk || !pkg) return "unavailable";
  if (state.busy) return "failed";
  patch({ busy: "purchase" });
  try {
    const { customerInfo } = await sdk.purchasePackage({ aPackage: pkg });
    apply(customerInfo);
    return entitlementState(customerInfo).active ? "purchased" : "pending";
  } catch (e) {
    if (isCancel(e)) return "cancelled";
    // PAYMENT_PENDING_ERROR: Ask to Buy, or a slow payment method on Google Play
    if ((e as { code?: string } | null)?.code === "20") return "pending";
    return "failed";
  } finally {
    patch({ busy: null });
  }
}

export async function restorePurchases(): Promise<RestoreOutcome> {
  if (!sdk) return "unavailable";
  if (state.busy) return "failed";
  patch({ busy: "restore" });
  try {
    const { customerInfo } = await sdk.restorePurchases();
    apply(customerInfo);
    return entitlementState(customerInfo).active ? "restored" : "nothing";
  } catch {
    return "failed";
  } finally {
    patch({ busy: null });
  }
}

/** Open the store's subscription settings (cancel, switch plan). Returns false on the web. */
export function openSubscriptionManagement(): boolean {
  if (state.store === "none") return false;
  const url = state.managementURL ?? STORE_SUBSCRIPTIONS[state.store];
  // Capacitor hands navigation to other hosts to the system, which opens the store
  window.open(url, "_blank");
  return true;
}

/* ------------------------------------------------------------------ development override */

/**
 * Development builds only: toggle Pro without a store, for testing gated screens. Next
 * inlines NODE_ENV, so production builds compile this to `false` and drop the UI for it.
 */
export const DEV_OVERRIDE_AVAILABLE = process.env.NODE_ENV !== "production";

export function setDevPro(on: boolean) {
  if (process.env.NODE_ENV === "production") return;
  if (on) setPro({ active: true, expiresAt: null, productId: "dev-override", dev: true });
  else {
    setPro({ active: false, expiresAt: null, productId: null });
    // hand control back to the store's answer
    void refreshEntitlement();
  }
}

/** Test hook: forget everything so each test starts cold. */
export function __resetPurchasesForTests() {
  state = initial();
  packages = {};
  savings = null;
  sdk = null;
  starting = null;
}
