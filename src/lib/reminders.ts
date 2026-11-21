/**
 * The daily streak reminder: local notifications, scheduled on the device (no server, works
 * offline). Native apps only; the website never asks for notification permission.
 *
 * We never prompt out of the blue. The permission is requested only when the player turns
 * reminders on (Profile) or taps "Remind me" after meeting a goal. Until then nothing is
 * scheduled, even though reminders default to on.
 *
 * What gets scheduled: one reminder a day at the player's hour for the next few days, so it
 * still fires if they don't open the app. Today's is skipped once the goal is met (or the
 * hour has passed). Everything is rescheduled whenever the streak changes.
 */
import { Capacitor } from "@capacitor/core";
import { addDays, dayKey } from "./economy";
import { streakLength, type StreakState } from "./streak";

/** Notification ids 7100-7106 belong to the streak reminder. */
const BASE_ID = 7100;
const DAYS_AHEAD = 7;

export const remindersSupported = () => typeof window !== "undefined" && Capacitor.isNativePlatform();

const plugin = () => import("@capacitor/local-notifications").then((m) => m.LocalNotifications);

export async function reminderPermission(): Promise<"granted" | "denied" | "prompt"> {
  if (!remindersSupported()) return "denied";
  try {
    const { display } = await (await plugin()).checkPermissions();
    return display === "granted" ? "granted" : display === "denied" ? "denied" : "prompt";
  } catch {
    return "denied";
  }
}

/** Ask for permission (only call from a tap). Returns true when granted. */
export async function requestReminderPermission(): Promise<boolean> {
  if (!remindersSupported()) return false;
  try {
    const { display } = await (await plugin()).requestPermissions();
    return display === "granted";
  } catch {
    return false;
  }
}

export interface ReminderPlan {
  id: number;
  at: Date;
  title: string;
  body: string;
}

/** The reminders to schedule from `now` (pure, for tests). */
export function planReminders(s: StreakState, now = new Date()): ReminderPlan[] {
  if (!s.reminder.on) return [];
  const t = dayKey(now);
  const metToday = s.met.includes(t) || s.covered.includes(t);
  const streak = streakLength(s, now);
  const out: ReminderPlan[] = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const at = addDays(now, i);
    at.setHours(s.reminder.hour, 0, 0, 0);
    if (i === 0 && (metToday || at <= now)) continue;
    // the streak this reminder protects: today's if it's still open, else the one we'll have tomorrow
    const alive = i === 0 ? streak : i === 1 && metToday ? streak : 0;
    out.push({ id: BASE_ID + i, at, ...copy(alive, i) });
  }
  return out;
}

function copy(streak: number, i: number): { title: string; body: string } {
  if (streak >= 2) {
    return {
      title: `Your ${streak}-day streak ends at midnight`,
      body: "One lesson or five drill answers keeps it lit.",
    };
  }
  const lines = [
    { title: "The back room is open", body: "Three new puzzles today. Same for everyone." },
    { title: "Five minutes at the felt", body: "A short lesson starts a new streak." },
    { title: "Your leaks won't fix themselves", body: "Drill the spot you miss most." },
  ];
  return lines[i % lines.length];
}

let last = "";

/** Replace the scheduled reminders with the current plan. Safe to call often. */
export async function syncReminders(s: StreakState, now = new Date()): Promise<void> {
  if (!remindersSupported()) return;
  const plan = planReminders(s, now);
  const sig = JSON.stringify(plan.map((r) => [r.id, r.at.getTime(), r.title]));
  if (sig === last) return;
  try {
    if ((await reminderPermission()) !== "granted") return;
    const ln = await plugin();
    await ln.cancel({ notifications: Array.from({ length: DAYS_AHEAD }, (_, i) => ({ id: BASE_ID + i })) });
    if (plan.length) {
      await ln.schedule({
        notifications: plan.map((r) => ({ id: r.id, title: r.title, body: r.body, schedule: { at: r.at, allowWhileIdle: true } })),
      });
    }
    last = sig;
  } catch {
    // a reminder is a nicety: never let it break the app
  }
}
