import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CoinIcon } from "@/components/coin-icon";
import { MiniCard } from "@/components/playing-card-static";
import type { Card } from "@/lib/blackjack/cards";
import { formatUsd } from "@/lib/currency";
import { MOVE_LABEL, type Move } from "@/lib/blackjack/strategy";
import { getProfile, getTraining } from "@/server/casino";
import { currentUserId } from "@/server/session";
import { ResetBalances } from "./reset-balances";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Suspense fallback={<div className="panel h-96 animate-pulse rounded-3xl" />}>
        <Profile />
      </Suspense>
    </div>
  );
}

async function Profile() {
  const userId = await currentUserId();
  if (!userId) return <p className="text-ash-400">Enable cookies to keep a guest profile.</p>;
  const [{ name, createdAt, stats, history, curve }, training] = await Promise.all([getProfile(userId), getTraining(userId)]);
  const losses = stats.hands - stats.wins - stats.pushes;
  const winRate = stats.hands ? (stats.wins / stats.hands) * 100 : 0;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-ember-400">Guest profile</p>
          <h1 className="break-all font-display text-2xl font-black sm:text-3xl">{name}</h1>
          <p className="mt-1 text-xs text-ash-400">Playing since {new Date(createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })}</p>
        </div>
        <ResetBalances />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Net profit" value={formatUsd(stats.netUsd, { sign: true, compact: true })} hot={stats.netUsd > 0} />
        <Stat label="Hands" value={stats.hands.toLocaleString()} sub={`${stats.wins}W · ${stats.pushes}P · ${losses}L`} />
        <Stat label="Win rate" value={`${winRate.toFixed(1)}%`} />
        <Stat label="Biggest win" value={formatUsd(stats.bestWinUsd, { compact: true })} hot={stats.bestWinUsd > 0} />
        <Stat label="Blackjacks" value={String(stats.blackjacks)} sub={`${formatUsd(stats.wageredUsd, { compact: true })} wagered`} />
      </div>

      <TrainingReport training={training} />

      <section className="panel mt-6 rounded-3xl p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-sm font-bold">Profit, last {curve.length} hands</h2>
          <span className={`tabular text-sm font-bold ${curve.at(-1)! >= 0 ? "text-ember-300" : "text-ash-400"}`}>
            {curve.length ? formatUsd(curve.at(-1)!, { sign: true }) : ""}
          </span>
        </div>
        <ProfitChart points={curve} />
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg font-bold">Hand history</h2>
        {history.length === 0 ? (
          <div className="panel rounded-3xl px-5 py-12 text-center text-sm text-ash-400">
            No hands yet.{" "}
            <Link href="/blackjack" className="font-semibold text-ember-400 hover:text-ember-300">
              Take a seat →
            </Link>
          </div>
        ) : (
          <div className="panel overflow-x-auto rounded-3xl">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-ash-500">
                  <th className="px-5 py-3 font-semibold">Time</th>
                  <th className="px-3 py-3 font-semibold">Dealer</th>
                  <th className="px-3 py-3 font-semibold">You</th>
                  <th className="px-3 py-3 text-right font-semibold">Bet</th>
                  <th className="px-3 py-3 text-right font-semibold">Profit</th>
                  <th className="px-5 py-3 text-right font-semibold">Fairness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ash-800">
                {history.map((h) => (
                  <tr key={h.id} className="align-middle">
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-ash-400">
                      {new Date(h.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex gap-0.5">
                        {h.dealer.map((c, i) => (
                          <MiniCard key={i} card={c as Card} />
                        ))}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-2">
                        {h.hands.map((hand, i) => (
                          <span key={i} className="flex items-center gap-0.5">
                            {hand.cards.map((c, j) => (
                              <MiniCard key={j} card={c as Card} />
                            ))}
                            <span className="ml-1 text-[10px] font-bold uppercase text-ash-400">{hand.result}</span>
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-3 text-right">
                      <span className="inline-flex items-center gap-1.5">
                        <CoinIcon currency={h.currency} size={14} />
                        {formatUsd(h.wageredUsd)}
                      </span>
                    </td>
                    <td className={`tabular px-3 py-3 text-right font-bold ${h.profitUsd > 0 ? "text-ember-300" : h.profitUsd < 0 ? "text-ash-500" : "text-ash-300"}`}>
                      {formatUsd(h.profitUsd, { sign: true })}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-xs">
                      {h.serverSeed ? (
                        <Link
                          href={`/fairness?server=${h.serverSeed}&client=${encodeURIComponent(h.clientSeed)}&nonce=${h.nonce}`}
                          className="font-semibold text-ember-400 hover:text-ember-300"
                        >
                          Verify #{h.nonce} →
                        </Link>
                      ) : (
                        <span className="text-ash-500" title="Rotate your seed on the Fairness page to reveal it">
                          Seed hidden · #{h.nonce}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Stat({ label, value, sub, hot }: { label: string; value: string; sub?: string; hot?: boolean }) {
  return (
    <div className="panel rounded-2xl p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ash-500">{label}</p>
      <p className={`tabular mt-1 font-display text-xl font-bold ${hot ? "molten-text" : "text-bone"}`}>{value}</p>
      {sub && <p className="tabular mt-0.5 text-[11px] text-ash-400">{sub}</p>}
    </div>
  );
}

function ProfitChart({ points }: { points: number[] }) {
  if (points.length < 2) {
    return <div className="grid h-40 place-items-center text-sm text-ash-500">Play a couple of hands to see your curve.</div>;
  }
  const W = 800;
  const H = 160;
  const all = [0, ...points];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const x = (i: number) => (i / (all.length - 1)) * W;
  const y = (v: number) => H - 8 - ((v - min) / span) * (H - 16);
  const line = all.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const zero = y(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" preserveAspectRatio="none" role="img" aria-label="Cumulative profit chart">
      <defs>
        <linearGradient id="pf-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff5a1f" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ff5a1f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pf-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b3200c" />
          <stop offset="0.6" stopColor="#ff7a1f" />
          <stop offset="1" stopColor="#ffc24b" />
        </linearGradient>
      </defs>
      <line x1="0" x2={W} y1={zero} y2={zero} stroke="#3d2e24" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
      <path d={`${line}L${W},${H}L0,${H}Z`} fill="url(#pf-fill)" />
      <path d={line} fill="none" stroke="url(#pf-line)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

const KIND_LABEL: Record<string, string> = { hard: "Hard totals", soft: "Soft totals", pair: "Pairs", insurance: "Insurance" };
const pct = (num: number, den: number) => (den ? Math.round((num / den) * 100) : null);

function TrainingReport({ training }: { training: Awaited<ReturnType<typeof getTraining>> }) {
  const { live, drill, byKind, leaks } = training;
  const liveAcc = pct(live.correct, live.decisions);
  const drillAcc = pct(drill.correct, drill.answers);
  return (
    <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className="panel rounded-3xl p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-sm font-bold">Strategy accuracy</h2>
          <Link href="/trainer" className="text-xs font-semibold text-ember-400 hover:text-ember-300">
            Open trainer →
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ash-500">At the table</p>
            <p className={`tabular mt-1 font-display text-2xl font-bold ${liveAcc !== null && liveAcc >= 95 ? "molten-text" : "text-bone"}`}>
              {liveAcc === null ? "–" : `${liveAcc}%`}
            </p>
            <p className="tabular text-[11px] text-ash-400">{live.decisions} decisions graded</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ash-500">In drills</p>
            <p className={`tabular mt-1 font-display text-2xl font-bold ${drillAcc !== null && drillAcc >= 95 ? "molten-text" : "text-bone"}`}>
              {drillAcc === null ? "–" : `${drillAcc}%`}
            </p>
            <p className="tabular text-[11px] text-ash-400">
              {drill.answers} answers · best streak {drill.bestStreak}
            </p>
          </div>
        </div>
        {byKind.length > 0 && (
          <ul className="mt-5 space-y-2.5">
            {byKind
              .sort((a, b) => b.seen - a.seen)
              .map((k) => {
                const acc = pct(k.correct, k.seen) ?? 0;
                return (
                  <li key={k.kind}>
                    <div className="flex justify-between text-xs">
                      <span className="text-ash-300">{KIND_LABEL[k.kind] ?? k.kind}</span>
                      <span className="tabular text-ash-400">
                        {acc}% <span className="text-ash-600">· {k.seen}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ash-800">
                      <div
                        className={`h-full rounded-full ${acc >= 90 ? "bg-gradient-to-r from-ember-500 to-ember-300" : acc >= 75 ? "bg-ember-600" : "bg-ember-800"}`}
                        style={{ width: `${acc}%` }}
                      />
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      <div className="panel rounded-3xl p-5">
        <h2 className="font-display text-sm font-bold">Biggest leaks</h2>
        <p className="mt-1 text-xs text-ash-400">The spots you get wrong most often, at the table and in drills.</p>
        {leaks.length === 0 ? (
          <p className="mt-6 text-center text-sm text-ash-500">No leaks found yet. Play with Coach on or run a drill.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ash-800">
            {leaks.map((l) => (
              <li key={`${l.spot}|${l.correct}`} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-bone">{l.spot === "insurance" ? "Taking insurance" : l.label}</span>
                  <span className="block text-xs text-ash-400">
                    Right play: {l.correct === "decline" ? "decline" : (MOVE_LABEL[l.correct as Move] ?? l.correct).toLowerCase()}
                  </span>
                </span>
                <span className="tabular text-xs text-ember-300">
                  missed {l.misses} of {l.seen}
                </span>
                {l.spot !== "insurance" && (
                  <Link href={`/trainer?spot=${l.spot}`} className="btn-ash shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold">
                    Drill
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
