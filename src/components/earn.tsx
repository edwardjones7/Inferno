"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { IconCalendar, IconCheck, IconChevron, IconTrophy } from "@/components/icons";
import { rewardedAdsAvailable, showRewardedAd } from "@/lib/ads";
import { challengesFor, comebackStatus, type Challenge } from "@/lib/challenges";
import { formatChips } from "@/lib/chips";
import {
  AD_DAILY_CAP,
  AD_REWARD,
  adsLeft,
  CHECKIN_REWARDS,
  checkInStatus,
  COMEBACK_GRANT,
  PRO_CHECKIN_MULTIPLIER,
  PRO_MONTHLY_GRANT,
  PRO_SIGNUP_BONUS,
  proGrants,
} from "@/lib/economy";
import {
  claimAdReward,
  claimChallenge,
  claimCheckIn,
  claimComeback,
  claimProMonthly,
  claimProSignup,
  EconomyError,
  useNow,
} from "@/lib/earn";
import { openPaywall, PRO_NAME, useIsPro } from "@/lib/pro";
import { play } from "@/lib/sound";
import { useHydrated, useProgress } from "@/lib/store";

const noop = () => () => {};

/** Run a claim, then celebrate it or explain why it didn't go through. */
export function claim(fn: () => number, what: string) {
  try {
    const n = fn();
    play("win");
    toast.success(`+${formatChips(n)} chips`, { description: what });
    return n;
  } catch (e) {
    toast.error(e instanceof EconomyError ? e.message : "Couldn't claim that");
    return 0;
  }
}

export function ChipDot({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-full bg-[repeating-conic-gradient(#ffc24b_0_20deg,#e5360f_20deg_60deg)] shadow-[0_0_6px_rgba(255,122,31,0.6)] ${className}`} />;
}

/** "+250" with a chip, for reward labels. */
function Reward({ chips, dim }: { chips: number; dim?: boolean }) {
  return (
    <span className={`tabular inline-flex items-center gap-1 text-xs font-bold ${dim ? "text-ash-500" : "text-ember-200"}`}>
      <ChipDot className="h-3 w-3" />+{formatChips(chips)}
    </span>
  );
}

export function untilText(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.round(h / 24)} days`;
}

/* ------------------------------------------------------------------ daily check-in */

/** The week of check-ins: where you are in the streak and what today pays. */
export function CheckInCard({ className = "" }: { className?: string }) {
  const p = useProgress();
  const hydrated = useHydrated();
  const pro = useIsPro();
  const now = useNow();
  const s = hydrated ? checkInStatus(p, now, pro) : null;
  const mult = pro ? PRO_CHECKIN_MULTIPLIER : 1;
  // slots already collected in this cycle of seven
  const collected = s ? (s.available ? s.slot : s.slot + 1) : 0;

  return (
    <div className={`panel relative min-w-0 overflow-hidden rounded-3xl p-5 ${s?.available ? "ring-1 ring-ember-500/40" : ""} ${className}`}>
      {s?.available && <div className="absolute -left-10 -top-12 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgba(255,154,46,0.25),transparent)]" />}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 eyebrow">
            <IconCalendar className="h-3.5 w-3.5" /> Daily check-in
          </p>
          <p className="mt-1 font-display text-lg font-bold">{!s ? " " : s.available ? `Day ${s.day} is waiting` : `Day ${s.day} collected`}</p>
          <p className="text-xs text-ash-400">
            {!s ? " " : s.available ? "Come back every day: the seventh pays the most." : "Back tomorrow for the next one. Miss a day and it starts over."}
            {pro && s ? ` ${PRO_NAME} doubles it.` : ""}
          </p>
        </div>
        {s?.available ? (
          <button onClick={() => claim(claimCheckIn, `Check-in, day ${s.day}`)} className="btn-fire shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold">
            Claim {formatChips(s.reward)}
          </button>
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30">
            <IconCheck className="h-4 w-4" />
          </span>
        )}
      </div>
      <ol className="relative mt-4 grid grid-cols-7 gap-1.5" aria-label="This week's check-ins">
        {CHECKIN_REWARDS.map((r, i) => {
          const done = i < collected;
          const current = s?.available && i === s.slot;
          const big = i === CHECKIN_REWARDS.length - 1;
          return (
            <li
              key={i}
              className={`flex flex-col items-center gap-1 rounded-xl py-2 text-center ring-1 ${
                current
                  ? "bg-ember-500/15 ring-ember-400 shadow-[0_0_18px_-6px_rgba(255,122,31,0.9)]"
                  : done
                    ? "bg-ash-900/80 ring-ash-700"
                    : big
                      ? "bg-ash-950/60 ring-ember-700/50"
                      : "bg-ash-950/60 ring-ash-800"
              }`}
            >
              <span className="text-[9px] font-bold uppercase tracking-wider text-ash-500">{i + 1}</span>
              {done ? <IconCheck className="h-3.5 w-3.5 text-emerald-400" /> : <ChipDot className={big ? "h-4 w-4" : "h-3 w-3"} />}
              <span className={`tabular text-[10px] font-bold ${done ? "text-ash-500" : current || big ? "text-ember-200" : "text-ash-300"}`}>{formatChips(r * mult)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ challenges */

export function ChallengeRow({ c, compact }: { c: Challenge; compact?: boolean }) {
  const pct = (c.progress / c.target) * 100;
  return (
    <li className={`flex items-center gap-3 ${compact ? "py-2" : "rounded-2xl bg-ash-950/50 p-3.5 ring-1 ring-ash-800"}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`truncate text-sm font-bold ${c.claimed ? "text-ash-500 line-through decoration-ash-600" : "text-bone"}`}>{c.title}</p>
          <span className="tabular shrink-0 text-[11px] font-semibold text-ash-400">
            {c.progress}/{c.target}
          </span>
        </div>
        {!compact && <p className="mt-0.5 text-xs text-ash-500">{c.detail}</p>}
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ash-800">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${c.done ? "bg-gradient-to-r from-ember-500 to-ember-300" : "bg-ember-700"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {c.claimed ? (
        <span className="w-[72px] shrink-0 text-right text-[11px] font-bold uppercase tracking-wider text-emerald-400">Claimed</span>
      ) : c.done ? (
        <button onClick={() => claim(() => claimChallenge(c.key), c.title)} className="btn-fire w-[72px] shrink-0 rounded-xl py-2 text-xs font-bold">
          +{formatChips(c.reward)}
        </button>
      ) : (
        <Link href={c.href} className="flex w-[72px] shrink-0 flex-col items-end gap-0.5">
          <Reward chips={c.reward} />
          <span className="flex items-center text-[10px] font-bold uppercase tracking-wider text-ash-500">
            Go <IconChevron className="h-3 w-3" />
          </span>
        </Link>
      )}
    </li>
  );
}

/** Today's challenges, for Home. */
export function ChallengesCard({ className = "" }: { className?: string }) {
  const p = useProgress();
  const hydrated = useHydrated();
  const now = useNow();
  const list = hydrated ? challengesFor("day", p, now) : [];
  const ready = list.filter((c) => c.done && !c.claimed).length;
  const week = hydrated ? challengesFor("week", p, now).filter((c) => c.done && !c.claimed).length : 0;

  return (
    <div className={`panel min-w-0 rounded-3xl p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 eyebrow">
            <IconTrophy className="h-3.5 w-3.5" /> Today&apos;s challenges
          </p>
          <p className="mt-1 font-display text-lg font-bold">
            {!hydrated ? " " : ready ? `${ready} ready to claim` : list.every((c) => c.claimed) ? "All done today" : "Earn chips by playing well"}
          </p>
        </div>
        <Link href="/chips/" className="flex shrink-0 items-center gap-0.5 pt-0.5 text-xs font-bold text-ember-400 hover:text-ember-300">
          {week ? `Weekly (${week})` : "Weekly"}
          <IconChevron className="h-3.5 w-3.5" />
        </Link>
      </div>
      <ul className="mt-2 divide-y divide-ash-800/80">
        {list.map((c) => (
          <ChallengeRow key={c.key} c={c} compact />
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ every way to get chips */

export function useAdsAvailable(): boolean {
  return useSyncExternalStore(noop, rewardedAdsAvailable, () => false);
}

/** Watch a rewarded ad for chips. Hidden when ads can't be shown here (web, no fill). */
export function AdRow() {
  const p = useProgress();
  const now = useNow();
  const available = useAdsAvailable();
  const [busy, setBusy] = useState(false);
  if (!available) return null;
  const left = adsLeft(p, now);
  const watch = async () => {
    setBusy(true);
    try {
      const earned = await showRewardedAd("chips");
      if (earned) claim(claimAdReward, "Thanks for watching");
      else toast("No chips this time", { description: "The ad has to play to the end." });
    } catch {
      toast.error("The ad couldn't load. Try again in a bit.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <EarnRow
      title={`Watch an ad for ${formatChips(AD_REWARD)} chips`}
      sub={left ? `${left} of ${AD_DAILY_CAP} left today` : "That's all for today. More tomorrow."}
      action={
        <button onClick={watch} disabled={busy || left === 0} className="btn-ash shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold">
          {busy ? "Loading…" : "Watch"}
        </button>
      }
    />
  );
}

function EarnRow({ title, sub, action, hot }: { title: string; sub: string; action: React.ReactNode; hot?: boolean }) {
  return (
    <li className={`flex items-center gap-3 rounded-2xl p-3.5 ring-1 ${hot ? "bg-ember-500/10 ring-ember-500/40" : "bg-ash-950/50 ring-ash-800"}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-bone">{title}</p>
        <p className="text-xs text-ash-400">{sub}</p>
      </div>
      {action}
    </li>
  );
}

/**
 * Every way to get chips right now, most useful first. `skip` leaves out rows the screen
 * already shows on its own (the chips page has the check-in and challenges in full).
 */
export function EarnList({ skip = [] }: { skip?: ("checkin" | "challenges")[] }) {
  const p = useProgress();
  const hydrated = useHydrated();
  const pro = useIsPro();
  const now = useNow(15_000);
  if (!hydrated) return null;

  const ci = checkInStatus(p, now, pro);
  const all = [...challengesFor("day", p, now), ...challengesFor("week", p, now)];
  const ready = all.filter((c) => c.done && !c.claimed);
  const open = all.filter((c) => !c.done).sort((a, b) => b.progress / b.target - a.progress / a.target);
  const cb = comebackStatus(p, now, pro);
  const grants = proGrants(p, now, pro);

  return (
    <ul className="grid grid-cols-1 gap-2">
      {grants.signup && (
        <EarnRow
          hot
          title={`${PRO_NAME} welcome bonus`}
          sub="A one-time thank-you for joining."
          action={
            <button onClick={() => claim(claimProSignup, `${PRO_NAME} welcome bonus`)} className="btn-fire shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold">
              +{formatChips(PRO_SIGNUP_BONUS)}
            </button>
          }
        />
      )}
      {grants.monthly && (
        <EarnRow
          hot
          title={`${PRO_NAME} monthly chips`}
          sub="Claim once every calendar month."
          action={
            <button onClick={() => claim(claimProMonthly, `${PRO_NAME} monthly chips`)} className="btn-fire shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold">
              +{formatChips(PRO_MONTHLY_GRANT)}
            </button>
          }
        />
      )}
      {!skip.includes("checkin") && (
        <EarnRow
          hot={ci.available}
          title={ci.available ? `Daily check-in, day ${ci.day}` : "Daily check-in"}
          sub={ci.available ? "Seven days in a row pays the most." : `Collected. Day ${ci.day + 1} pays ${formatChips(CHECKIN_REWARDS[(ci.slot + 1) % CHECKIN_REWARDS.length] * (pro ? PRO_CHECKIN_MULTIPLIER : 1))} tomorrow.`}
          action={
            ci.available ? (
              <button onClick={() => claim(claimCheckIn, `Check-in, day ${ci.day}`)} className="btn-fire shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold">
                +{formatChips(ci.reward)}
              </button>
            ) : (
              <IconCheck className="h-5 w-5 shrink-0 text-emerald-400" />
            )
          }
        />
      )}
      {!skip.includes("challenges") &&
        (ready.length ? (
          <EarnRow
            hot
            title={`${ready.length} challenge${ready.length === 1 ? "" : "s"} finished`}
            sub={ready.map((c) => c.title).join(" · ")}
            action={
              <button
                onClick={() => {
                  for (const c of ready) claim(() => claimChallenge(c.key), c.title);
                }}
                className="btn-fire shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold"
              >
                +{formatChips(ready.reduce((n, c) => n + c.reward, 0))}
              </button>
            }
          />
        ) : open[0] ? (
          <EarnRow
            title={`Challenge: ${open[0].title}`}
            sub={`${open[0].progress}/${open[0].target} so far · pays ${formatChips(open[0].reward)}`}
            action={
              <Link href="/chips/" className="btn-ash shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold">
                All
              </Link>
            }
          />
        ) : null)}
      <AdRow />
      {cb.broke && (
        <EarnRow
          hot={cb.available}
          title={`Comeback chips: ${formatChips(COMEBACK_GRANT)}`}
          sub={
            cb.available
              ? "Free when you're running on empty."
              : cb.blocked
                ? "Claim the rewards above first."
                : `Ready in ${untilText((cb.readyAt ?? 0) - now.getTime())}.`
          }
          action={
            <button onClick={() => claim(claimComeback, "Comeback chips")} disabled={!cb.available} className="btn-fire shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold">
              {cb.available ? "Claim" : cb.readyAt ? untilText(cb.readyAt - now.getTime()) : "Claim"}
            </button>
          }
        />
      )}
      {!pro && (
        <EarnRow
          title={PRO_NAME}
          sub={`${formatChips(PRO_SIGNUP_BONUS)} chips when you join, ${formatChips(PRO_MONTHLY_GRANT)} every month, double check-ins.`}
          action={
            <button onClick={() => openPaywall("chips")} className="btn-ash shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold">
              See Pro
            </button>
          }
        />
      )}
    </ul>
  );
}

/* ------------------------------------------------------------------ out of chips */

/**
 * Shown at a table when the balance can't cover the next bet or buy-in: every way to get
 * more, and a reminder that training never costs chips.
 */
export function OutOfChipsSheet({ open, onClose, need }: { open: boolean; onClose: () => void; need: string }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-end bg-ash-950/70 backdrop-blur-sm sm:place-items-center"
          role="dialog"
          aria-modal
          aria-label="Get more chips"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
            className="panel max-h-[90dvh] w-full overflow-y-auto rounded-t-[32px] p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] sm:max-w-md sm:rounded-[32px] sm:p-6"
          >
            <div className="flex items-start gap-3">
              <ChipDot className="h-11 w-11 opacity-40 grayscale" />
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-xl font-black">Low on chips</h2>
                <p className="text-sm text-ash-400">{need}</p>
              </div>
              <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ash-400 hover:bg-ash-800">
                ✕
              </button>
            </div>
            <div className="mt-4">
              <EarnList />
            </div>
            <Link href="/train/" className="mt-3 flex items-center gap-3 rounded-2xl p-3 text-xs text-ash-400 ring-1 ring-ash-800 hover:bg-ash-900">
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-ash-200">Training is always free</span>
                Lessons, drills and puzzles never cost chips, and they finish challenges.
              </span>
              <IconChevron className="h-4 w-4 shrink-0" />
            </Link>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
