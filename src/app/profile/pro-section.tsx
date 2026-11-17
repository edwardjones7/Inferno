"use client";

import { toast } from "sonner";
import { FlameMark } from "@/components/logo";
import { Switch } from "@/components/ui";
import { FREE_LESSONS_PER_TRACK, FREE_REVIEW_HANDS, paywallReason } from "@/lib/gates";
import { openPaywall, PRO_NAME, useProState } from "@/lib/pro";
import { openSubscriptionManagement, restorePurchases, setDevPro, usePurchases } from "@/lib/purchases";
import { play } from "@/lib/sound";

const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { dateStyle: "medium" });

function planName(productId: string | null): string | null {
  if (!productId) return null;
  if (/year|annual/i.test(productId)) return "Yearly";
  if (/month/i.test(productId)) return "Monthly";
  return null;
}

async function restore() {
  play("click");
  const r = await restorePurchases();
  if (r === "restored") toast.success(`${PRO_NAME} restored`);
  else if (r === "nothing") toast("No active subscription found for this store account.");
  else if (r === "unavailable") toast("Restore works in the iOS and Android app.");
  else toast.error("Couldn't reach the store. Try again in a moment.");
}

/** Membership on the profile: status and store controls for members, one upgrade card for everyone else. */
export function ProSection() {
  const pro = useProState();
  const store = usePurchases();
  const native = store.store !== "none";

  if (pro.active) {
    const plan = planName(pro.productId);
    const when = pro.expiresAt
      ? `${pro.willRenew === false ? "Ends" : pro.trial ? "Trial ends" : "Renews"} ${day(pro.expiresAt)}`
      : pro.dev
        ? "Development override"
        : null;
    return (
      <section className="mt-8">
        <div className="panel relative overflow-hidden rounded-3xl p-5 ring-1 ring-ember-500/30 sm:p-6">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(closest-side,rgba(255,90,31,0.3),transparent)]" />
          <div className="relative flex flex-wrap items-center gap-4">
            <FlameMark className="h-12 w-12 shrink-0 animate-flicker drop-shadow-[0_0_14px_rgba(255,90,31,0.7)]" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2">
                <span className="font-display text-lg font-black molten-text">{PRO_NAME}</span>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/30">
                  {pro.trial ? "Free trial" : "Active"}
                </span>
              </p>
              <p className="tabular mt-0.5 text-xs text-ash-400">{[plan, when].filter(Boolean).join(" · ") || "Every lesson, bot and hand is open."}</p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              {native && !pro.dev && (
                <button
                  onClick={() => {
                    play("click");
                    openSubscriptionManagement();
                  }}
                  className="btn-ash h-10 flex-1 rounded-xl px-3 text-xs font-bold sm:flex-none"
                >
                  Manage subscription
                </button>
              )}
              {native && (
                <button onClick={restore} disabled={!!store.busy} className="btn-ash h-10 flex-1 rounded-xl px-3 text-xs font-bold sm:flex-none">
                  {store.busy === "restore" ? "Restoring…" : "Restore purchases"}
                </button>
              )}
            </div>
          </div>
          {!native && !pro.dev && <p className="relative mt-3 text-[11px] text-ash-500">Manage or cancel in the app store where you subscribed.</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <div className="panel relative overflow-hidden rounded-3xl p-5 sm:p-6">
        <div className="pointer-events-none absolute -bottom-24 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,rgba(255,90,31,0.22),transparent)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <FlameMark className="h-12 w-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-ember-400">{PRO_NAME}</p>
            <h2 className="mt-0.5 font-display text-lg font-black leading-tight">Go past the free tier</h2>
            <p className="mt-1 text-xs leading-relaxed text-ash-400">
              Every lesson after the first {FREE_LESSONS_PER_TRACK}, the card counting course, the Advanced and Master bots, your whole hand history (not
              just the last {FREE_REVIEW_HANDS}), and no ads.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5">
            <button
              onClick={() => {
                play("click");
                openPaywall(paywallReason.profile);
              }}
              className="btn-fire h-11 rounded-xl px-5 text-sm font-bold"
            >
              See plans
            </button>
            {native && (
              <button onClick={restore} disabled={!!store.busy} className="h-8 text-[11px] font-semibold text-ash-400 hover:text-bone">
                {store.busy === "restore" ? "Restoring…" : "Restore purchases"}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Settings row for testing gated screens without a store. Development builds only:
 * Next inlines NODE_ENV, so the check below is literal and production bundles drop the row.
 */
export function DevProToggle() {
  const pro = useProState();
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-bold">
          Pro override
          <span className="rounded bg-ash-800 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-ash-400">dev only</span>
        </p>
        <p className="text-xs text-ash-400">Turns {PRO_NAME} on without a store. Hidden in production builds.</p>
      </div>
      <Switch label="Pro override" on={!!pro.dev && pro.active} onChange={setDevPro} />
    </div>
  );
}
