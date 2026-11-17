import type { CustomerInfo, PurchasesPackage, PurchasesStoreProduct } from "@revenuecat/purchases-capacitor";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------------------------------------------ mocks */

const platform = vi.hoisted(() => ({ native: true, name: "ios" }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => platform.native, getPlatform: () => platform.name },
}));
vi.mock("@capacitor/app", () => ({ App: { addListener: vi.fn(async () => ({ remove: async () => {} })) } }));

const rc = vi.hoisted(() => ({
  configure: vi.fn(),
  addCustomerInfoUpdateListener: vi.fn(),
  getCustomerInfo: vi.fn(),
  getOfferings: vi.fn(),
  checkTrialOrIntroductoryPriceEligibility: vi.fn(),
  purchasePackage: vi.fn(),
  restorePurchases: vi.fn(),
}));
vi.mock("@revenuecat/purchases-capacitor", () => ({ Purchases: rc }));

// a tiny localStorage so the Pro cache persists like on a device
const mem = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
});

import { getProState, setPro } from "./pro";
import {
  __resetPurchasesForTests,
  entitlementState,
  getPurchasesState,
  getYearlySavings,
  initPurchases,
  purchasePlan,
  refreshEntitlement,
  restorePurchases,
  setDevPro,
  trialDaysOf,
} from "./purchases";

/* ------------------------------------------------------------------ fixtures */

const DAY = 86_400_000;

function info(active: boolean, extra: Partial<{ willRenew: boolean; periodType: string; expires: number }> = {}): CustomerInfo {
  const ent = {
    identifier: "pro",
    isActive: true,
    willRenew: extra.willRenew ?? true,
    periodType: extra.periodType ?? "NORMAL",
    expirationDateMillis: extra.expires ?? Date.now() + 30 * DAY,
    productIdentifier: "inferno_pro_yearly",
  };
  return {
    entitlements: { active: active ? { pro: ent } : {}, all: { pro: ent } },
    managementURL: "https://apps.apple.com/account/subscriptions",
  } as unknown as CustomerInfo;
}

function product(over: Partial<PurchasesStoreProduct>): PurchasesStoreProduct {
  return {
    identifier: "x",
    price: 0,
    priceString: "",
    currencyCode: "USD",
    pricePerMonthString: null,
    introPrice: null,
    defaultOption: null,
    ...over,
  } as PurchasesStoreProduct;
}

const annual = {
  identifier: "$rc_annual",
  product: product({
    identifier: "inferno_pro_yearly",
    price: 79.99,
    priceString: "$79.99",
    pricePerMonthString: "$6.67",
    introPrice: { price: 0, priceString: "$0.00", cycles: 1, period: "P1W", periodUnit: "DAY", periodNumberOfUnits: 7 },
  }),
} as unknown as PurchasesPackage;
const monthly = {
  identifier: "$rc_monthly",
  product: product({ identifier: "inferno_pro_monthly", price: 12.99, priceString: "$12.99" }),
} as unknown as PurchasesPackage;

beforeEach(() => {
  mem.clear();
  setPro({ active: false, expiresAt: null, productId: null });
  __resetPurchasesForTests();
  Object.values(rc).forEach((f) => f.mockReset());
  platform.native = true;
  platform.name = "ios";
  process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY = "appl_test";
  process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_KEY = "goog_test";
  rc.configure.mockResolvedValue(undefined);
  rc.addCustomerInfoUpdateListener.mockResolvedValue("cb");
  rc.getCustomerInfo.mockResolvedValue({ customerInfo: info(false) });
  rc.getOfferings.mockResolvedValue({ all: {}, current: { annual, monthly } });
  rc.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({ inferno_pro_yearly: { status: 2, description: "" } });
});

/* ------------------------------------------------------------------ tests */

describe("entitlementState", () => {
  it("reads the pro entitlement", () => {
    const exp = Date.now() + 5 * DAY;
    expect(entitlementState(info(true, { expires: exp, periodType: "TRIAL", willRenew: false }))).toEqual({
      active: true,
      expiresAt: exp,
      productId: "inferno_pro_yearly",
      willRenew: false,
      trial: true,
    });
    expect(entitlementState(info(false)).active).toBe(false);
  });
});

describe("trialDaysOf", () => {
  it("reads an App Store intro offer and a Play free phase", () => {
    expect(trialDaysOf(annual.product)).toBe(7);
    const play = product({ defaultOption: { freePhase: { billingPeriod: { unit: "WEEK", value: 1, iso8601: "P1W" } } } as never });
    expect(trialDaysOf(play)).toBe(7);
    expect(trialDaysOf(monthly.product)).toBeNull();
  });
});

describe("initPurchases", () => {
  it("does nothing on the web and keeps the cached entitlement", async () => {
    platform.native = false;
    setPro({ active: true, expiresAt: null, productId: "inferno_pro_yearly" });
    await initPurchases();
    expect(rc.configure).not.toHaveBeenCalled();
    expect(getPurchasesState()).toMatchObject({ store: "none", status: "unavailable" });
    expect(getProState().active).toBe(true);
  });

  it("is unavailable without an API key", async () => {
    process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY = "";
    await initPurchases();
    expect(rc.configure).not.toHaveBeenCalled();
    expect(getPurchasesState()).toMatchObject({ store: "app_store", status: "unavailable" });
  });

  it("configures with the platform key, refreshes the entitlement and loads store prices", async () => {
    platform.name = "android";
    rc.getCustomerInfo.mockResolvedValue({ customerInfo: info(true) });
    await initPurchases();
    expect(rc.configure).toHaveBeenCalledWith({ apiKey: "goog_test" });
    expect(getProState().active).toBe(true);
    const s = getPurchasesState();
    expect(s.status).toBe("ready");
    expect(s.plans.annual).toMatchObject({ price: "$79.99", perMonth: "$6.67", trialDays: 7 });
    expect(s.plans.monthly).toMatchObject({ price: "$12.99", perMonth: "$12.99", trialDays: null });
    expect(getYearlySavings()).toBe(48);
  });

  it("only configures once", async () => {
    await Promise.all([initPurchases(), initPurchases()]);
    await initPurchases();
    expect(rc.configure).toHaveBeenCalledTimes(1);
  });

  it("hides the trial when the Apple ID already used it", async () => {
    rc.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({ inferno_pro_yearly: { status: 1, description: "" } });
    await initPurchases();
    expect(getPurchasesState().plans.annual?.trialDays).toBeNull();
  });

  it("keeps the cached entitlement when the SDK errors", async () => {
    setPro({ active: true, expiresAt: Date.now() + DAY, productId: "inferno_pro_monthly" });
    rc.getCustomerInfo.mockRejectedValue(new Error("offline"));
    rc.getOfferings.mockRejectedValue(new Error("offline"));
    await initPurchases();
    expect(getProState().active).toBe(true);
    expect(getPurchasesState().status).toBe("error");
  });

  it("keeps the cached entitlement when configure fails", async () => {
    setPro({ active: true, expiresAt: Date.now() + DAY, productId: "inferno_pro_monthly" });
    rc.configure.mockRejectedValue(new Error("bad key"));
    await initPurchases();
    expect(getProState().active).toBe(true);
    expect(await purchasePlan("annual")).toBe("unavailable");
  });

  it("follows customer-info updates from the SDK", async () => {
    await initPurchases();
    const listener = rc.addCustomerInfoUpdateListener.mock.calls[0][0] as (i: CustomerInfo) => void;
    listener(info(true));
    expect(getProState().active).toBe(true);
    listener(info(false));
    expect(getProState().active).toBe(false);
  });
});

describe("purchase and restore", () => {
  beforeEach(async () => {
    await initPurchases();
  });

  it("grants Pro after a purchase", async () => {
    rc.purchasePackage.mockResolvedValue({ productIdentifier: "inferno_pro_yearly", customerInfo: info(true) });
    expect(await purchasePlan("annual")).toBe("purchased");
    expect(rc.purchasePackage).toHaveBeenCalledWith({ aPackage: annual });
    expect(getProState().active).toBe(true);
    expect(getPurchasesState().busy).toBeNull();
  });

  it("reports a cancelled purchase and changes nothing", async () => {
    rc.purchasePackage.mockRejectedValue({ code: "1", userCancelled: true, message: "cancelled" });
    expect(await purchasePlan("monthly")).toBe("cancelled");
    expect(getProState().active).toBe(false);
  });

  it("reports pending payments and failures", async () => {
    rc.purchasePackage.mockRejectedValueOnce({ code: "20", userCancelled: false });
    expect(await purchasePlan("annual")).toBe("pending");
    rc.purchasePackage.mockRejectedValueOnce({ code: "2", userCancelled: false });
    expect(await purchasePlan("annual")).toBe("failed");
  });

  it("restores an existing subscription", async () => {
    rc.restorePurchases.mockResolvedValue({ customerInfo: info(true) });
    expect(await restorePurchases()).toBe("restored");
    expect(getProState().active).toBe(true);
  });

  it("says when there is nothing to restore", async () => {
    rc.restorePurchases.mockResolvedValue({ customerInfo: info(false) });
    expect(await restorePurchases()).toBe("nothing");
  });

  it("keeps Pro when restore errors", async () => {
    setPro({ active: true, expiresAt: Date.now() + DAY, productId: "inferno_pro_yearly" });
    rc.restorePurchases.mockRejectedValue({ code: "10" });
    expect(await restorePurchases()).toBe("failed");
    expect(getProState().active).toBe(true);
  });

  it("drops Pro when RevenueCat says it expired", async () => {
    setPro({ active: true, expiresAt: Date.now() + DAY, productId: "inferno_pro_yearly" });
    rc.getCustomerInfo.mockResolvedValue({ customerInfo: info(false) });
    await refreshEntitlement();
    expect(getProState().active).toBe(false);
  });
});

describe("development override", () => {
  it("turns Pro on and survives store refreshes until turned off", async () => {
    await initPurchases();
    setDevPro(true);
    expect(getProState()).toMatchObject({ active: true, dev: true });
    await refreshEntitlement();
    expect(getProState().active).toBe(true);
    setDevPro(false);
    expect(getProState().active).toBe(false);
  });
});
