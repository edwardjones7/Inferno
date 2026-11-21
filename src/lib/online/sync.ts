"use client";

/**
 * Keeping the account in step with the device. The device stays the source of truth (the app
 * is offline-first); the server gets:
 *
 * - a full backup of the progress document, so a new phone can restore it,
 * - the profile friends see (name, streak, ratings),
 * - one `day_stats` row per day (XP, goal met, daily puzzle answers) for friend streaks,
 *   puzzle duels and leagues.
 *
 * Writes are debounced and silently retried later when offline.
 */
import { Capacitor } from "@capacitor/core";
import { useEffect, useSyncExternalStore } from "react";
import { getProgress, activityOf, onProgressChange, replaceProgress, type Progress } from "../store";
import { addDays, dayKey } from "../economy";
import { dayXp, streakLength } from "../streak";
import { currentAccount, useAccount } from "./account";
import { supabase } from "./client";
import { chooseBackup } from "./social-rules";

const STATS_DEBOUNCE = 8_000;
const BACKUP_EVERY = 5 * 60_000;

/* ------------------------------------------------------------------ pushes */

export async function pushStats(p: Progress = getProgress(), now = new Date()): Promise<void> {
  const uid = currentAccount().userId;
  if (!uid) return;
  const sb = supabase();
  const days = [dayKey(addDays(now, -1)), dayKey(now)];
  const rows = days.map((day) => ({
    user_id: uid,
    day,
    xp: Math.min(2000, dayXp(p.streak, day)),
    goal_met: p.streak.met.includes(day) || p.streak.covered.includes(day),
    puzzles: p.daily[day] ?? null,
    updated_at: new Date().toISOString(),
  }));
  const ratings = Object.fromEntries(Object.entries(p.ratings).map(([k, r]) => [k, r.r]));
  const [a, b] = await Promise.all([
    sb.from("day_stats").upsert(rows),
    sb
      .from("profiles")
      .update({ name: p.name.slice(0, 24) || "Player", streak: streakLength(p.streak, now), best_streak: p.streak.best, ratings, updated_at: new Date().toISOString() })
      .eq("id", uid),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
}

export async function backupNow(): Promise<number> {
  const uid = currentAccount().userId;
  if (!uid) throw new Error("Sign in to back up");
  const at = new Date().toISOString();
  const { error } = await supabase()
    .from("progress_backups")
    .upsert({ user_id: uid, doc: getProgress(), device: Capacitor.getPlatform(), updated_at: at });
  if (error) throw error;
  setSync({ lastBackup: Date.parse(at) });
  return Date.parse(at);
}

export interface CloudBackup {
  doc: Progress;
  updatedAt: number;
  device: string | null;
  activity: number;
}

export async function fetchBackup(): Promise<CloudBackup | null> {
  const uid = currentAccount().userId;
  if (!uid) return null;
  const { data, error } = await supabase().from("progress_backups").select("doc, updated_at, device").eq("user_id", uid).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const doc = data.doc as Progress;
  return { doc, updatedAt: Date.parse(data.updated_at), device: data.device, activity: activityOf(doc) };
}

/** Replace this device's progress with the backup. */
export function restoreBackup(b: CloudBackup): boolean {
  const ok = replaceProgress(b.doc);
  if (ok) setSync({ choice: null, lastBackup: b.updatedAt });
  return ok;
}

/* ------------------------------------------------------------------ sync state for the UI */

export interface SyncState {
  /** a backup and this device both have progress: the player picks one */
  choice: CloudBackup | null;
  lastBackup: number | null;
  error: string | null;
}

let sync: SyncState = { choice: null, lastBackup: null, error: null };
const SERVER_SYNC = sync;
const syncListeners = new Set<() => void>();
function setSync(patch: Partial<SyncState>) {
  sync = { ...sync, ...patch };
  syncListeners.forEach((l) => l());
}
export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (l) => {
      syncListeners.add(l);
      return () => syncListeners.delete(l);
    },
    () => sync,
    () => SERVER_SYNC,
  );
}

/** Keep this device's progress (overwriting the backup) after a conflict. */
export async function keepThisDevice(): Promise<void> {
  setSync({ choice: null });
  await backupNow();
}

/* ------------------------------------------------------------------ the keeper */

/** Mounted once (OnlineKeeper). Reconciles on sign-in, then pushes changes as they happen. */
export function useCloudSync() {
  const account = useAccount();
  const uid = account.userId;

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    let statsTimer: ReturnType<typeof setTimeout> | null = null;
    let lastBackupAt = 0;
    let ready = false;

    const backupSoon = () => {
      if (!ready || Date.now() - lastBackupAt < BACKUP_EVERY) return;
      lastBackupAt = Date.now();
      backupNow().catch(() => (lastBackupAt = 0));
    };
    const statsSoon = () => {
      if (!ready) return;
      if (statsTimer) clearTimeout(statsTimer);
      statsTimer = setTimeout(() => {
        pushStats().catch(() => {});
        backupSoon();
      }, STATS_DEBOUNCE);
    };

    // first sign-in on this device: decide between the backup and what's here
    (async () => {
      try {
        const cloud = await fetchBackup();
        if (cancelled) return;
        const local = getProgress();
        const pick = chooseBackup({ activity: activityOf(local), updatedAt: Date.now() }, cloud && { activity: cloud.activity, updatedAt: cloud.updatedAt });
        if (pick === "download" && cloud) restoreBackup(cloud);
        else if (pick === "ask" && cloud) setSync({ choice: cloud, lastBackup: cloud.updatedAt });
        else if (pick === "upload") await backupNow();
        else if (cloud) setSync({ lastBackup: cloud.updatedAt });
        ready = pick !== "ask";
        if (ready) {
          lastBackupAt = Date.now();
          await pushStats();
        }
        setSync({ error: null });
      } catch {
        setSync({ error: "offline" });
        ready = true; // keep pushing stats when the connection comes back
      }
    })();

    const off = onProgressChange(statsSoon);
    const onHide = () => {
      if (document.visibilityState === "hidden" && ready) {
        pushStats().catch(() => {});
        lastBackupAt = 0;
        backupSoon();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    // a conflict resolved elsewhere (keep / restore) unblocks syncing
    const offChoice = (() => {
      const l = () => {
        if (!sync.choice) ready = true;
      };
      syncListeners.add(l);
      return () => syncListeners.delete(l);
    })();

    return () => {
      cancelled = true;
      if (statsTimer) clearTimeout(statsTimer);
      off();
      offChoice();
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [uid]);
}
