# Inferno: Poker & Blackjack

Read this before making product decisions. It covers what the app is for and who it serves. `README.md` covers how the code fits together.

## What Inferno is

A training app that teaches people to **win at real poker and blackjack**, built to be fun enough that they keep coming back. Poker and blackjack in one app, with high-quality 3D tables, a coach on every decision, and free offline play.

The project began as a crypto-casino prototype, and older local checkouts may still sit in a folder named `crypto-casino`. That direction is dead: no crypto, no wallets, no real-money play.

## Who it's for

- **Primary: people who play real-money poker** and want to improve. They will notice bad strategy immediately, so the content has to hold up for them.
- **Also: beginners.** The first session should feel easy and friendly (Duolingo-style pacing: short lessons, streaks, instant feedback). The depth is there when they're ready, and it shouldn't scare them off before then.

When the two pull against each other, keep the advice correct and make the presentation simpler. Don't water down the strategy.

## Product principles

1. **The strategy must be correct.** Coaching, drills, charts and bots must give advice a strong player would agree with. A wrong tip costs more trust than a missing feature. Back changes to strategy logic with tests in `src/lib/**`, and state the assumptions (rules, stack depth, positions).
2. **Teach, don't just entertain.** Every feature should help the player make better decisions at a real table. Fun is how we keep them; it isn't the goal on its own.
3. **Graphics and polish are part of the product.** The look is a reason people pick Inferno. Don't ship generic or templated UI. Keep the low-end graphics tier working on phones.
4. **Both games, equally.** Poker and blackjack both get first-class treatment. Don't build a feature for one and leave the other behind without a reason.
5. **Free offline play stays free.** Users can always play and practise without paying or being online.

## How it makes money

Planned. None of this is built yet; the app currently has no accounts, server or payments.

**Membership (working name "Inferno Pro"; final name not chosen).**
- Price: $12.99/month or $79.99/year (about $6.67/month), with a 7-day free trial on the yearly plan. At launch, use the stores' introductory offers for discounts instead of a lower list price. Market check (Nov 2026): single-game poker trainers charge $10–30/month and $80–150/year, blackjack trainers $8–13/month, Duolingo Super $12.99/month and $84/year.
- Includes: no ads, unlimited lessons and drills, the coach on every hand, full hand reviews, advanced bots, exclusive table and card designs, a large chip bonus on signup and a monthly chip grant.
- On iOS and Android, digital subscriptions must be sold through Apple and Google in-app purchases.

**Free tier with ads.**
- Free users see ads. Members don't.
- A "watch an ad for chips" button is available to everyone, members included.

**Chips (play money).**
- Chips are play money only. They can never be cashed out, transferred between users or exchanged for anything of value. This line keeps the app legal and on the App Store. Never cross it.
- Free ways to earn chips: daily check-ins, challenges, rewarded ads and member grants.
- Lessons, drills and puzzles never cost chips. Running out of chips must never block learning.
- **Selling chips for real money is undecided.** It brings legal risk (several US court cases have treated purchasable casino chips as gambling) and clashes with the education angle. Don't build it unless the owner explicitly asks.

## Long-term ideas (don't build now)

- More table, felt and card designs, sold as cosmetics or included with the membership.
- Licensing designs or training content to other studios, dealer schools or casinos (for example, staff onboarding). Equipment used on real casino floors is a regulated supplier business, so treat this as a separate venture.

## Guardrails

- No real-money gambling, cash prizes, crypto, or anything that turns chips into value.
- The app will be rated for simulated gambling (17+ on the App Store). Don't add content that pushes it toward real gambling, such as links to casinos, sportsbooks or affiliate offers.
- Keep the app usable offline, with no account required for free play.

## Working in this repo

- Before finishing a change, run `npm test`, `npm run typecheck` and `npm run lint`.
- All saved progress goes through `update()` in `src/lib/store.ts`. Graded answers go through `recordDrills`, which feeds ratings, leaks and the review queue.
- The build is a static export (`out/`) wrapped by Capacitor for iOS and Android. Don't add anything that needs a server at runtime unless the task is to add one, such as accounts or payments.

### Ship every iteration

When a piece of work is finished and the checks above pass, commit and push it. Don't ask first, and don't leave finished work uncommitted.

1. Run `npm run build` as well, so the static export that Vercel builds also passes locally.
2. Stage everything (`git add -A`) and write a commit message that describes the change. Never commit secrets (`.env*`, keystores, `google-services.json` with live keys and similar files).
3. Push the current branch (`git push`, or `git push -u origin <branch>` for a new branch). Never force-push.
4. Confirm the Vercel deploy. The GitHub repo is public and Vercel's Git integration posts a commit status, so this works without the Vercel CLI or a GitHub login:

   ```sh
   curl -s https://api.github.com/repos/edwardjones7/Inferno/commits/$(git rev-parse HEAD)/status
   ```

   Look at the `Vercel` entry. Re-check every minute or so while it's `pending`. It's done when it reads `success` ("Deployment has completed").
5. If it reads `failure` or `error`, open its `target_url` for the build log (or reproduce with `npm run build`), fix the cause, then commit, push and check again. Work isn't finished until the deploy is green.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
