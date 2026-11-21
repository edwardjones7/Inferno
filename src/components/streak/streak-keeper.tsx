"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { EmberBurst } from "@/components/ember-burst";
import { ChipDot } from "@/components/earn";
import { formatChips } from "@/lib/chips";
import { haptic } from "@/lib/haptics";
import { useIsPro } from "@/lib/pro";
import { reminderPermission, remindersSupported, requestReminderPermission, syncReminders } from "@/lib/reminders";
import { play } from "@/lib/sound";
import type { Celebration } from "@/lib/streak";
import { grantProFreeze, setReminder, shiftCelebration } from "@/lib/streak-actions";
import { useHydrated, useProgress } from "@/lib/store";
import { IconFreeze } from "@/components/icons";
import { StreakFlame } from "./streak-flame";

/** Screens where a celebration would get in the way of a hand; it waits until you leave. */
const BUSY = ["/play/poker/match", "/play/poker/table", "/play/blackjack", "/play/friends/table"];

/**
 * Mounted once in the layout. Shows streak celebrations as they're queued (goal met,
 * milestones, freezes, repairs), keeps the reminder notifications in step with the streak,
 * and hands Pro members their monthly freeze.
 */
export function StreakKeeper() {
  const p = useProgress();
  const hydrated = useHydrated();
  const pro = useIsPro();
  const path = usePathname() ?? "/";
  const [shown, setShown] = useState<Celebration | null>(null);
  const [askReminder, setAskReminder] = useState(false);
  const busy = BUSY.some((b) => path.startsWith(b));
  const pending = p.streak.pending.length;

  useEffect(() => {
    if (hydrated && pro) grantProFreeze();
  }, [hydrated, pro]);

  // reschedule reminders whenever the streak or the reminder settings change
  const s = p.streak;
  const sig = `${s.met.at(-1)}|${s.covered.at(-1)}|${s.reminder.on}|${s.reminder.hour}`;
  useEffect(() => {
    if (hydrated) void syncReminders(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sig` captures what matters in `s`
  }, [hydrated, sig]);

  useEffect(() => {
    if (!hydrated || busy || shown || !pending) return;
    const t = setTimeout(() => {
      const c = shiftCelebration();
      if (!c) return;
      setShown(c);
      if (c.kind === "milestone" || c.kind === "goal") {
        play("win");
        haptic("success");
      }
      if (c.kind === "goal" && remindersSupported() && s.reminder.on) {
        void reminderPermission().then((perm) => setAskReminder(perm === "prompt"));
      } else setAskReminder(false);
    }, 600);
    return () => clearTimeout(t);
  }, [hydrated, busy, shown, pending, s.reminder.on]);

  // small news dismisses itself; milestones wait for a tap
  useEffect(() => {
    if (!shown || shown.kind === "milestone" || askReminder) return;
    const t = setTimeout(() => setShown(null), 4200);
    return () => clearTimeout(t);
  }, [shown, askReminder]);

  const close = () => setShown(null);

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={JSON.stringify(shown)}
          className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-50 flex justify-center px-4 lg:bottom-8"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        >
          <div
            role="status"
            className="pointer-events-auto relative w-full max-w-sm overflow-visible rounded-3xl border border-brass-500/45 bg-ash-950/95 p-4 shadow-[0_18px_60px_-12px_rgba(0,0,0,0.9),0_0_40px_-12px_rgba(255,90,31,0.5)] backdrop-blur-xl"
          >
            {shown.kind === "milestone" && (
              <div className="pointer-events-none absolute left-1/2 top-6">
                <EmberBurst count={42} intensity={1.1} seed={shown.days} />
              </div>
            )}
            <Body c={shown} />
            <div className="mt-3 flex justify-end gap-2">
              {askReminder && (
                <button
                  onClick={async () => {
                    const ok = await requestReminderPermission();
                    setReminder({ on: ok });
                    setAskReminder(false);
                    close();
                  }}
                  className="btn-fire rounded-xl px-3.5 py-2 text-xs font-bold"
                >
                  Remind me tomorrow
                </button>
              )}
              <button onClick={close} className="btn-ash rounded-xl px-3.5 py-2 text-xs font-bold">
                {shown.kind === "milestone" ? "Collect" : askReminder ? "Not now" : "Nice"}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Body({ c }: { c: Celebration }) {
  switch (c.kind) {
    case "goal":
      return (
        <Row icon={<StreakFlame streak={c.streak} size={48} />} eyebrow="Daily goal met" title={c.streak === 1 ? "Streak lit: day 1" : `Day ${c.streak}`}>
          {c.streak === 1 ? "Hit the goal tomorrow and it keeps burning." : "The streak lives another day."}
        </Row>
      );
    case "milestone":
      return (
        <Row icon={<StreakFlame streak={c.days} size={56} />} eyebrow={`${c.days}-day streak`} title={c.title}>
          <span className="tabular inline-flex items-center gap-1 font-bold text-ember-200">
            <ChipDot className="h-3.5 w-3.5" />+{formatChips(c.chips)} chips
          </span>
        </Row>
      );
    case "freeze-earned":
      return (
        <Row icon={<IconFreeze className="h-9 w-9 text-sky-200" />} eyebrow={`${c.streak} days`} title="You earned a freeze">
          It covers a missed day automatically.
        </Row>
      );
    case "frozen":
      return (
        <Row icon={<IconFreeze className="h-9 w-9 text-sky-200" />} eyebrow="Streak saved" title={c.days.length === 1 ? "A freeze covered yesterday" : `Freezes covered ${c.days.length} days`}>
          Your streak is intact. Hit today&apos;s goal to keep it going.
        </Row>
      );
    case "repaired":
      return (
        <Row icon={<StreakFlame streak={c.streak} size={48} />} eyebrow="Streak repaired" title={`Back to ${c.streak} days`}>
          Don&apos;t let it go out again.
        </Row>
      );
  }
}

function Row({ icon, eyebrow, title, children }: { icon: React.ReactNode; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-ember-500/10 ring-1 ring-ember-500/35">{icon}</span>
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <p className="mt-0.5 font-display text-base font-bold text-bone">{title}</p>
        <p className="text-xs text-ash-300">{children}</p>
      </div>
    </div>
  );
}
