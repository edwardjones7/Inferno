# Inferno

Poker and blackjack training, on the web and as an iOS/Android app. Play heads-up poker against eight bots with their own styles and ratings, play blackjack with a coach grading every decision, and drill the spots you miss. Everything runs on the device: there is no server, no account and no real money.

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
| Profile | `/profile/` | Ratings, trophy case, accuracy, leaks, settings (graphics quality, sound, haptics, name, reset). |

## How it fits together

| Path | What it is |
|---|---|
| `src/lib/store.ts` | All progress, kept in one versioned localStorage document and read with `useProgress()`: chips, hand histories, drill answers, ratings, beaten bots, daily answers, active days. |
| `src/lib/rating.ts` | Elo ratings. A match is a game against the bot's rating; a training answer is a game against the spot's difficulty. |
| `src/lib/poker/roster.ts` | The eight bots (style, skill, rating, bio, chat lines), ladder unlocks, match format (100bb, blinds up every 8 hands, 40 hands max). |
| `src/lib/poker/bots.ts` | Bot decisions. Style shapes ranges and aggression; `skill` < 1 adds style-appropriate blunders. |
| `src/lib/poker/game.ts`, `table-coach.ts` | No-Limit Hold'em engine (2–6 seats) and the live coach. |
| `src/lib/blackjack/` | Rules engine, basic strategy, coach, drills, and `session.ts` (play against the dealer locally). |
| `src/lib/daily.ts` | Three puzzles per day, generated from the date so everyone gets the same set. |
| `src/lib/settings.ts`, `haptics.ts` | Graphics tiers (auto/high/low/flat) and haptics (Capacitor Haptics natively, `navigator.vibrate` on the web). |
| `src/game/three/`, `src/game/poker-three/` | The 3D tables (React Three Fiber). The low tier skips post-processing and uses cheaper shadows for phones. |
| `src/components/app-shell.tsx` | Sidebar on desktop; top bar and bottom tab bar on phones, respecting safe areas. Game screens hide the tab bar. |
| `src/components/native-bridge.tsx` | Status bar, splash screen and Android back button in the native app; service worker on the web. |
| `src/lib/pro.ts` | Inferno Pro entitlement, cached on the device: `useIsPro()`, `isPro()`, `openPaywall(reason)`. |
| `src/lib/purchases.ts` | RevenueCat (native only): offerings, purchase, restore, entitlement refresh. The only caller of `setPro()`. |
| `src/lib/gates.ts` | Every free vs Pro rule in one place (lessons, counting, bots, review history). |
| `src/components/pro/` | The paywall (mounted once in `layout.tsx`, opened by `openPaywall()`), the Pro badge and the in-page lock card. |

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
- Store listings: an Apple developer account, Google Play console, screenshots and privacy labels (no data is collected).
