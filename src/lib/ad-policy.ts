/**
 * When an interstitial may be shown. Pure functions over a small record kept on the device,
 * so the rules can be tested without the ad plugin.
 *
 * Interstitials are the only ad a free player sees without asking, so they are rare:
 * - never during the first session after install, nor in the first minutes after install;
 * - never in the first minutes of any session (opening the app shouldn't greet you with an ad);
 * - at most one every few minutes, and only a handful per session;
 * - never right after a rewarded ad (the player just watched one).
 */

export const AD_POLICY = {
  /** no interstitials until this long after the app was first opened */
  installGraceMs: 10 * 60_000,
  /** ...and not during the first session at all */
  freeSessions: 1,
  /** no interstitials until this long into a session */
  sessionGraceMs: 3 * 60_000,
  /** minimum gap between two interstitials */
  minGapMs: 5 * 60_000,
  /** minimum gap after a rewarded ad finished */
  afterRewardedMs: 3 * 60_000,
  /** most interstitials in one session */
  maxPerSession: 4,
} as const;

export interface AdRecord {
  /** first time the app was opened (ms) */
  firstSeenAt: number;
  /** app launches so far, including the current one */
  sessions: number;
  /** when the current launch started (ms) */
  sessionStart: number;
  /** interstitials shown this launch */
  sessionShown: number;
  lastInterstitialAt: number | null;
  lastRewardedAt: number | null;
}

export function freshRecord(now: number): AdRecord {
  return { firstSeenAt: now, sessions: 1, sessionStart: now, sessionShown: 0, lastInterstitialAt: null, lastRewardedAt: null };
}

/** Called once per app launch. */
export function startSession(prev: AdRecord | null, now: number): AdRecord {
  if (!prev) return freshRecord(now);
  return { ...prev, sessions: prev.sessions + 1, sessionStart: now, sessionShown: 0 };
}

export type InterstitialBlock =
  | "pro"
  | "first-session"
  | "install-grace"
  | "session-grace"
  | "too-soon"
  | "after-rewarded"
  | "session-cap";

/** Why an interstitial can't be shown now, or null if it can. */
export function interstitialBlock(r: AdRecord, now: number, pro: boolean): InterstitialBlock | null {
  if (pro) return "pro";
  if (r.sessions <= AD_POLICY.freeSessions) return "first-session";
  if (now - r.firstSeenAt < AD_POLICY.installGraceMs) return "install-grace";
  if (now - r.sessionStart < AD_POLICY.sessionGraceMs) return "session-grace";
  if (r.sessionShown >= AD_POLICY.maxPerSession) return "session-cap";
  if (r.lastInterstitialAt !== null && now - r.lastInterstitialAt < AD_POLICY.minGapMs) return "too-soon";
  if (r.lastRewardedAt !== null && now - r.lastRewardedAt < AD_POLICY.afterRewardedMs) return "after-rewarded";
  return null;
}

export function canShowInterstitial(r: AdRecord, now: number, pro: boolean): boolean {
  return interstitialBlock(r, now, pro) === null;
}

/** Whether the app is far enough along that ads may be prepared at launch (consent + ATT prompts). */
export function pastFirstSession(r: AdRecord): boolean {
  return r.sessions > AD_POLICY.freeSessions;
}

export function noteInterstitial(r: AdRecord, now: number): AdRecord {
  return { ...r, lastInterstitialAt: now, sessionShown: r.sessionShown + 1 };
}

export function noteRewarded(r: AdRecord, now: number): AdRecord {
  return { ...r, lastRewardedAt: now };
}

/** Parse a stored record, tolerating junk. */
export function parseRecord(raw: string | null): AdRecord | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<AdRecord>;
    if (typeof v.firstSeenAt !== "number" || typeof v.sessions !== "number") return null;
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
    return {
      firstSeenAt: v.firstSeenAt,
      sessions: v.sessions,
      sessionStart: num(v.sessionStart) ?? v.firstSeenAt,
      sessionShown: num(v.sessionShown) ?? 0,
      lastInterstitialAt: num(v.lastInterstitialAt),
      lastRewardedAt: num(v.lastRewardedAt),
    };
  } catch {
    return null;
  }
}
