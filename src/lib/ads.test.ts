import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AD_POLICY,
  canShowInterstitial,
  freshRecord,
  interstitialBlock,
  noteInterstitial,
  noteRewarded,
  parseRecord,
  startSession,
  type AdRecord,
} from "./ad-policy";
import { resolveUnits, TEST_UNITS } from "./ads";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/* ------------------------------------------------------------------ pure policy */

describe("interstitial frequency caps", () => {
  const t0 = Date.UTC(2026, 10, 1);
  /** a player on their `n`th launch, `into` ms into the session, installed a day earlier */
  const at = (n: number, into = 10 * MIN): { r: AdRecord; now: number } => {
    let r = freshRecord(t0);
    for (let i = 1; i < n; i++) r = startSession(r, t0 + DAY);
    return { r, now: t0 + DAY + into };
  };

  it("never shows during the first session, however long it runs", () => {
    const r = freshRecord(t0);
    expect(interstitialBlock(r, t0 + 5 * 60 * MIN, false)).toBe("first-session");
  });

  it("shows on a later session once the grace periods are over", () => {
    const { r, now } = at(2);
    expect(canShowInterstitial(r, now, false)).toBe(true);
  });

  it("never shows to Pro members", () => {
    const { r, now } = at(5);
    expect(interstitialBlock(r, now, true)).toBe("pro");
  });

  it("waits out the first minutes after install, even on a second launch", () => {
    let r = freshRecord(t0);
    r = startSession(r, t0 + 2 * MIN);
    expect(interstitialBlock(r, t0 + 2 * MIN + AD_POLICY.sessionGraceMs + 1, false)).toBe("install-grace");
  });

  it("waits out the first minutes of every session", () => {
    const { r } = at(3);
    expect(interstitialBlock(r, t0 + DAY + MIN, false)).toBe("session-grace");
    expect(interstitialBlock(r, t0 + DAY + AD_POLICY.sessionGraceMs, false)).toBeNull();
  });

  it("keeps a minimum gap between interstitials", () => {
    const { r, now } = at(2);
    const shown = noteInterstitial(r, now);
    expect(interstitialBlock(shown, now + MIN, false)).toBe("too-soon");
    expect(interstitialBlock(shown, now + AD_POLICY.minGapMs, false)).toBeNull();
  });

  it("caps interstitials per session, and the cap resets next launch", () => {
    let { r, now } = at(2);
    for (let i = 0; i < AD_POLICY.maxPerSession; i++) {
      expect(canShowInterstitial(r, now, false)).toBe(true);
      r = noteInterstitial(r, now);
      now += AD_POLICY.minGapMs;
    }
    expect(interstitialBlock(r, now, false)).toBe("session-cap");
    const next = startSession(r, now + DAY);
    expect(canShowInterstitial(next, now + DAY + AD_POLICY.sessionGraceMs, false)).toBe(true);
  });

  it("doesn't follow a rewarded ad with an interstitial", () => {
    const { r, now } = at(2);
    const watched = noteRewarded(r, now);
    expect(interstitialBlock(watched, now + MIN, false)).toBe("after-rewarded");
    expect(canShowInterstitial(watched, now + AD_POLICY.afterRewardedMs, false)).toBe(true);
  });

  it("parses stored records defensively", () => {
    expect(parseRecord(null)).toBeNull();
    expect(parseRecord("not json")).toBeNull();
    expect(parseRecord(JSON.stringify({ sessions: 2 }))).toBeNull();
    const r = parseRecord(JSON.stringify({ firstSeenAt: 5, sessions: 3, lastInterstitialAt: "x" }));
    expect(r).toEqual({ firstSeenAt: 5, sessions: 3, sessionStart: 5, sessionShown: 0, lastInterstitialAt: null, lastRewardedAt: null });
  });
});

describe("ad unit ids", () => {
  const env = { iosInterstitial: "ca-app-pub-1/1", iosRewarded: " ca-app-pub-1/2 ", androidRewarded: "ca-app-pub-1/3" };

  it("uses Google's test units in development", () => {
    expect(resolveUnits("ios", env, false)).toEqual({ ...TEST_UNITS.ios, testing: true });
    expect(resolveUnits("android", {}, false)).toEqual({ ...TEST_UNITS.android, testing: true });
  });

  it("uses the configured units in production and switches off formats without one", () => {
    expect(resolveUnits("ios", env, true)).toEqual({ interstitial: "ca-app-pub-1/1", rewarded: "ca-app-pub-1/2", testing: false });
    expect(resolveUnits("android", env, true)).toEqual({ interstitial: null, rewarded: "ca-app-pub-1/3", testing: false });
  });

  it("can force test units in a production build", () => {
    expect(resolveUnits("android", { ...env, test: "1" }, true).testing).toBe(true);
  });

  it("has no units on the web", () => {
    expect(resolveUnits("web", env, true)).toEqual({ interstitial: null, rewarded: null, testing: false });
  });
});

/* ------------------------------------------------------------------ ads.ts with a mocked plugin */

const fake = vi.hoisted(() => {
  const listeners = new Map<string, Set<(d?: unknown) => void>>();
  const fire = (ev: string) => listeners.get(ev)?.forEach((f) => f());
  const EV = {
    iDismissed: "interstitialAdDismissed",
    iFailedToShow: "interstitialAdFailedToShow",
    rRewarded: "onRewardedVideoAdReward",
    rDismissed: "onRewardedVideoAdDismissed",
    rFailedToShow: "onRewardedVideoAdFailedToShow",
  };
  const s = {
    native: true,
    platform: "ios",
    pro: false,
    consent: { status: "NOT_REQUIRED", isConsentFormAvailable: false, canRequestAds: true, privacyOptionsRequirementStatus: "NOT_REQUIRED" },
    afterForm: { status: "OBTAINED", isConsentFormAvailable: true, canRequestAds: true, privacyOptionsRequirementStatus: "REQUIRED" },
    tracking: "notDetermined",
    loadFails: false,
    /** what happens when a rewarded ad is shown */
    reward: (() => new Promise(() => {})) as () => Promise<unknown>,
  };
  const later = (fn: () => void, ms = 0) => setTimeout(fn, ms);
  const AdMob = {
    requestConsentInfo: vi.fn(async () => s.consent),
    showConsentForm: vi.fn(async () => s.afterForm),
    showPrivacyOptionsForm: vi.fn(async () => {}),
    trackingAuthorizationStatus: vi.fn(async () => ({ status: s.tracking })),
    requestTrackingAuthorization: vi.fn(async () => {}),
    initialize: vi.fn(async () => {}),
    addListener: vi.fn(async (ev: string, fn: () => void) => {
      if (!listeners.has(ev)) listeners.set(ev, new Set());
      listeners.get(ev)!.add(fn);
      return { remove: async () => void listeners.get(ev)?.delete(fn) };
    }),
    prepareInterstitial: vi.fn(async (o: { adId: string }) => {
      if (s.loadFails) throw new Error("no fill");
      return { adUnitId: o.adId };
    }),
    prepareRewardVideoAd: vi.fn(async (o: { adId: string }) => {
      if (s.loadFails) throw new Error("no fill");
      return { adUnitId: o.adId };
    }),
    showInterstitial: vi.fn(async () => void later(() => fire(EV.iDismissed))),
    showRewardVideoAd: vi.fn(() => s.reward()),
  };
  return { s, fire, later, EV, AdMob, listeners };
});

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => fake.s.native, getPlatform: () => (fake.s.native ? fake.s.platform : "web") },
}));
vi.mock("./pro", () => ({ isPro: () => fake.s.pro }));
vi.mock("@capacitor-community/admob", () => ({
  AdMob: fake.AdMob,
  AdmobConsentStatus: { REQUIRED: "REQUIRED", OBTAINED: "OBTAINED", NOT_REQUIRED: "NOT_REQUIRED", UNKNOWN: "UNKNOWN" },
  AdmobConsentDebugGeography: { DISABLED: 0, EEA: 1 },
  PrivacyOptionsRequirementStatus: { REQUIRED: "REQUIRED", NOT_REQUIRED: "NOT_REQUIRED", UNKNOWN: "UNKNOWN" },
  InterstitialAdPluginEvents: { Dismissed: fake.EV.iDismissed, FailedToShow: fake.EV.iFailedToShow },
  RewardAdPluginEvents: { Rewarded: fake.EV.rRewarded, Dismissed: fake.EV.rDismissed, FailedToShow: fake.EV.rFailedToShow },
}));

const storage = new Map<string, string>();
const T0 = Date.UTC(2026, 10, 1, 12);

async function loadAds() {
  vi.resetModules();
  return import("./ads");
}
/** a returning player: installed yesterday, one session played, prompts optionally done */
function returningPlayer(prepared: boolean) {
  storage.set("inferno:ads:v1", JSON.stringify({ ...freshRecord(T0 - DAY), sessions: 1 }));
  if (prepared) storage.set("inferno:ads:prepared", "1");
}
const flush = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => {
  storage.clear();
  fake.listeners.clear();
  vi.clearAllMocks();
  Object.assign(fake.s, {
    native: true,
    platform: "ios",
    pro: false,
    tracking: "notDetermined",
    loadFails: false,
    consent: { status: "NOT_REQUIRED", isConsentFormAvailable: false, canRequestAds: true, privacyOptionsRequirementStatus: "NOT_REQUIRED" },
    reward: () => new Promise(() => {}),
  });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ads gating", () => {
  it("is off on the web", async () => {
    fake.s.native = false;
    const ads = await loadAds();
    expect(ads.adsEnabled()).toBe(false);
    expect(ads.rewardedAdsAvailable()).toBe(false);
    expect(await ads.showRewardedAd("chips")).toBe(false);
    await ads.maybeShowInterstitial("match-end");
    expect(fake.AdMob.requestConsentInfo).not.toHaveBeenCalled();
  });

  it("gives Pro members rewarded ads but no interstitials", async () => {
    fake.s.pro = true;
    returningPlayer(true);
    const ads = await loadAds();
    expect(ads.adsEnabled()).toBe(false);
    expect(ads.rewardedAdsAvailable()).toBe(true);
    vi.setSystemTime(T0 + 30 * MIN);
    await ads.maybeShowInterstitial("match-end");
    await flush();
    expect(fake.AdMob.prepareInterstitial).not.toHaveBeenCalled();
    expect(fake.AdMob.showInterstitial).not.toHaveBeenCalled();
  });

  it("prompts for nothing and shows nothing in the first session", async () => {
    const ads = await loadAds();
    expect(ads.adsEnabled()).toBe(true);
    vi.setSystemTime(T0 + 60 * MIN);
    await ads.maybeShowInterstitial("match-end");
    expect(fake.AdMob.requestConsentInfo).not.toHaveBeenCalled();
    expect(fake.AdMob.requestTrackingAuthorization).not.toHaveBeenCalled();
  });
});

describe("interstitials", () => {
  it("uses the first break of a later session for consent and tracking, then preloads", async () => {
    returningPlayer(false);
    fake.s.consent = { status: "REQUIRED", isConsentFormAvailable: true, canRequestAds: false, privacyOptionsRequirementStatus: "REQUIRED" };
    const ads = await loadAds();
    vi.setSystemTime(T0 + 30 * MIN);
    await ads.maybeShowInterstitial("blackjack-leave");
    await flush();
    expect(fake.AdMob.showConsentForm).toHaveBeenCalledOnce();
    expect(fake.AdMob.requestTrackingAuthorization).toHaveBeenCalledOnce();
    expect(fake.AdMob.initialize).toHaveBeenCalledOnce();
    // consent and tracking come before the SDK starts
    expect(fake.AdMob.showConsentForm.mock.invocationCallOrder[0]).toBeLessThan(fake.AdMob.initialize.mock.invocationCallOrder[0]);
    expect(fake.AdMob.requestTrackingAuthorization.mock.invocationCallOrder[0]).toBeLessThan(fake.AdMob.initialize.mock.invocationCallOrder[0]);
    expect(fake.AdMob.prepareInterstitial).toHaveBeenCalledWith(expect.objectContaining({ adId: TEST_UNITS.ios.interstitial, isTesting: true }));
    expect(fake.AdMob.showInterstitial).not.toHaveBeenCalled();
    expect(storage.get("inferno:ads:prepared")).toBe("1");
  });

  it("doesn't ask for tracking on Android or when already decided", async () => {
    returningPlayer(false);
    fake.s.platform = "android";
    const ads = await loadAds();
    vi.setSystemTime(T0 + 30 * MIN);
    await ads.maybeShowInterstitial("match-end");
    await flush();
    expect(fake.AdMob.trackingAuthorizationStatus).not.toHaveBeenCalled();
    expect(fake.AdMob.initialize).toHaveBeenCalledOnce();
  });

  it("requests no ads when consent rules them out", async () => {
    returningPlayer(false);
    fake.s.consent = { status: "REQUIRED", isConsentFormAvailable: true, canRequestAds: false, privacyOptionsRequirementStatus: "REQUIRED" };
    fake.s.afterForm = { ...fake.s.afterForm, canRequestAds: false };
    const ads = await loadAds();
    vi.setSystemTime(T0 + 30 * MIN);
    await ads.maybeShowInterstitial("match-end");
    await flush();
    expect(fake.AdMob.initialize).not.toHaveBeenCalled();
    expect(fake.AdMob.prepareInterstitial).not.toHaveBeenCalled();
    expect(ads.rewardedAdsAvailable()).toBe(false);
    fake.s.afterForm = { ...fake.s.afterForm, canRequestAds: true };
  });

  it("shows a preloaded ad at a break, waits for it to close, then respects the gap", async () => {
    returningPlayer(true);
    const ads = await loadAds();
    vi.setSystemTime(T0 + 1 * MIN);
    await ads.maybeShowInterstitial("match-end"); // too early in the session: preload only
    await flush();
    expect(fake.AdMob.prepareInterstitial).toHaveBeenCalledOnce();
    expect(fake.AdMob.showInterstitial).not.toHaveBeenCalled();

    vi.setSystemTime(T0 + AD_POLICY.sessionGraceMs + MIN);
    await ads.maybeShowInterstitial("match-end");
    expect(fake.AdMob.showInterstitial).toHaveBeenCalledOnce();
    await flush();
    expect(fake.AdMob.prepareInterstitial).toHaveBeenCalledTimes(2); // the next one is preloaded

    vi.setSystemTime(T0 + AD_POLICY.sessionGraceMs + 2 * MIN);
    await ads.maybeShowInterstitial("blackjack-leave");
    expect(fake.AdMob.showInterstitial).toHaveBeenCalledOnce();

    vi.setSystemTime(T0 + AD_POLICY.sessionGraceMs + MIN + AD_POLICY.minGapMs);
    await ads.maybeShowInterstitial("blackjack-leave");
    expect(fake.AdMob.showInterstitial).toHaveBeenCalledTimes(2);
  });

  it("never waits for an ad to load at a break", async () => {
    returningPlayer(true);
    fake.AdMob.prepareInterstitial.mockImplementationOnce(() => new Promise(() => {}));
    const ads = await loadAds();
    vi.setSystemTime(T0 + 30 * MIN);
    await ads.maybeShowInterstitial("match-end"); // resolves although the load never finishes
    expect(fake.AdMob.showInterstitial).not.toHaveBeenCalled();
  });
});

describe("rewarded ads", () => {
  it("resolves true only when the reward event fires", async () => {
    fake.s.reward = () => {
      fake.later(() => {
        fake.fire(fake.EV.rRewarded);
        fake.fire(fake.EV.rDismissed);
      });
      return new Promise(() => {});
    };
    const ads = await loadAds();
    expect(await ads.showRewardedAd("chips")).toBe(true);
    await flush();
    expect(fake.AdMob.prepareRewardVideoAd).toHaveBeenCalledTimes(2); // loaded, then the next one preloaded
  });

  it("counts a reward that arrives just after the dismiss event", async () => {
    fake.s.reward = () => {
      fake.later(() => fake.fire(fake.EV.rDismissed));
      fake.later(() => fake.fire(fake.EV.rRewarded), 50);
      return new Promise(() => {});
    };
    const ads = await loadAds();
    expect(await ads.showRewardedAd("chips")).toBe(true);
  });

  it("resolves false when dismissed early", async () => {
    fake.s.reward = () => {
      fake.later(() => fake.fire(fake.EV.rDismissed));
      return new Promise(() => {});
    };
    const ads = await loadAds();
    expect(await ads.showRewardedAd("chips")).toBe(false);
  });

  it("resolves false when the ad fails to load or show", async () => {
    fake.s.loadFails = true;
    let ads = await loadAds();
    expect(await ads.showRewardedAd("chips")).toBe(false);
    expect(fake.AdMob.showRewardVideoAd).not.toHaveBeenCalled();

    fake.s.loadFails = false;
    fake.s.reward = () => Promise.reject(new Error("not ready"));
    ads = await loadAds();
    expect(await ads.showRewardedAd("chips")).toBe(false);
  });

  it("works in the first session (the player asked for it) and runs consent first", async () => {
    fake.s.reward = () => {
      fake.later(() => {
        fake.fire(fake.EV.rRewarded);
        fake.fire(fake.EV.rDismissed);
      });
      return new Promise(() => {});
    };
    const ads = await loadAds();
    expect(await ads.showRewardedAd("chips")).toBe(true);
    expect(fake.AdMob.requestConsentInfo).toHaveBeenCalled();
    expect(fake.AdMob.initialize).toHaveBeenCalledOnce();
  });

  it("holds off interstitials right after a rewarded ad", async () => {
    returningPlayer(true);
    fake.s.reward = () => {
      fake.later(() => {
        fake.fire(fake.EV.rRewarded);
        fake.fire(fake.EV.rDismissed);
      });
      return new Promise(() => {});
    };
    const ads = await loadAds();
    vi.setSystemTime(T0 + 30 * MIN);
    await ads.maybeShowInterstitial("match-end"); // preload
    await flush();
    expect(await ads.showRewardedAd("chips")).toBe(true);
    vi.setSystemTime(T0 + 31 * MIN);
    await ads.maybeShowInterstitial("match-end");
    expect(fake.AdMob.showInterstitial).not.toHaveBeenCalled();
  });
});
