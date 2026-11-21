"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { ChipDot } from "@/components/earn";
import { IconFreeze } from "@/components/icons";
import { StreakFlame } from "@/components/streak/streak-flame";
import { SectionTitle, Segmented, Switch } from "@/components/ui";
import { formatChips } from "@/lib/chips";
import { useIsPro } from "@/lib/pro";
import { remindersSupported, requestReminderPermission } from "@/lib/reminders";
import { FREEZE_PRICE, GOAL_IDS, GOALS, MILESTONES, type GoalId } from "@/lib/streak";
import { buyFreeze, setGoal, setReminder, StreakError, useStreak } from "@/lib/streak-actions";
import { useProgress } from "@/lib/store";

const noop = () => () => {};
const HOURS = [8, 12, 17, 19, 21];
const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" });

/** Profile: the daily goal, reminders, freezes and the milestone shelf. */
export function StreakSettings() {
  const p = useProgress();
  const pro = useIsPro();
  const v = useStreak(pro);
  const native = useSyncExternalStore(noop, remindersSupported, () => false);
  const r = p.streak.reminder;

  const toggleReminder = async (on: boolean) => {
    if (on && !(await requestReminderPermission())) {
      toast.error("Notifications are off for Inferno. Turn them on in your phone's settings.");
      return;
    }
    setReminder({ on });
  };

  const buy = () => {
    try {
      buyFreeze();
      toast.success("Freeze banked", { description: "It covers a missed day automatically." });
    } catch (e) {
      toast.error(e instanceof StreakError ? e.message : "Couldn't buy a freeze");
    }
  };

  return (
    <section className="mt-8">
      <SectionTitle title="Streak" />
      <div className="panel divide-y divide-ash-800 rounded-3xl">
        <div className="flex items-center gap-4 px-4 py-4 sm:px-5">
          <StreakFlame streak={v.streak} dim={v.atRisk} size={52} />
          <div className="min-w-0 flex-1">
            <p className="tabular font-display text-lg font-bold">
              {v.streak} day{v.streak === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-ash-400">
              Best: {v.best} · {v.metToday ? "today's goal is met" : `${Math.max(0, v.goal - v.todayXp)} XP to go today`}
            </p>
          </div>
        </div>

        <div className="px-4 py-4 sm:px-5">
          <p className="text-sm font-bold">Daily goal</p>
          <p className="mb-3 text-xs text-ash-400">
            {GOALS[v.goalId].xp} XP: {GOALS[v.goalId].sub.toLowerCase()}. Lessons, drills and puzzles earn XP; table play adds a little.
          </p>
          <Segmented<GoalId>
            label="Daily goal"
            value={v.goalId}
            onChange={setGoal}
            options={GOAL_IDS.map((id) => ({ id, label: GOALS[id].label }))}
          />
        </div>

        {native && (
          <div className="px-4 py-4 sm:px-5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-bold">Reminder</p>
                <p className="text-xs text-ash-400">A nudge when your goal is still open. Never after you&apos;ve hit it.</p>
              </div>
              <Switch label="Streak reminder" on={r.on} onChange={(on) => void toggleReminder(on)} />
            </div>
            {r.on && (
              <div className="mt-3">
                <Segmented<string>
                  label="Reminder time"
                  value={String(r.hour)}
                  onChange={(h) => setReminder({ hour: Number(h) })}
                  options={HOURS.map((h) => ({ id: String(h), label: hourLabel(h) }))}
                />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <IconFreeze className="h-4 w-4 text-sky-200" /> Freezes: {v.freezes}/{v.freezeCap}
            </p>
            <p className="text-xs text-ash-400">
              Each covers one missed day. Earn one every 7 days of streak{pro ? ", plus one a month with Pro" : ""}.
            </p>
          </div>
          <button
            onClick={buy}
            disabled={v.freezes >= v.freezeCap}
            className="btn-ash flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold disabled:opacity-40"
          >
            <ChipDot className="h-3 w-3" />
            {formatChips(FREEZE_PRICE)}
          </button>
        </div>

        <div className="px-4 py-4 sm:px-5">
          <p className="mb-3 text-sm font-bold">Milestones</p>
          <ol className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {MILESTONES.map((m) => {
              const got = p.streak.milestones.includes(m.days);
              return (
                <li
                  key={m.days}
                  title={`${m.title}: +${formatChips(m.chips)} chips`}
                  className={`flex flex-col items-center gap-1 rounded-xl py-2 ring-1 ${got ? "bg-ember-500/10 ring-ember-500/40" : "bg-ash-950/60 ring-ash-800"}`}
                >
                  <StreakFlame streak={got ? m.days : 0} size={26} />
                  <span className={`tabular text-[11px] font-bold ${got ? "text-ember-200" : "text-ash-500"}`}>{m.days}d</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
