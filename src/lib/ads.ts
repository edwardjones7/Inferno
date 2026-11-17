"use client";

/**
 * Ads: shared contract. Placeholder until the ads integration lands; screens can call these
 * now and they no-op safely.
 *
 * - `adsEnabled()`: true only in the native app for players without Pro.
 * - `showRewardedAd()`: resolves true only if the player watched to the end and earned the
 *   reward. Rewarded ads are offered to everyone, Pro included.
 * - `maybeShowInterstitial()`: call at natural breaks (end of a match, leaving a table).
 *   It decides itself whether to show anything (Pro, frequency caps, web).
 */
export function adsEnabled(): boolean {
  return false;
}

export function rewardedAdsAvailable(): boolean {
  return false;
}

export async function showRewardedAd(_placement: string): Promise<boolean> {
  return false;
}

export async function maybeShowInterstitial(_placement: string): Promise<void> {}
