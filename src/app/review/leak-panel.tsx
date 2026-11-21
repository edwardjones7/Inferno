"use client";

import Link from "next/link";
import { useMemo } from "react";
import { leakDrillHref, leakTitle, leakWhere, missAction } from "@/lib/leaks/describe";
import { findLeaks, gradedOf, type Leak, type Priors } from "@/lib/leaks/model";
import PRIORS from "@/lib/leaks/priors.json";
import { play } from "@/lib/sound";
import { useProgress } from "@/lib/store";

/** Graded decisions before the leak finder says anything: below this it's mostly noise. */
export const LEAK_MIN_DECISIONS = 40;
/** Hands (or rounds) before a cost is projected per 100: earlier, show what one mistake costs. */
const PER_100_MIN = 100;

const pctText = (x: number) => `${x < 0.1 ? (x * 100).toFixed(1) : Math.round(x * 100)}%`;

/**
 * "Your leaks": the mistakes this player keeps repeating (src/lib/leaks/model.ts), ranked
 * by what they cost, each with a drill aimed at it. Computed on the device from the
 * decision log, so it works offline.
 */
export function LeakPanel({ game }: { game: "poker" | "blackjack" }) {
  const { decisions } = useProgress();
  const report = useMemo(() => findLeaks(decisions, PRIORS as unknown as Priors), [decisions]);
  const graded = useMemo(() => decisions.filter((r) => r.game === game && gradedOf(r)).length, [decisions, game]);
  const leaks = report.leaks.filter((l) => l.game === game).slice(0, 3);
  const tilt = report.tilt.find((t) => t.game === game);
  const unit = game === "poker" ? "bb" : "bets";
  const per = game === "poker" ? "100 hands" : "100 rounds";

  return (
    <section className="panel mb-4 rounded-3xl px-4 py-4 sm:px-5" aria-labelledby={`leaks-${game}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={`leaks-${game}`} className="font-display text-sm font-bold uppercase tracking-wide text-bone">
          Your leaks
        </h2>
        <p className="text-[11px] text-ash-500">
          From {graded.toLocaleString()} graded {game === "poker" ? "decisions" : "plays"}, compared with how players usually slip
        </p>
      </div>

      {graded < LEAK_MIN_DECISIONS ? (
        <div className="mt-3">
          <p className="text-sm text-ash-300">
            Play a little more and this finds the mistakes you keep repeating, not just one-off slips.
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ash-800" role="progressbar" aria-valuemin={0} aria-valuemax={LEAK_MIN_DECISIONS} aria-valuenow={graded}>
            <div className="h-full rounded-full bg-ember-500" style={{ width: `${(graded / LEAK_MIN_DECISIONS) * 100}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-ash-500">{LEAK_MIN_DECISIONS - graded} more to go</p>
        </div>
      ) : !leaks.length && !tilt ? (
        <p className="mt-3 text-sm text-ash-300">
          No repeated leaks so far. Your mistakes are scattered, which is what good play looks like. Keep going: rare spots like 3-bets need a few hundred hands to judge.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-ash-800">
          {leaks.map((l) => (
            <LeakRow key={l.id} leak={l} title={leakTitle(l, missAction(l, decisions))} href={leakDrillHref(l, decisions)} unit={unit} per={per} perHundred={report.hands[game] >= PER_100_MIN} />
          ))}
          {tilt && (
            <li className="py-3">
              <p className="text-sm font-bold text-bone">Tilt after big losses</p>
              <p className="mt-0.5 text-xs text-ash-400">
                You miss {pctText(tilt.k / tilt.n)} of spots in the hands right after a big loss, against {pctText(tilt.baseK / Math.max(1, tilt.baseN))} the rest of the
                time. Take a breath (or a break) after a big pot.
              </p>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function LeakRow({ leak: l, title, href, unit, per, perHundred }: { leak: Leak; title: string; href: string; unit: string; per: string; perHundred: boolean }) {
  const where = leakWhere(l);
  const amount = (x: number) => x.toFixed(x < 10 ? 1 : 0);
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-bone">
          {title}
          {where && <span className="font-semibold text-ash-400"> {where}</span>}
        </p>
        <p className="mt-0.5 text-xs text-ash-400">
          {l.k} of {l.n} spots ({pctText(l.k / l.n)}); a typical player misses {pctText(l.normal)}.
          {perHundred
            ? (l.costPer100 ?? 0) >= 0.05 && (
                <span className="text-ember-300">
                  {" "}
                  About {amount(l.costPer100!)} {unit} per {per}.
                </span>
              )
            : (l.perMiss ?? 0) >= 0.05 && (
                <span className="text-ember-300">
                  {" "}
                  Each one costs about {amount(l.perMiss!)} {unit === "bets" ? "of a bet" : unit}.
                </span>
              )}
        </p>
      </div>
      <Link
        href={href}
        onClick={() => play("click")}
        className="inline-flex h-8 shrink-0 items-center rounded-full bg-ember-500/15 px-3 text-[11px] font-bold text-ember-200 ring-1 ring-ember-500/40 hover:bg-ember-500/25"
      >
        Drill it →
      </Link>
    </li>
  );
}
