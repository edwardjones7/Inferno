# Inferno

Provably fair crypto blackjack with paper funds. Guests get $2,500 each in paper BTC, ETH, SOL and USDT. There are no wallets and no deposits yet.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

No setup is needed. Locally, data lives in an embedded Postgres (PGlite) under `./.data`. To use real Postgres (e.g. Neon), set `DATABASE_URL` and the same schema is created automatically.

```bash
npm test           # engine rules, fairness, 300k-hand house-edge sim, ledger integration tests
npm run typecheck
npm run lint
npm run build
```

## How it fits together

| Path | What it is |
|---|---|
| `src/lib/blackjack/engine.ts` | Pure rules engine (state + action + shoe → new state). 6 decks, dealer stands on soft 17, 3:2, DAS, split to 4, late surrender, insurance. |
| `src/lib/blackjack/fair.ts` | HMAC-SHA256 seed → Fisher–Yates shoe. The server and the browser verifier run the same code. |
| `src/lib/blackjack/strategy.ts` | Basic strategy, used for the in-game hints and the simulation. |
| `src/server/casino.ts` | Game service. Every money move happens in a transaction with the user row locked, and is written to an append-only `ledger`. |
| `src/server/db/` | Drizzle schema + PGlite/Postgres connection. |
| `src/app/blackjack/three/` | The 3D table (React Three Fiber). `table-3d.tsx` composes it; `fx-context.ts` carries game-feel signals (streak heat, dramatic reveal, win/lose/blackjack events) to every part: `cards.tsx`/`card-rig.ts` (paper cards, foil, burn-to-ash), `table-body.tsx` (lava rail, felt cracks, brass), `environment.tsx` + `env-*`/`flame-jet.tsx` (lamp, light beam, embers, blackjack flame jet), `chips.tsx`/`chip-sim.ts` (Rapier physics chips), `camera.tsx` + `effects.tsx`/`post-effects.ts` (reveal push-in, DoF, heat colour grade). The "Classic" toggle falls back to the 2D table, and does so automatically without WebGL. |
| `src/lib/sound.ts`, `public/sfx/` | Sound engine: CC0 card/chip recordings (Kenney Casino Audio, see `public/sfx/LICENSE.txt`), synthesized stingers, and a fire-crackle ambience that follows streak heat. |
| `src/app/actions.ts` | Server actions the UI calls (deal, play, faucet, rotate seeds, reset). |
| `src/proxy.ts` | Issues the guest-id cookie on first visit. |

The server is the source of truth. The browser only ever receives a sanitized `RoundView`, with no shoe and no hole card until the hand settles.

## Provably fair

1. Each guest has a secret server seed. Its `sha256` is shown before play.
2. Hand number `nonce` uses the shoe `fairShoe(serverSeed, clientSeed, nonce)`.
3. Rotating seeds on `/fairness` reveals the old server seed. The verifier there rebuilds any shoe in the browser, and hand history links straight to it.

## Next phases

- Real wallets: add Sign-In with Ethereum or WalletConnect and on-chain deposits. Deposits become new `ledger` kinds, and the balance logic stays the same.
- Accounts: link a guest id to a real user (e.g. Clerk) so progress carries across devices.
- More games: Mines, Crash, Dice, using the same seed/nonce scheme.
- Hosting: Vercel plus Neon (`DATABASE_URL`).
- Before handling real money: licensing, KYC/age checks and geoblocking.
