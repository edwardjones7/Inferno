"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { EmberBurst } from "@/components/ember-burst";
import { IconPlay, IconReview, IconSpade, IconX } from "@/components/icons";
import { FlameMark } from "@/components/logo";
import { FREE_LESSONS_PER_TRACK, FREE_REVIEW_HANDS, PRO_BOT_TIERS } from "@/lib/gates";
import { lessonById, TRACKS } from "@/lib/learn";
import { botById, ROSTER, TIER_LABEL } from "@/lib/poker/roster";
import { PRO_NAME, useProState } from "@/lib/pro";
import {
  getYearlySavings,
  loadOfferings,
  openSubscriptionManagement,
  purchasePlan,
  restorePurchases,
  usePurchases,
  type Plan,
  type PlanId,
  type StoreKind,
} from "@/lib/purchases";
import { play } from "@/lib/sound";

/* ------------------------------------------------------------------ copy */

type Perk = "ads" | "lessons" | "counting" | "bots" | "review" | "chips" | "designs";

const PRO_BOTS = ROSTER.filter((b) => PRO_BOT_TIERS.includes(b.tier)).map((b) => b.name);
const listNames = (n: string[]) => (n.length < 2 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n.at(-1)}`);

const PERKS: { id: Perk; title: string; sub: string; soon?: boolean }[] = [
  { id: "lessons", title: "Every lesson", sub: `The full Blackjack and Hold'em courses, past the first ${FREE_LESSONS_PER_TRACK} of each.` },
  { id: "counting", title: "The card counting course", sub: "Running count, true count, deck countdowns and index plays." },
  { id: "bots", title: "The strongest bots", sub: `${listNames(PRO_BOTS)}: the top of the ladder.` },
  { id: "review", title: "Every hand, replayable", sub: `Step through your whole history, not just the last ${FREE_REVIEW_HANDS}.` },
  { id: "ads", title: "No ads", sub: "Nothing between you and the next hand." },
  { id: "chips", title: "Chip bonus, then chips monthly", sub: "A big stack when you join and a fresh grant every month." },
  { id: "designs", title: "Exclusive table designs", sub: "New felts and card backs for members.", soon: true },
];

interface Pitch {
  eyebrow: string;
  title: string;
  sub: string;
  perk: Perk | null;
}

/** Headline for what the player just tried to open. */
function pitchFor(reason: string | null): Pitch {
  const [kind, arg] = (reason ?? "").split(":");
  if (kind === "lesson") {
    const l = arg ? lessonById(arg) : undefined;
    if (l) {
      const list = TRACKS[l.track].lessons;
      const after = list.length - list.indexOf(l) - 1;
      return {
        eyebrow: `${TRACKS[l.track].title} · Lesson ${list.indexOf(l) + 1}`,
        title: "Finish the course",
        sub:
          after > 0
            ? `“${l.title}” and the ${after} lesson${after > 1 ? "s" : ""} after it are part of ${PRO_NAME}.`
            : `“${l.title}”, the last lesson in the track, is part of ${PRO_NAME}.`,
        perk: "lessons",
      };
    }
  }
  if (kind === "counting")
    return {
      eyebrow: "Blackjack · Advanced",
      title: "Learn to count the shoe",
      sub: "Hi-Lo from the first card to the index plays, drilled until it's automatic.",
      perk: "counting",
    };
  if (kind === "bot") {
    const b = botById(arg);
    if (b)
      return {
        eyebrow: `${TIER_LABEL[b.tier]} · ${b.rating}`,
        title: `Take a seat against ${b.name}`,
        sub: `${b.name} plays at the top of the ladder, where mistakes get punished. That's where you get better.`,
        perk: "bots",
      };
  }
  if (kind === "review")
    return {
      eyebrow: "Review",
      title: "Keep every hand on file",
      sub: `Free covers your last ${FREE_REVIEW_HANDS}. Pro lets you replay every one with the coach's note on each decision.`,
      perk: "review",
    };
  return {
    eyebrow: PRO_NAME,
    title: "Unlock the whole Inferno",
    sub: "Every lesson, every bot, every hand you've played. No ads.",
    perk: null,
  };
}

const STORE_LABEL: Record<StoreKind, { account: string; settings: string }> = {
  app_store: { account: "your Apple ID", settings: "your App Store account settings" },
  play_store: { account: "your Google Play account", settings: "Google Play › Subscriptions" },
  none: { account: "your App Store or Google Play account", settings: "your store's subscription settings" },
};

/* ------------------------------------------------------------------ sheet */

export function Paywall({ reason, onClose }: { reason: string | null; onClose: () => void }) {
  const store = usePurchases();
  const pro = useProState();
  const [planId, setPlanId] = useState<PlanId>("annual");
  const [welcome, setWelcome] = useState(false);
  const pitch = pitchFor(reason);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  // modal behaviour: Escape closes, the page underneath doesn't scroll, focus starts on close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const plan = store.plans[planId];
  const native = store.store !== "none";
  const selling = native && store.status !== "unavailable";

  const buy = async () => {
    play("chip");
    const r = await purchasePlan(planId);
    if (r === "purchased") {
      play("win");
      setWelcome(true);
    } else if (r === "pending") toast("Purchase pending. Pro turns on as soon as the store approves it.");
    else if (r === "failed") toast.error("The purchase didn't go through. You weren't charged.");
    else if (r === "unavailable") toast.error("The store isn't reachable right now. Try again in a moment.");
  };

  const restore = async () => {
    play("click");
    const r = await restorePurchases();
    if (r === "restored") {
      play("win");
      setWelcome(true);
    } else if (r === "nothing") toast("No active subscription found for this store account.");
    else if (r === "unavailable") toast("Restore works in the iOS and Android app.");
    else toast.error("Couldn't reach the store. Try again in a moment.");
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <button aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-ash-950/80 backdrop-blur-md" />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ y: 48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 32, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        className="relative flex h-dvh w-full flex-col overflow-hidden bg-ash-950 sm:h-auto sm:max-h-[min(92dvh,860px)] sm:max-w-[480px] sm:rounded-[32px] sm:ring-1 sm:ring-ember-500/30 sm:shadow-[0_40px_120px_-30px_rgba(255,90,31,0.55)]"
      >
        {/* firelight from below the fold, a hot rim on top */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,rgba(255,90,31,0.32),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-ember-300/80 to-transparent" />
        <Sparks />

        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-[calc(env(safe-area-inset-top)+12px)] z-10 grid h-10 w-10 place-items-center rounded-full bg-ash-900/80 text-ash-300 ring-1 ring-ash-700 backdrop-blur hover:text-bone sm:top-3"
        >
          <IconX className="h-4 w-4" />
        </button>

        {welcome || (pro.active && !pro.dev) ? (
          <Welcome titleId={titleId} fresh={welcome} store={store.store} onClose={onClose} />
        ) : (
          <>
            <div className="no-scrollbar relative flex-1 overflow-y-auto px-5 pb-4 pt-[calc(env(safe-area-inset-top)+36px)] sm:px-7 sm:pt-9">
              <Hero pitch={pitch} titleId={titleId} />
              <Perks highlight={pitch.perk} />
              {selling ? (
                <Plans value={planId} onChange={setPlanId} plans={store.plans} loading={store.status === "loading" || store.status === "idle"} />
              ) : (
                <AppOnly native={native} />
              )}
            </div>

            <div className="relative border-t border-ash-800/80 bg-ash-950/95 px-5 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3.5 backdrop-blur-xl sm:px-7 sm:pb-5">
              {selling && (
                <>
                  <button
                    onClick={buy}
                    disabled={!plan || !!store.busy}
                    className="btn-fire relative flex h-14 w-full items-center justify-center overflow-hidden rounded-2xl font-display text-[15px] font-bold tracking-wide"
                  >
                    {store.busy === "purchase" ? <Spinner /> : ctaLabel(plan)}
                  </button>
                  <p className="tabular mt-2 min-h-4 text-center text-[11px] font-semibold text-ash-300">{termsLine(plan, store.status)}</p>
                  {store.status === "error" && (
                    <button onClick={() => void loadOfferings()} className="mx-auto mt-1 block text-[11px] font-bold text-ember-400">
                      Try again
                    </button>
                  )}
                </>
              )}
              <div className="mt-2 flex items-center justify-center gap-4 text-[11px] font-bold text-ash-400">
                {native && (
                  <button onClick={restore} disabled={!!store.busy} className="hover:text-bone disabled:opacity-50">
                    {store.busy === "restore" ? "Restoring…" : "Restore purchases"}
                  </button>
                )}
                <Link href="/legal/terms/" className="hover:text-bone">
                  Terms
                </Link>
                <Link href="/legal/privacy/" className="hover:text-bone">
                  Privacy
                </Link>
              </div>
              <p className="mt-2 text-center text-[10px] leading-snug text-ash-500">
                {PRO_NAME} is an auto-renewing subscription. Payment is charged to {STORE_LABEL[store.store].account} when you confirm, or when the free
                trial ends. It renews at the same price unless cancelled at least 24 hours before the end of the current period. Manage or cancel any
                time in {STORE_LABEL[store.store].settings}.
              </p>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

const ctaLabel = (plan: Plan | null) => {
  if (!plan) return "Subscribe";
  if (plan.trialDays) return `Start ${plan.trialDays}-day free trial`;
  return plan.id === "annual" ? "Subscribe yearly" : "Subscribe monthly";
};

function termsLine(plan: Plan | null, status: string): string {
  if (status === "error") return "The store didn't answer, so prices aren't available.";
  if (!plan) return " ";
  const per = plan.id === "annual" ? "a year" : "a month";
  if (plan.trialDays) return `${plan.trialDays} days free, then ${plan.price} ${per}. Cancel before the trial ends and you pay nothing.`;
  return `${plan.price} ${per}. Cancel anytime.`;
}

/* ------------------------------------------------------------------ parts */

function Hero({ pitch, titleId }: { pitch: Pitch; titleId: string }) {
  return (
    <div className="relative text-center">
      <div className="relative mx-auto h-20 w-20">
        <span className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,rgba(255,154,46,0.55),transparent)] blur-md" />
        <FlameMark className="relative h-20 w-20 animate-flicker drop-shadow-[0_0_24px_rgba(255,90,31,0.8)]" />
      </div>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.32em] text-ember-400">{pitch.eyebrow}</p>
      <h2 id={titleId} className="mx-auto mt-2 max-w-sm font-display text-[28px] font-black leading-[1.02] tracking-tight sm:text-[32px]">
        <span className="molten-text">{pitch.title}</span>
      </h2>
      <p className="mx-auto mt-2.5 max-w-sm text-sm leading-relaxed text-ash-300">{pitch.sub}</p>
    </div>
  );
}

function Perks({ highlight }: { highlight: Perk | null }) {
  // the perk they reached for leads the list
  const list = highlight ? [...PERKS].sort((a, b) => Number(b.id === highlight) - Number(a.id === highlight)) : PERKS;
  return (
    <ul className="mt-6 space-y-1">
      {list.map((p, i) => {
        const hot = p.id === highlight;
        return (
          <motion.li
            key={p.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.06 + i * 0.035, duration: 0.25 }}
            className={`flex items-center gap-3 rounded-2xl px-2.5 py-2 ${hot ? "bg-ember-500/10 ring-1 ring-ember-500/35" : ""}`}
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ${
                hot ? "bg-ember-500/20 text-ember-200 ring-ember-400/50" : "bg-ash-900 text-ember-300 ring-ash-700"
              }`}
            >
              <PerkIcon id={p.id} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-bold text-bone">
                {p.title}
                {p.soon && <span className="rounded-full bg-ash-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ash-400">Soon</span>}
              </span>
              <span className="block text-xs leading-snug text-ash-400">{p.sub}</span>
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
}

function Plans({
  value,
  onChange,
  plans,
  loading,
}: {
  value: PlanId;
  onChange: (p: PlanId) => void;
  plans: Record<PlanId, Plan | null>;
  loading: boolean;
}) {
  const save = getYearlySavings();
  const options: { id: PlanId; label: string; unit: string }[] = [
    { id: "annual", label: "Yearly", unit: "/yr" },
    { id: "monthly", label: "Monthly", unit: "/mo" },
  ];
  return (
    <div role="radiogroup" aria-label="Plan" className="mt-6 grid gap-2.5">
      {options.map((o) => {
        const plan = plans[o.id];
        const on = value === o.id;
        return (
          <button
            key={o.id}
            role="radio"
            aria-checked={on}
            onClick={() => {
              onChange(o.id);
              play("click");
            }}
            className={`relative flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-all ${
              on
                ? "bg-[linear-gradient(180deg,rgb(255_90_31/0.16),rgb(122_15_10/0.14))] ring-2 ring-ember-400 shadow-[0_0_36px_-12px_rgba(255,90,31,0.9)]"
                : "bg-ash-900/80 ring-1 ring-ash-700 hover:ring-ash-500"
            }`}
          >
            {o.id === "annual" && save && (
              <span className="absolute -top-2.5 right-4 rounded-full bg-gradient-to-b from-ember-300 to-ember-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-ash-950 shadow-[0_4px_14px_-4px_rgba(255,90,31,0.9)]">
                Save {save}%
              </span>
            )}
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ring-2 ${on ? "ring-ember-400" : "ring-ash-600"}`}>
              {on && <span className="h-2.5 w-2.5 rounded-full bg-ember-400 shadow-[0_0_8px_rgba(255,154,46,0.9)]" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-display text-[15px] font-bold">
                {o.label}
                {plan?.trialDays ? (
                  <span className="rounded-full bg-ember-500/15 px-1.5 py-0.5 font-sans text-[10px] font-bold text-ember-200 ring-1 ring-ember-500/40">
                    {plan.trialDays} days free
                  </span>
                ) : null}
              </span>
              <span className="tabular block text-[11px] text-ash-400">
                {o.id === "annual" ? (plan?.perMonth ? `${plan.perMonth}/mo, billed yearly` : "Billed yearly") : "Billed monthly"}
              </span>
            </span>
            <span className="tabular shrink-0 text-right font-display text-lg font-bold">
              {plan ? plan.price : loading ? <span className="inline-block h-4 w-14 animate-pulse rounded bg-ash-800 align-middle" /> : "—"}
              {plan && <span className="ml-0.5 font-sans text-[11px] font-semibold text-ash-400">{o.unit}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The web has no store: say where Pro is sold. Also covers a native build without purchases set up. */
function AppOnly({ native }: { native: boolean }) {
  return (
    <div className="mt-6 rounded-2xl bg-ash-900/80 p-4 text-center ring-1 ring-ash-700">
      <p className="font-display text-[15px] font-bold">{native ? "Purchases aren't available in this build" : `${PRO_NAME} lives in the app`}</p>
      <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-ash-400">
        {native
          ? "This copy of Inferno isn't connected to the store yet."
          : "Subscribe in Inferno for iPhone or Android, through the App Store or Google Play. Everything free here stays free."}
      </p>
    </div>
  );
}

function Welcome({ titleId, fresh, store, onClose }: { titleId: string; fresh: boolean; store: StoreKind; onClose: () => void }) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      {fresh && (
        <span className="pointer-events-none absolute left-1/2 top-[38%]">
          <EmberBurst count={48} intensity={1.3} />
        </span>
      )}
      <FlameMark className="h-24 w-24 animate-flicker drop-shadow-[0_0_30px_rgba(255,90,31,0.9)]" />
      <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.32em] text-ember-400">{PRO_NAME}</p>
      <h2 id={titleId} className="mt-2 font-display text-3xl font-black leading-tight">
        <span className="molten-text">{fresh ? "You're in." : "You're already Pro."}</span>
      </h2>
      <p className="mt-2 max-w-xs text-sm text-ash-300">Every lesson, every bot and every hand you&apos;ve played is open. Go get better.</p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
        <button onClick={onClose} className="btn-fire h-12 rounded-xl text-sm font-bold">
          Let&apos;s go
        </button>
        {!fresh && store !== "none" && (
          <button onClick={() => openSubscriptionManagement()} className="h-10 rounded-xl text-xs font-semibold text-ash-400 hover:text-bone">
            Manage subscription
          </button>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return <span className="h-5 w-5 animate-spin rounded-full border-2 border-ash-950/30 border-t-ash-950" aria-label="Working" />;
}

/** A few embers drifting up behind the headline. Pure CSS motion, cheap on phones. */
function Sparks() {
  const sparks = [
    { l: "18%", d: 0, s: 3, t: 5.5 },
    { l: "30%", d: 1.8, s: 2, t: 6.5 },
    { l: "47%", d: 0.6, s: 4, t: 5 },
    { l: "62%", d: 2.6, s: 2, t: 7 },
    { l: "74%", d: 1.2, s: 3, t: 6 },
    { l: "86%", d: 3.1, s: 2, t: 6.8 },
  ];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-72 overflow-hidden" aria-hidden>
      {sparks.map((s, i) => (
        <motion.span
          key={i}
          className="absolute bottom-0 rounded-full bg-ember-300 shadow-[0_0_8px_2px_rgba(255,122,31,0.8)]"
          style={{ left: s.l, width: s.s, height: s.s }}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: -260, opacity: [0, 1, 0.8, 0] }}
          transition={{ duration: s.t, delay: s.d, repeat: Infinity, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ icons */

function PerkIcon({ id }: { id: Perk }) {
  const c = "h-[18px] w-[18px]";
  const svg = (children: React.ReactNode) => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
  switch (id) {
    case "ads":
      return svg(
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m6 6 12 12" />
        </>,
      );
    case "lessons":
      return svg(
        <>
          <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z" />
          <path d="M12 6.5v13" />
        </>,
      );
    case "counting":
      return <IconPlay className={c} />;
    case "bots":
      return svg(
        <>
          <path d="M4 17.5h16l-1.5-9-4.5 4L12 6l-2 6.5-4.5-4Z" />
          <path d="M4.5 20.5h15" />
        </>,
      );
    case "review":
      return <IconReview className={c} />;
    case "chips":
      return svg(
        <>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
        </>,
      );
    case "designs":
      return <IconSpade className={c} />;
  }
}
