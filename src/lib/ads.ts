"use client";

/**
 * Ads (Google AdMob through @capacitor-community/admob). Shared contract:
 *
 * - `adsEnabled()`: true only in the native app, for players without Pro, when an
 *   interstitial unit is configured.
 * - `rewardedAdsAvailable()`: true in the native app when a rewarded unit is configured and
 *   consent hasn't ruled ads out. Offered to everyone, Pro included.
 * - `showRewardedAd(placement)`: resolves true only when the SDK's reward event fired. Load
 *   failures, dismissals before the reward and timeouts resolve false.
 * - `maybeShowInterstitial(placement)`: call at natural breaks (end of a match, leaving a
 *   table). It decides itself whether to show anything: Pro, web, frequency caps
 *   (src/lib/ad-policy.ts) and whether an ad is already loaded. It never waits for an ad to
 *   load; it shows one only if it's ready, then preloads the next.
 *
 * No banners: every game screen is a full-screen 3D table.
 *
 * Privacy flow. Nothing is prompted during the first session. The first time ads are needed
 * after that (a natural break in a later session, or the player tapping a rewarded ad), we
 * run Google's UMP consent flow (shows the GDPR/US-state message where required), then on iOS
 * the App Tracking Transparency prompt, then initialize the SDK. Once that has happened, later
 * launches prepare ads quietly in the background.
 *
 * On the web everything here is a no-op.
 */
import { Capacitor } from "@capacitor/core";
import { useEffect, useRef, useState } from "react";
import {
  canShowInterstitial,
  noteInterstitial,
  noteRewarded,
  parseRecord,
  pastFirstSession,
  startSession,
  type AdRecord,
} from "./ad-policy";
import { isPro } from "./pro";

type AdMobModule = typeof import("@capacitor-community/admob");
type AdMobApi = AdMobModule["AdMob"];

/* ------------------------------------------------------------------ config */

/** Google's demo ad units; they always serve test ads. */
export const TEST_UNITS = {
  ios: { interstitial: "ca-app-pub-3940256099942544/4411468910", rewarded: "ca-app-pub-3940256099942544/1712485313" },
  android: { interstitial: "ca-app-pub-3940256099942544/1033173712", rewarded: "ca-app-pub-3940256099942544/5224354917" },
} as const;

export interface AdEnv {
  iosInterstitial?: string;
  iosRewarded?: string;
  androidInterstitial?: string;
  androidRewarded?: string;
  /** "1" forces test units and test requests, even in a production build */
  test?: string;
  /** comma-separated test device ids */
  testDevices?: string;
  /** "1" makes UMP treat test devices as if they were in the EEA */
  debugEea?: string;
}

// NEXT_PUBLIC_* values are inlined at build time, so each must be spelled out literally.
const ENV: AdEnv = {
  iosInterstitial: process.env.NEXT_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID,
  iosRewarded: process.env.NEXT_PUBLIC_ADMOB_IOS_REWARDED_ID,
  androidInterstitial: process.env.NEXT_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID,
  androidRewarded: process.env.NEXT_PUBLIC_ADMOB_ANDROID_REWARDED_ID,
  test: process.env.NEXT_PUBLIC_ADMOB_TEST,
  testDevices: process.env.NEXT_PUBLIC_ADMOB_TEST_DEVICES,
  debugEea: process.env.NEXT_PUBLIC_ADMOB_DEBUG_EEA,
};

export interface AdUnits {
  interstitial: string | null;
  rewarded: string | null;
  testing: boolean;
}

/**
 * Ad units for a platform. Development builds (or NEXT_PUBLIC_ADMOB_TEST=1) use Google's test
 * units. Production builds use the configured units, and a format without one is switched off
 * rather than falling back to test ads.
 */
export function resolveUnits(platform: string, env: AdEnv, production: boolean): AdUnits {
  if (platform !== "ios" && platform !== "android") return { interstitial: null, rewarded: null, testing: false };
  const testing = !production || env.test === "1";
  if (testing) return { ...TEST_UNITS[platform], testing };
  const pick = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
  return platform === "ios"
    ? { interstitial: pick(env.iosInterstitial), rewarded: pick(env.iosRewarded), testing }
    : { interstitial: pick(env.androidInterstitial), rewarded: pick(env.androidRewarded), testing };
}

const native = () => Capacitor.isNativePlatform();
let unitsCache: AdUnits | null = null;
const units = () => (unitsCache ??= resolveUnits(Capacitor.getPlatform(), ENV, process.env.NODE_ENV === "production"));
const testDevices = () =>
  (ENV.testDevices ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/* ------------------------------------------------------------------ device record */

const RECORD_KEY = "inferno:ads:v1";
/** set once the consent + tracking prompts have run, so later launches can prepare quietly */
const PREPARED_KEY = "inferno:ads:prepared";

let record: AdRecord | null = null;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

/** The ad record for this launch; the first call per launch counts a new session. */
function session(): AdRecord {
  if (!record) {
    record = startSession(parseRecord(readStorage(RECORD_KEY)), Date.now());
    writeStorage(RECORD_KEY, JSON.stringify(record));
  }
  return record;
}
function saveRecord(next: AdRecord) {
  record = next;
  writeStorage(RECORD_KEY, JSON.stringify(next));
}

/* ------------------------------------------------------------------ plugin + events */

let pluginPromise: Promise<AdMobModule> | null = null;
const plugin = () => (pluginPromise ??= import("@capacitor-community/admob"));

type AdEvent =
  | "interstitial:dismissed"
  | "interstitial:failedToShow"
  | "rewarded:rewarded"
  | "rewarded:dismissed"
  | "rewarded:failedToShow";

const handlers = new Set<{ events: AdEvent[]; fn: (e: AdEvent) => void }>();
function emit(e: AdEvent) {
  for (const h of [...handlers]) if (h.events.includes(e)) h.fn(e);
}
function on(events: AdEvent[], fn: (e: AdEvent) => void): () => void {
  const h = { events, fn };
  handlers.add(h);
  return () => void handlers.delete(h);
}
/** Resolve with the first of `events` to fire, or "timeout". */
function waitFor(events: AdEvent[], ms: number): Promise<AdEvent | "timeout"> {
  return new Promise((resolve) => {
    const done = (e: AdEvent | "timeout") => {
      clearTimeout(timer);
      off();
      resolve(e);
    };
    const off = on(events, done);
    const timer = setTimeout(() => done("timeout"), ms);
  });
}

let listenersAttached = false;
async function attachListeners(m: AdMobModule) {
  if (listenersAttached) return;
  listenersAttached = true;
  const { AdMob, InterstitialAdPluginEvents: I, RewardAdPluginEvents: R } = m;
  await Promise.all([
    AdMob.addListener(I.Dismissed, () => emit("interstitial:dismissed")),
    AdMob.addListener(I.FailedToShow, () => emit("interstitial:failedToShow")),
    AdMob.addListener(R.Rewarded, () => emit("rewarded:rewarded")),
    AdMob.addListener(R.Dismissed, () => emit("rewarded:dismissed")),
    AdMob.addListener(R.FailedToShow, () => emit("rewarded:failedToShow")),
  ]);
}

/* ------------------------------------------------------------------ consent + init */

/** null until the consent info has been read on this launch */
let canRequestAds: boolean | null = null;
let privacyOptionsRequired = false;
const consentListeners = new Set<() => void>();
const consentChanged = () => consentListeners.forEach((l) => l());
// PrivacyOptionsRequirementStatus is a string enum the package doesn't re-export at runtime
const optionsRequired = (status: unknown) => status === "REQUIRED";

let ready: Promise<boolean> | null = null;

/**
 * Consent, tracking authorization and SDK init, once per launch. Resolves true when ads may be
 * requested. A failure (offline, SDK error) resolves false and is retried on the next call.
 */
function prepare(): Promise<boolean> {
  if (!native()) return Promise.resolve(false);
  ready ??= (async () => {
    try {
      const m = await plugin();
      const { AdMob, AdmobConsentStatus, AdmobConsentDebugGeography } = m;
      const devices = testDevices();
      const debug = units().testing && ENV.debugEea === "1" ? { debugGeography: AdmobConsentDebugGeography.EEA, testDeviceIdentifiers: devices } : undefined;
      let info = await AdMob.requestConsentInfo(debug);
      if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) info = await AdMob.showConsentForm();
      canRequestAds = info.canRequestAds;
      privacyOptionsRequired = optionsRequired(info.privacyOptionsRequirementStatus);
      consentChanged();
      writeStorage(PREPARED_KEY, "1");
      if (!info.canRequestAds) return false;

      await requestTracking(AdMob);
      await AdMob.initialize(units().testing && devices.length ? { testingDevices: devices, initializeForTesting: true } : {});
      await attachListeners(m);
      return true;
    } catch (e) {
      console.warn("[ads] not ready", e);
      ready = null;
      return false;
    }
  })();
  return ready;
}

/** iOS App Tracking Transparency, asked once, right before ads are first requested. */
async function requestTracking(AdMob: AdMobApi) {
  if (Capacitor.getPlatform() !== "ios") return;
  try {
    const { status } = await AdMob.trackingAuthorizationStatus();
    if (status === "notDetermined") await AdMob.requestTrackingAuthorization();
  } catch {}
}

/* ------------------------------------------------------------------ loading */

const LOAD_TIMEOUT_MS = 15_000;
/** loaded ads expire after an hour; reload a little before that */
const AD_TTL_MS = 55 * 60_000;
/** longest a full-screen ad may stay up before we stop waiting for it */
const SHOW_TIMEOUT_MS = 5 * 60_000;
/** the reward event can arrive just after the dismiss event */
const REWARD_GRACE_MS = 800;

interface Slot {
  loadedAt: number | null;
  loading: Promise<boolean> | null;
}
const slots: Record<"interstitial" | "rewarded", Slot> = {
  interstitial: { loadedAt: null, loading: null },
  rewarded: { loadedAt: null, loading: null },
};
const isLoaded = (s: Slot) => s.loadedAt !== null && Date.now() - s.loadedAt < AD_TTL_MS;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Load an ad into a slot (no-op if one is loaded or loading). Resolves whether one is ready. */
function load(kind: "interstitial" | "rewarded"): Promise<boolean> {
  const slot = slots[kind];
  const adId = units()[kind];
  if (!adId) return Promise.resolve(false);
  if (isLoaded(slot)) return Promise.resolve(true);
  slot.loading ??= (async () => {
    try {
      if (!(await prepare())) return false;
      const { AdMob } = await plugin();
      const opts = { adId, isTesting: units().testing, immersiveMode: true };
      const req = kind === "interstitial" ? AdMob.prepareInterstitial(opts) : AdMob.prepareRewardVideoAd(opts);
      // a load that outlives the timeout still counts once it lands
      void req.then(
        () => (slot.loadedAt = Date.now()),
        () => {},
      );
      await withTimeout(req, LOAD_TIMEOUT_MS);
      return true;
    } catch (e) {
      console.warn(`[ads] ${kind} failed to load`, e);
      return false;
    } finally {
      slot.loading = null;
    }
  })();
  return slot.loading;
}

/* ------------------------------------------------------------------ public api */

let showing = false;

export function adsEnabled(): boolean {
  return native() && !isPro() && !!units().interstitial;
}

export function rewardedAdsAvailable(): boolean {
  return native() && !!units().rewarded && canRequestAds !== false;
}

export async function showRewardedAd(placement: string): Promise<boolean> {
  if (!rewardedAdsAvailable() || showing) return false;
  session();
  showing = true;
  try {
    if (!(await load("rewarded"))) return false;
    const { AdMob } = await plugin();
    slots.rewarded.loadedAt = null; // an ad can be shown once

    // Only the reward event grants the reward. The show promise resolves on reward (and on iOS
    // never settles without one), so it only matters when it rejects: the ad couldn't show.
    let earned = false;
    const off = on(["rewarded:rewarded"], () => (earned = true));
    let end: AdEvent | "timeout";
    try {
      const ended = waitFor(["rewarded:dismissed", "rewarded:failedToShow"], SHOW_TIMEOUT_MS);
      const failed = AdMob.showRewardVideoAd().then(
        () => null,
        () => "rewarded:failedToShow" as const,
      );
      end = await Promise.race([ended, failed.then((f) => f ?? ended)]);
      if (!earned && end === "rewarded:dismissed") await waitFor(["rewarded:rewarded"], REWARD_GRACE_MS);
    } finally {
      off();
    }
    if (earned) saveRecord(noteRewarded(session(), Date.now()));
    else console.info(`[ads] rewarded "${placement}" ended without a reward (${end})`);
    return earned;
  } catch (e) {
    console.warn(`[ads] rewarded "${placement}" failed`, e);
    return false;
  } finally {
    showing = false;
    void load("rewarded");
  }
}

export async function maybeShowInterstitial(placement: string): Promise<void> {
  if (!adsEnabled() || showing) return;
  const rec = session();
  if (!pastFirstSession(rec)) return;

  // First break after the first session: run the consent / tracking prompts here instead of an
  // ad, and load one for next time.
  if (readStorage(PREPARED_KEY) !== "1") {
    if (await prepare()) void load("interstitial");
    return;
  }
  if (!canShowInterstitial(rec, Date.now(), isPro())) {
    void load("interstitial");
    return;
  }
  if (!isLoaded(slots.interstitial)) {
    void load("interstitial"); // never make the player wait for an ad to load
    return;
  }

  showing = true;
  try {
    const { AdMob } = await plugin();
    slots.interstitial.loadedAt = null;
    const ended = waitFor(["interstitial:dismissed", "interstitial:failedToShow"], SHOW_TIMEOUT_MS);
    await AdMob.showInterstitial();
    saveRecord(noteInterstitial(session(), Date.now()));
    await ended;
  } catch (e) {
    console.warn(`[ads] interstitial "${placement}" failed`, e);
  } finally {
    showing = false;
    void load("interstitial");
  }
}

/**
 * Called once at launch by the native bridge. Counts the session, and if the player has been
 * through the consent prompts before, prepares ads and preloads an interstitial in the
 * background. The first session prompts for nothing.
 */
export function initAds() {
  if (!native()) return;
  const rec = session();
  if (readStorage(PREPARED_KEY) !== "1") return;
  setTimeout(() => {
    void prepare().then((ok) => {
      if (!ok) return;
      if (pastFirstSession(rec) && !isPro()) void load("interstitial");
    });
  }, 4000);
}

/* ------------------------------------------------------------------ privacy choices */

/** Read the consent status without showing anything, so settings know whether to offer the form. */
async function refreshConsentInfo() {
  if (!native()) return;
  try {
    const { AdMob } = await plugin();
    const info = await AdMob.requestConsentInfo();
    canRequestAds = info.canRequestAds;
    privacyOptionsRequired = optionsRequired(info.privacyOptionsRequirementStatus);
    consentChanged();
  } catch {}
}

/** Whether the "Privacy choices" entry should show (native, in a region where UMP requires it). */
export function usePrivacyChoicesAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!native()) return;
    const l = () => setAvailable(privacyOptionsRequired);
    consentListeners.add(l);
    void refreshConsentInfo();
    return () => void consentListeners.delete(l);
  }, []);
  return available;
}

/** Open Google's privacy options form so the player can change their ad consent. */
export async function showPrivacyChoices(): Promise<void> {
  if (!native()) return;
  const { AdMob } = await plugin();
  await AdMob.showPrivacyOptionsForm();
  await refreshConsentInfo();
}

/* ------------------------------------------------------------------ table hook */

/**
 * Offer an interstitial when the player leaves a table (unmount, or Next hiding the page),
 * but only if they finished at least `minRounds` rounds on this visit, so popping in and out
 * never triggers one. `roundKey` should change once per finished round (null in between).
 */
export function useAdBreakOnLeave(placement: string, roundKey: string | null, minRounds = 5) {
  const rounds = useRef(0);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (roundKey !== null && roundKey !== last.current) rounds.current += 1;
    last.current = roundKey;
  }, [roundKey]);
  useEffect(() => {
    const counter = rounds;
    const start = counter.current;
    return () => {
      if (counter.current - start >= minRounds) void maybeShowInterstitial(placement);
    };
  }, [placement, minRounds]);
}
