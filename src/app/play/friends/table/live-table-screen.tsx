"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { IconBack, IconCopy } from "@/components/icons";
import { SignInCard } from "@/components/online/sign-in";
import { useAccount } from "@/lib/online/account";
import type { BjPublic, PokerPublic } from "@/lib/online/live";
import { leaveTable, startTable, useLiveTable, type LiveSeat, type LiveTable } from "@/lib/online/tables-client";
import { BlackjackLive } from "./blackjack-live";
import { PokerLive } from "./poker-live";
import { TableReview } from "./table-review";

/** One private table: lobby, play, then the results and the joint review. */
export function LiveTableScreen() {
  const id = useSearchParams().get("id");
  const account = useAccount();
  const me = account.userId;
  const { table, seats, priv, error, loaded } = useLiveTable(id, me);
  const router = useRouter();

  const leave = async () => {
    if (id && table && table.status !== "closed") await leaveTable(id).catch(() => {});
    router.push("/play/friends/");
  };

  if (account.status === "signed-out") {
    return (
      <Shell onBack={() => router.push("/play/friends/")}>
        <div className="mx-auto mt-10 max-w-md px-4">
          <SignInCard title="Sign in to take your seat" />
        </div>
      </Shell>
    );
  }

  if (!loaded || !me) {
    return (
      <Shell onBack={() => router.push("/play/friends/")}>
        <div className="grid h-full place-items-center text-sm text-ash-400">Pulling up a chair…</div>
      </Shell>
    );
  }

  if (!table) {
    return (
      <Shell onBack={() => router.push("/play/friends/")}>
        <div className="grid h-full place-items-center px-6 text-center">
          <div>
            <p className="font-display text-lg font-bold">{error ?? "This table isn't open to you"}</p>
            <Link href="/play/friends/" className="btn-fire mt-4 inline-flex h-10 items-center rounded-xl px-4 text-sm font-bold">
              Back to friend tables
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  const title = `${table.game === "poker" ? "Hold'em" : "Blackjack"} · ${table.code}`;

  return (
    <Shell onBack={() => void leave()} title={title} backLabel={table.status === "playing" ? "Leave" : "Back"}>
      {table.status === "lobby" ? (
        <Lobby table={table} seats={seats} me={me} />
      ) : table.status === "closed" && !table.public ? (
        <div className="grid h-full place-items-center text-sm text-ash-400">The host closed this table.</div>
      ) : table.public?.kind === "poker" ? (
        table.status === "closed" ? (
          <TableReview table={table} me={me} />
        ) : (
          <PokerLive id={table.id} pub={table.public as PokerPublic} priv={priv} me={me} />
        )
      ) : table.status === "closed" ? (
        <TableReview table={table} me={me} />
      ) : (
        <BlackjackLive id={table.id} pub={table.public as BjPublic} priv={priv} me={me} />
      )}
    </Shell>
  );
}

function Shell({ children, onBack, title, backLabel = "Back" }: { children: React.ReactNode; onBack: () => void; title?: string; backLabel?: string }) {
  return (
    <div className="felt relative flex h-dvh flex-col overflow-hidden">
      <header className="relative z-20 flex items-center gap-3 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+10px)]">
        <button onClick={onBack} className="btn-ash flex h-9 items-center gap-1 rounded-xl px-2.5 text-xs font-bold">
          <IconBack className="h-4 w-4" /> {backLabel}
        </button>
        {title && <p className="tabular min-w-0 flex-1 truncate text-center font-display text-sm font-bold text-bone/90">{title}</p>}
        <span className="w-16" />
      </header>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}

function Lobby({ table, seats, me }: { table: LiveTable; seats: LiveSeat[]; me: string }) {
  const host = table.host === me;
  const [busy, setBusy] = useState(false);
  const need = table.game === "poker" ? 2 : 1;
  const max = table.game === "poker" ? 6 : 5;
  const present = seats.filter((s) => !s.left_at);

  const start = async () => {
    setBusy(true);
    try {
      await startTable(table.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const text = `Sit down with me on Inferno. Table code: ${table.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "Inferno", text });
      else {
        await navigator.clipboard.writeText(table.code);
        toast.success("Code copied");
      }
    } catch {}
  };

  const s = table.settings as { bb?: number; stack?: number; table?: string; bet?: number };

  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center gap-5 px-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
      <div className="text-center">
        <p className="eyebrow">Table code</p>
        <button onClick={() => void share()} className="mt-1 inline-flex items-center gap-2 font-mono text-4xl font-bold tracking-[0.3em] text-bone">
          {table.code}
          <IconCopy className="h-5 w-5 text-ash-400" />
        </button>
        <p className="mt-1 text-xs text-ash-300">
          {table.game === "poker"
            ? `Blinds ${s.bb ? s.bb / 2 : 50}/${s.bb ?? 100} · ${(s.stack ?? 10_000).toLocaleString()} table chips each`
            : `${s.bet ?? 25} a hand · ${(s.stack ?? 1_000).toLocaleString()} table chips each`}
        </p>
      </div>

      <ul className="panel divide-y divide-ash-800 rounded-3xl">
        {Array.from({ length: max }, (_, i) => {
          const seat = present.find((x) => x.seat === i);
          return (
            <li key={i} className="flex items-center gap-3 px-4 py-2.5">
              <span className="tabular w-5 text-xs font-bold text-ash-500">{i + 1}</span>
              {seat ? (
                <span className="min-w-0 flex-1 truncate font-bold text-bone">
                  {seat.name}
                  {seat.user_id === table.host && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-brass-300">Host</span>}
                  {seat.user_id === me && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-ember-300">You</span>}
                </span>
              ) : (
                <span className="flex-1 text-sm text-ash-600">Empty seat</span>
              )}
            </li>
          );
        })}
      </ul>

      {host ? (
        <button disabled={busy || present.length < need} onClick={() => void start()} className="btn-fire h-12 rounded-xl text-sm font-bold disabled:opacity-50">
          {present.length < need ? "Waiting for a friend to sit down…" : busy ? "Dealing…" : `Deal · ${present.length} player${present.length === 1 ? "" : "s"}`}
        </button>
      ) : (
        <p className="text-center text-sm text-ash-300">Waiting for the host to deal…</p>
      )}
      <p className="text-center text-[11px] text-ash-500">Table chips only. Nothing here touches your chip balance.</p>
    </div>
  );
}
