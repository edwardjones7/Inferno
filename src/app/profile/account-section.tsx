"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { IconChevron, IconFriends } from "@/components/icons";
import { SignInCard } from "@/components/online/sign-in";
import { SectionTitle } from "@/components/ui";
import { deleteAccount, signOut, useAccount } from "@/lib/online/account";
import { errorText } from "@/lib/online/client";
import { backupNow, fetchBackup, restoreBackup, useSyncState } from "@/lib/online/sync";

const when = (ms: number) => new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Profile: sign in, backups, and account deletion. */
export function AccountSection() {
  const account = useAccount();
  const sync = useSyncState();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"restore" | "delete" | null>(null);

  if (account.status === "loading") return null;
  if (account.status === "signed-out") {
    return (
      <section className="mt-8">
        <SectionTitle title="Account" />
        <SignInCard title="Back up your progress" />
      </section>
    );
  }

  const run = async (what: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(what);
    try {
      await fn();
      toast.success(done);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  const restore = () =>
    run(
      "restore",
      async () => {
        const b = await fetchBackup();
        if (!b) throw new Error("There's no backup on this account yet");
        if (!restoreBackup(b)) throw new Error("That backup couldn't be read");
      },
      "Progress restored",
    );

  return (
    <section className="mt-8">
      <SectionTitle title="Account" />
      <div className="panel divide-y divide-ash-800 rounded-3xl">
        <Row title="Signed in" sub={account.email ?? "Your account"}>
          <button disabled={!!busy} onClick={() => void run("out", signOut, "Signed out")} className="btn-ash h-10 rounded-xl px-3 text-xs font-bold">
            Sign out
          </button>
        </Row>
        <Link href="/friends/" className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-ash-850/50 sm:px-5">
          <span className="flex min-w-0 items-center gap-3">
            <IconFriends className="h-5 w-5 shrink-0 text-ember-300" />
            <span className="min-w-0">
              <span className="block text-sm font-bold">Friends and league</span>
              <span className="block text-xs text-ash-400">Your friend code, duels, live tables</span>
            </span>
          </span>
          <IconChevron className="h-4 w-4 text-ash-500" />
        </Link>
        <Row title="Cloud backup" sub={sync.lastBackup ? `Last backup ${when(sync.lastBackup)}. It updates on its own.` : "Backs up on its own while you play."}>
          <button disabled={!!busy} onClick={() => void run("backup", backupNow, "Backed up")} className="btn-ash h-10 rounded-xl px-3 text-xs font-bold">
            {busy === "backup" ? "…" : "Back up now"}
          </button>
        </Row>
        <Row title="Restore from backup" sub="Replaces the progress on this device with your account's copy.">
          {confirm === "restore" ? (
            <Confirm onCancel={() => setConfirm(null)} onGo={() => void restore()} label="Restore" busy={busy === "restore"} />
          ) : (
            <button onClick={() => setConfirm("restore")} className="btn-ash h-10 rounded-xl px-3 text-xs font-bold">
              Restore…
            </button>
          )}
        </Row>
        <Row title="Delete account" sub="Removes your account, backup, friends and league history. Progress on this device stays.">
          {confirm === "delete" ? (
            <Confirm onCancel={() => setConfirm(null)} onGo={() => void run("delete", deleteAccount, "Account deleted")} label="Delete" busy={busy === "delete"} />
          ) : (
            <button onClick={() => setConfirm("delete")} className="btn-ash h-10 rounded-xl px-3 text-xs font-bold">
              Delete…
            </button>
          )}
        </Row>
      </div>
    </section>
  );
}

function Confirm({ onCancel, onGo, label, busy }: { onCancel: () => void; onGo: () => void; label: string; busy: boolean }) {
  return (
    <div className="flex shrink-0 gap-2">
      <button onClick={onCancel} className="btn-ash h-10 rounded-xl px-3 text-xs font-bold">
        Cancel
      </button>
      <button disabled={busy} onClick={onGo} className="h-10 rounded-xl bg-ember-700 px-3 text-xs font-bold text-bone ring-1 ring-ember-400 disabled:opacity-60">
        {busy ? "…" : label}
      </button>
    </div>
  );
}

function Row({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs text-ash-400">{sub}</p>
      </div>
      {children}
    </div>
  );
}
