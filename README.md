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
| `src/lib/poker/ranges.ts`, `preflop.ts`, `villain.ts` | Opening charts; 6-max 100bb response charts (facing an open, facing a 3-bet, with their assumptions at the top); the ranges the coach credits each opponent with. |
| `src/lib/blackjack/` | Rules engine, basic strategy, coach, drills, and `session.ts` (play against the dealer locally). |
| `src/lib/daily.ts` | Three puzzles per day, generated from the date so everyone gets the same set. |
| `src/lib/settings.ts`, `haptics.ts` | Graphics tiers (auto/high/low/flat) and haptics (Capacitor Haptics natively, `navigator.vibrate` on the web). |
| `src/game/three/`, `src/game/poker-three/` | The 3D tables (React Three Fiber). The low tier skips post-processing and uses cheaper shadows for phones. |
| `src/components/app-shell.tsx` | Sidebar on desktop; top bar and bottom tab bar on phones, respecting safe areas. Game screens hide the tab bar. |
| `src/components/native-bridge.tsx` | Status bar, splash screen and Android back button in the native app; service worker on the web. |

## Next steps

- Accounts and cloud sync, so progress follows you between phone and web (the store is one JSON document, so syncing is a single upload/download).
- More bots and a "bot of the week".
- Lessons: short guided explanations that end in a drill.
- Store listings: an Apple developer account, Google Play console, screenshots and privacy labels (no data is collected).
