"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { IconChevron, IconFriends } from "@/components/icons";
import { SignInCard } from "@/components/online/sign-in";
import { PageHeader, SectionTitle, Segmented } from "@/components/ui";
import { TABLE_IDS, TABLES, type TableId } from "@/lib/blackjack/tables";
import { useAccount } from "@/lib/online/account";
import type { Game } from "@/lib/online/live";
import { createTable, joinTable, myOpenTables, type LiveTable } from "@/lib/online/tables-client";

const STACKS = [
  { id: "40", label: "Short · 40bb" },
  { id: "100", label: "100bb" },
  { id: "200", label: "Deep · 200bb" },
];

export const tableHref = (id: string) => `/play/friends/table/?id=${id}`;

/** Open a private table or join one by code. */
export function FriendsTables() {
  const account = useAccount();
  const router = useRouter();
  const [game, setGame] = useState<Game>("poker");
  const [depth, setDepth] = useState("100");
  const [rules, setRules] = useState<TableId>("classic");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<LiveTable[]>([]);

  useEffect(() => {
    if (account.userId) myOpenTables(account.userId).then(setOpen).catch(() => {});
  }, [account.userId]);

  const create = async () => {
    setBusy(true);
    try {
      const settings = game === "poker" ? { bb: 100, stack: Number(depth) * 100 } : { table: rules, bet: 25, stack: 1_000 };
      const t = await createTable(game, settings);
      router.push(tableHref(t.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open a table");
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    try {
      const t = await joinTable(code);
      router.push(tableHref(t.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't join");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-12 pt-5 sm:px-6 lg:pt-10">
      <PageHeader eyebrow="Tables" title="Play with friends" />

      {account.status === "loading" ? (
        <div className="h-64 animate-pulse rounded-3xl bg-ash-900" />
      ) : account.status === "signed-out" ? (
        <SignInCard title="Sign in to open a private table" />
      ) : (
        <div className="grid gap-6">
          {open.length > 0 && (
            <section>
              <SectionTitle title="Your open tables" />
              <ul className="panel divide-y divide-ash-800 rounded-3xl">
                {open.map((t) => (
                  <li key={t.id}>
                    <Link href={tableHref(t.id)} className="flex items-center gap-3 px-4 py-3 hover:bg-ash-850/50">
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-bone">{t.game === "poker" ? "Hold'em" : "Blackjack"} · {t.code}</span>
                        <span className="block text-xs text-ash-400">{t.status === "lobby" ? "Waiting to start" : "In progress"}</span>
                      </span>
                      <IconChevron className="h-4 w-4 text-ash-500" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel rounded-3xl p-5">
            <p className="font-display text-lg font-bold">Open a table</p>
            <p className="mb-4 text-xs text-ash-400">You get a code to send your friends. Up to 6 at poker, 5 at blackjack.</p>
            <Segmented<Game>
              label="Game"
              value={game}
              onChange={setGame}
              options={[
                { id: "poker", label: "Hold'em" },
                { id: "blackjack", label: "Blackjack" },
              ]}
            />
            <div className="mt-4">
              {game === "poker" ? (
                <>
                  <p className="mb-2 text-xs font-bold text-ash-300">Stacks · blinds 50/100</p>
                  <Segmented<string> label="Stack depth" value={depth} onChange={setDepth} options={STACKS} />
                  <p className="mt-2 text-xs text-ash-500">Freezeout: play until one player has every chip. The coach stays quiet during hands; you review them together at the end.</p>
                </>
              ) : (
                <>
                  <p className="mb-2 text-xs font-bold text-ash-300">House rules</p>
                  <div className="grid gap-1.5">
                    {TABLE_IDS.map((id) => (
                      <button
                        key={id}
                        onClick={() => setRules(id)}
                        className={`rounded-xl px-3 py-2 text-left ring-1 ${rules === id ? "bg-ember-500/12 ring-ember-500/60" : "bg-ash-950/50 ring-ash-800 hover:ring-ash-600"}`}
                      >
                        <span className="block text-sm font-bold text-bone">{TABLES[id].name}</span>
                        <span className="block text-[11px] text-ash-400">{TABLES[id].short}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-ash-500">Everyone plays the same dealer at once, 25 a hand from 1,000. Your coach grades your decisions as you go.</p>
                </>
              )}
            </div>
            <button disabled={busy} onClick={() => void create()} className="btn-fire mt-5 h-11 w-full rounded-xl text-sm font-bold disabled:opacity-60">
              {busy ? "Opening…" : "Open the table"}
            </button>
          </section>

          <section className="panel rounded-3xl p-5">
            <p className="font-display text-lg font-bold">Join with a code</p>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void join();
              }}
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                placeholder="Table code"
                aria-label="Table code"
                className="tabular h-11 w-full rounded-xl border border-ash-700 bg-ash-950 px-3 font-mono text-[15px] font-semibold tracking-[0.3em] text-bone outline-none placeholder:tracking-normal placeholder:text-ash-600 focus:border-ember-500"
              />
              <button disabled={busy || code.length !== 6} className="btn-fire h-11 shrink-0 rounded-xl px-4 text-sm font-bold disabled:opacity-50">
                Join
              </button>
            </form>
          </section>

          <p className="flex items-start gap-2 px-1 text-xs text-ash-500">
            <IconFriends className="mt-0.5 h-4 w-4 shrink-0" />
            Friend tables use table chips. Everyone starts level, and nothing won or lost here touches your chip balance.
          </p>
        </div>
      )}
    </div>
  );
}
