# Leak model

Finds the mistakes a player keeps repeating, from their own decision log, and ranks them by what they cost. It runs in the app, on the device and offline (`src/lib/leaks/`). The scripts here fit it and measure it.

## Pipeline

| Step | Code | Output |
|---|---|---|
| 1. Log every graded decision | `src/lib/decisions.ts`, `spotOf()` in `src/lib/poker/table-coach.ts` | `progress.decisions`; Profile → Export history |
| 2. Build a pool of real spots, every option graded by the live coach | `src/lib/leaks/pool.ts`, `npm run ml:pool` | `ml/data/pool.json` (ignored by git; about 2 min) |
| 3. Synthetic players with injected leaks, noise and tilt | `src/lib/leaks/synth.ts` | in memory |
| 4. Fit priors (EM), tune, test against baselines | `scripts/ml/evaluate.ts`, `npm run ml:eval -- --write-priors` | `ml/REPORT.md`, `ml/results.json`, `src/lib/leaks/priors.json` |
| 5. Show leaks with targeted drills | `src/app/review/leak-panel.tsx`, `src/lib/leaks/describe.ts` | Review tab |

## The model

Each graded decision is a chance to miss in one of two directions:

- **Too tight or passive (−1):** folding instead of calling, checking instead of betting, standing instead of hitting.
- **Too loose or aggressive (+1):** the reverse.

Spots the coach calls mixed or close have no single right answer, so they're left out. A miss is a play the coach marks as a mistake; deviations it rates fine (a light 3-bet, a semi-bluff raise) don't count.

Chances are counted in cells:

- **Situation family:** `poker|vs-3bet|*|-1`.
- **Family plus position, or plus blackjack total:** `poker|vs-3bet|CO|-1`, `blackjack|soft|soft-18|-1`.

Each cell gets a two-component beta-binomial mixture:

- **Normal component:** everyone slips a little. Beta with mean μ0 and strength m0.
- **Leak component:** players who keep missing. Mean μ1, strength m1.
- **Prior share of leaking players:** π.

The mixture is fitted per cell with EM on a population of players. For one player with k misses in n chances:

```
P(leak) = π·BB(k|n, leak) / (π·BB(k|n, leak) + (1−π)·BB(k|n, normal))
```

BB is the beta-binomial likelihood. Cells above the threshold are reported, ranked by estimated loss per 100 hands. Costs come only from the coach's own prices: where the coach doesn't price a kind of mistake (opening mistakes, for one), no cost is shown. Under 100 hands the panel shows what one mistake costs instead of projecting per 100. The threshold and other settings are tuned for F0.5, which counts precision twice as much as recall: a wrong "you have a leak" costs more trust than finding a real one a few hands later. A family-wide leak lists its worst positions.

Two further pieces:

- **Player skill:** a robust weighted median of misses / expected misses across families, shrunk toward 1. It adjusts the normal component for each player, so a generally sloppy player isn't told that every spot is a leak.
- **Tilt:** the miss rate in the 6 hands after a big loss (20bb, or 2 bets at blackjack), compared with the rest.

## Assumptions

- **Strategy:** grades come from the in-app coach (6-max, 100bb, the charts in `src/lib/poker/preflop.ts`) and from basic strategy for the table's rules. A leak means "keeps deviating from the coach", so the model is only as good as the coach.
- **Pool approximation:** synthetic players replay recorded hands. After a deviation the hand carries on as recorded, except that a fold ends the hero's decisions. Leaks are detected one decision at a time, so this keeps the mix of spots realistic.
- **Priors:** the shipped priors are fitted on synthetic players. Once real exports are available, refit on them (`--real`).

## Real exports

```
npm run ml:eval -- --real alice.json bob.json carol.json
```

Each file is split in time. Leaks found in the first half are checked against the second half: does the player keep missing there? With three or more files, each player is scored with priors fitted on the others.
