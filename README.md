# Inferno

Poker and blackjack training, on the web and as an iOS/Android app. Play heads-up poker against eight bots with their own styles and ratings, play blackjack with a coach grading every decision, and drill the spots you miss. Everything runs on the device: there is no server, no account and no real money. The iOS and Android apps show Google AdMob ads to free players (see [Ads](#ads)).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

```bash
npm test           # engines, bots, ratings, streaks, daily puzzles
npm run typecheck
npm run lint
npm run build      # static export to out/
```

## One codebase, three targets

| Target | How |
|---|---|
| Website | `npm run build`, then deploy `out/` to any static host (Vercel works with zero config). |
| Installable web app (PWA) | Comes with the website: `src/app/manifest.ts`, icons in `public/icons/`, offline caching in `public/sw.js` (registered in production only). |
| iOS and Android apps | [Capacitor](https://capacitorjs.com) wraps `out/` in a native shell. `npm run ios` / `npm run android` build, sync and open Xcode / Android Studio. |

Native setup, once per machine: install Xcode (full app, not just the command line tools) for iOS and Android Studio for Android. After changing the web code, `npm run cap:sync` rebuilds and copies it into both projects. Icons and splash screens are generated from `assets/` with `npm run assets`.

## Product structure

| Tab | Route | What it is |
|---|---|---|
| Home | `/` | Ratings, streak, today's puzzles, next bot on the ladder, your biggest leak. |
| Play | `/play/` | Poker vs bots (`/play/poker/` lobby, `/play/poker/match/?bot=id`), 6-max cash game (`/play/poker/table/`), blackjack (`/play/blackjack/`). |
| Train | `/train/` | Daily puzzles (`/train/daily/`), blackjack strategy drills, poker drills. `?spot=` / `?drill=` deep-link from leak reports. |
| Review | `/review/` | Step-through replayer for poker hands with the coach's note at each decision, blackjack hand history, match history. |
| Profile | `/profile/` | Ratings, trophy case, accuracy, leaks, settings (graphics quality, sound, haptics, name, privacy choices, reset), links to the legal pages. |
| Legal | `/legal/privacy/`, `/legal/terms/` | Privacy policy and terms of use. **Drafts:** see the note at the top of each source file before launch. |

## How it fits together

| Path | What it is |
|---|---|
| `src/lib/store.ts` | All progress, kept in one versioned localStorage document and read with `useProgress()`: chips, hand histories, drill answers, ratings, beaten bots, daily answers, active days. |
| `src/lib/rating.ts` | Elo ratings. A match is a game against the bot's rating; a training answer is a game against the spot's difficulty. |
| `src/lib/poker/roster.ts` | The eight bots (style, skill, rating, bio, chat lines), ladder unlocks, match format (100bb, blinds up every 8 hands, 40 hands max). |
| `src/lib/poker/bots.ts` | Bot decisions. Style shapes ranges and aggression; `skill` < 1 adds style-appropriate blunders. |
| `src/lib/poker/game.ts`, `table-coach.ts` | No-Limit Hold'em engine (2–6 seats) and the live coach. |
| `src/lib/blackjack/` | Rules engine, basic strategy, coach, drills, and `session.ts` (play against the dealer locally). |
| `src/lib/economy.ts`, `challenges.ts`, `earn.ts` | Chips: one balance for blackjack and the cash game, every amount and cap (with the tuning rationale), check-ins, challenges, rewarded ads, Pro grants, the comeback grant, cash-game buy-ins, and `grantChips()` with its ledger. Chips screen at `/chips/`. |
| `src/lib/daily.ts` | Three puzzles per day, generated from the date so everyone gets the same set. |
| `src/lib/settings.ts`, `haptics.ts` | Graphics tiers (auto/high/low/flat) and haptics (Capacitor Haptics natively, `navigator.vibrate` on the web). |
| `src/game/three/`, `src/game/poker-three/` | The 3D tables (React Three Fiber). The low tier skips post-processing and uses cheaper shadows for phones. |
| `src/components/app-shell.tsx` | Sidebar on desktop; top bar and bottom tab bar on phones, respecting safe areas. Game screens hide the tab bar. |
| `src/components/native-bridge.tsx` | Status bar, splash screen, Android back button and ads start-up in the native app; service worker on the web. |
| `src/lib/ads.ts`, `ad-policy.ts` | AdMob: consent (UMP), App Tracking Transparency, interstitials at natural breaks, rewarded ads. `ad-policy.ts` holds the frequency caps. |
| `scripts/admob-app-ids.mjs` | Writes the AdMob app ids into `Info.plist` and `strings.xml` during `npm run cap:sync`. |
| `src/lib/pro.ts` | Inferno Pro entitlement, cached on the device: `useIsPro()`, `isPro()`, `openPaywall(reason)`. |
| `src/lib/purchases.ts` | RevenueCat (native only): offerings, purchase, restore, entitlement refresh. The only caller of `setPro()`. |
| `src/lib/gates.ts` | Every free vs Pro rule in one place (lessons, counting, bots, review history). |
| `src/components/pro/` | The paywall (mounted once in `layout.tsx`, opened by `openPaywall()`), the Pro badge and the in-page lock card. |

## Ads

Native apps only; the website never shows ads. No banners: every game screen is a full-screen 3D table.

- **Interstitials** (free players only, never Pro) at natural breaks: closing the result of a heads-up bot match, and leaving the blackjack table or the 6-max cash table after at least 5 finished hands. Caps in `src/lib/ad-policy.ts`: none in the first session or the first 10 minutes after install, none in the first 3 minutes of a session, at least 5 minutes apart, at most 4 per session, none within 3 minutes of a rewarded ad. An interstitial is only shown if one is already loaded; the player never waits for one.
- **Rewarded ads** for everyone, Pro included: `showRewardedAd(placement)` resolves `true` only when AdMob's reward event fires.
- **Consent order:** nothing is prompted during the first session. At the first break of a later session (or when the player first taps a rewarded ad) the app runs Google's UMP consent message (EEA/UK/Switzerland and US states, as configured in AdMob), then the iOS App Tracking Transparency prompt, then starts the SDK. Players change their consent in **Profile → Privacy choices** (shown where UMP requires it).

### Environment variables

Put these in `.env.production.local` (or the build environment) before `npm run cap:sync`. All are public values compiled into the app.

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_ADMOB_IOS_APP_ID` | AdMob app id for iOS (`ca-app-pub-…~…`), written to `GADApplicationIdentifier` in `ios/App/App/Info.plist`. |
| `NEXT_PUBLIC_ADMOB_ANDROID_APP_ID` | AdMob app id for Android, written to `admob_app_id` in `android/app/src/main/res/values/strings.xml`. |
| `NEXT_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID` | iOS interstitial ad unit (`ca-app-pub-…/…`). |
| `NEXT_PUBLIC_ADMOB_IOS_REWARDED_ID` | iOS rewarded ad unit. |
| `NEXT_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID` | Android interstitial ad unit. |
| `NEXT_PUBLIC_ADMOB_ANDROID_REWARDED_ID` | Android rewarded ad unit. |
| `NEXT_PUBLIC_ADMOB_TEST` | `1` forces Google's test ad units and test requests in a production build (for device testing). |
| `NEXT_PUBLIC_ADMOB_TEST_DEVICES` | Comma-separated test device ids (from the native logs), registered with the SDK in test mode. |
| `NEXT_PUBLIC_ADMOB_DEBUG_EEA` | `1` (test mode only) makes the UMP consent message behave as if the test devices were in the EEA. |

Development builds (`next dev`) always use Google's test units. In a production build, a format whose unit id is missing is switched off (no fallback to test ads); a missing app id falls back to Google's test app id so the SDK still starts. The app ids are not secret; `cap:sync` rewrites them in the tracked native files, so don't commit real ids by accident if the repo is public.

## Privacy and store disclosures

The app has no account and no server, and progress stays in localStorage on the device. It is **not** a "no data collected" app any more: the Google Mobile Ads SDK and in-app purchases collect data. The policy is at `/legal/privacy/` (deploy the website so the stores can link to it).

**App Store privacy labels** (App Store Connect → App Privacy). Declare at least:
- *Identifiers → Device ID* (IDFA, via AdMob): Third-Party Advertising; used for tracking. Since it's used for tracking, the app must show the ATT prompt (it does).
- *Usage Data → Advertising Data* (ad views, taps, rewarded completions): Third-Party Advertising, Analytics; used for tracking.
- *Location → Coarse Location* (inferred from IP by AdMob): Third-Party Advertising.
- *Diagnostics → Other/Performance Data* (AdMob SDK diagnostics): Third-Party Advertising / App Functionality.
- *Purchases → Purchase History* (subscriptions, via Apple and RevenueCat): App Functionality; not linked to identity unless accounts are added; not used for tracking.
- *Identifiers → User ID* if RevenueCat's anonymous app user id is considered linked to the user: App Functionality.
- Check Google's current guidance: [AdMob data disclosure for Apple's privacy labels](https://developers.google.com/admob/ios/privacy/data-disclosure).

**Google Play data safety form.** Declare:
- *Device or other IDs* (Advertising ID): collected and shared with Google for Advertising/marketing, Analytics and Fraud prevention.
- *App activity → App interactions* (ad interactions): collected and shared, Advertising and Analytics.
- *Location → Approximate location* (from IP): collected by the ads SDK, Advertising.
- *App info and performance → Diagnostics / Crash logs* as reported by the ads SDK: Analytics.
- *Financial info → Purchase history*: collected (Google Play Billing / RevenueCat) for App functionality.
- Data is encrypted in transit; users can't request deletion from us because we hold none (say so, and point to Google/RevenueCat).
- Also answer the *Advertising ID* declaration (the ads SDK adds the `AD_ID` permission) and *Contains ads: Yes*. See [Google's Play data disclosure for the Mobile Ads SDK](https://developers.google.com/admob/android/privacy/play-data-disclosure).

Neither the app nor our code adds analytics or crash reporting of its own. If that changes, update the policy, the labels and the form together.

## Inferno Pro

The membership is sold through Apple and Google in-app purchases, with [RevenueCat](https://www.revenuecat.com) validating receipts and holding the entitlement (there is no Inferno server). Pro is cached on the device, so it keeps working offline; on launch and on resume the app asks RevenueCat for the current state. If RevenueCat can't be reached, the cached state stays.

**What Pro unlocks** (`src/lib/gates.ts`): lessons after the first 3 of each track, the card counting drills, the Advanced and Master bots, and replays of poker hands and blackjack rounds older than the newest 10. No ads, and chip grants (handled elsewhere). Blackjack, the poker cash game, daily puzzles, basic drills, charts and the review queue stay free.

**Build environment.** Set these before `npm run build` / `npm run cap:sync` (they are inlined at build time):

```bash
NEXT_PUBLIC_REVENUECAT_IOS_KEY=appl_...      # RevenueCat › Project › API keys › App Store app
NEXT_PUBLIC_REVENUECAT_ANDROID_KEY=goog_...  # RevenueCat › Project › API keys › Play Store app
```

Without a key the app runs normally and the paywall says purchases aren't available in this build. On the web there is no store: the paywall says Pro is sold in the iOS/Android app.

**Store products** (prices are read from the store at runtime, never from the code):

| Plan | Suggested product id | Price | Trial |
|---|---|---|---|
| Monthly | `inferno_pro_monthly` | $12.99 / month | none |
| Yearly | `inferno_pro_yearly` | $79.99 / year | 7-day free trial |

- **App Store Connect:** create one subscription group ("Inferno Pro") with both auto-renewable subscriptions. Add a 7-day free introductory offer to the yearly one. Fill in the subscription review screenshot and description, and the Paid Apps agreement. In Xcode, add the *In-App Purchase* capability to the App target.
- **Google Play Console:** create a subscription per plan, each with a base plan (monthly / yearly auto-renewing). Add a 7-day free-trial offer to the yearly base plan. The `BILLING` permission is already in `AndroidManifest.xml`.
- **RevenueCat:** create the project with an App Store app and a Play Store app (upload the App Store In-App Purchase key and the Play service-account JSON). Create an entitlement with identifier **`pro`** and attach both products to it. Create an offering, mark it **current**, and give it two packages: **Monthly** (`$rc_monthly`) and **Annual** (`$rc_annual`).
- After adding the plugin, run `npm run cap:sync` once so the native projects pick up `@revenuecat/purchases-capacitor`.

**Testing.** In development builds the Profile › Settings screen has a *Pro override* switch that turns Pro on without a store; production builds compile it out. For real purchases use App Store sandbox testers / TestFlight and Play license testers.

## Next steps

- Accounts and cloud sync, so progress follows you between phone and web (the store is one JSON document, so syncing is a single upload/download).
- More bots and a "bot of the week".
- Lessons: short guided explanations that end in a drill.
- Store listings: an Apple developer account, Google Play console, screenshots, privacy labels and the data safety form (see [Privacy and store disclosures](#privacy-and-store-disclosures)).
