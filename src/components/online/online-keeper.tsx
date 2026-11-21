"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { IconCloud } from "@/components/icons";
import { errorText } from "@/lib/online/client";
import { keepThisDevice, restoreBackup, useCloudSync, useSyncState } from "@/lib/online/sync";
import { activityOf, useProgress } from "@/lib/store";

const when = (ms: number) => new Date(ms).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

/**
 * Mounted once in the layout. Keeps the account in step with the device, and when a backup
 * and this device both hold real progress (first sign-in on a second phone), asks which one
 * to keep. Nothing is overwritten without that answer.
 */
export function OnlineKeeper() {
  useCloudSync();
  const sync = useSyncState();
  const p = useProgress();
  const [busy, setBusy] = useState(false);
  const c = sync.choice;

  const pick = async (which: "cloud" | "device") => {
    if (!c) return;
    setBusy(true);
    try {
      if (which === "cloud") {
        if (!restoreBackup(c)) throw new Error("That backup couldn't be read");
        toast.success("Progress restored from your account");
      } else {
        await keepThisDevice();
        toast.success("Kept this device's progress", { description: "Your account backup now matches it." });
      }
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {c && (
        <motion.div
          className="fixed inset-0 z-[60] grid place-items-end bg-black/60 backdrop-blur-sm sm:place-items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="backup-title"
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            className="w-full max-w-md rounded-t-3xl border border-brass-500/45 bg-ash-950 p-5 pb-[calc(20px+env(safe-area-inset-bottom))] sm:rounded-3xl sm:pb-5"
          >
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ember-500/12 text-ember-300 ring-1 ring-ember-500/40">
              <IconCloud className="h-5 w-5" />
            </span>
            <h2 id="backup-title" className="mt-3 font-display text-lg font-bold text-bone">
              Which progress do you want?
            </h2>
            <p className="mt-1 text-sm text-ash-400">Your account and this device both have progress. The one you pick replaces the other.</p>
            <div className="mt-4 grid gap-2">
              <button disabled={busy} onClick={() => void pick("cloud")} className="panel pressable rounded-2xl p-3.5 text-left disabled:opacity-60">
                <span className="block text-sm font-bold text-bone">Your account</span>
                <span className="block text-xs text-ash-400">
                  {c.activity.toLocaleString()} answers and hands · backed up {when(c.updatedAt)}
                  {c.device ? ` from ${c.device === "web" ? "the web" : c.device}` : ""}
                </span>
              </button>
              <button disabled={busy} onClick={() => void pick("device")} className="panel pressable rounded-2xl p-3.5 text-left disabled:opacity-60">
                <span className="block text-sm font-bold text-bone">This device</span>
                <span className="block text-xs text-ash-400">{activityOf(p).toLocaleString()} answers and hands</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
