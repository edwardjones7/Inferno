"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PlayingCard } from "@/components/playing-card";
import { IconStep } from "@/components/icons";
import type { Card } from "@/lib/blackjack/cards";
import { choiceLabel, type Decision } from "@/lib/blackjack/coach";
import type { BjPublic, PokerPublic } from "@/lib/online/live";
import { tableHands, type HandRecord, type LiveTable } from "@/lib/online/tables-client";
import type { HandEvent, Winner } from "@/lib/poker/game-types";

interface PokerRec {
  game: "poker";
  board: Card[];
  bb: number;
  log: HandEvent[];
  winners: Winner[];
  players: { seat: number; user: string; name: string; hole: Card[]; net: number }[];
}

interface BjRec {
  game: "blackjack";
  dealer: Card[];
  players: { user: string; name: string; hands: { cards: Card[]; result?: string }[]; net: number; notes: Decision[] }[];
}

/**
 * After the table closes: final standings, then every hand with all cards face up, so the
 * table can go over the big spots together.
 */
export function TableReview({ table, me }: { table: LiveTable; me: string }) {
  const [hands, setHands] = useState<HandRecord[] | null>(null);
  const [i, setI] = useState(0);

  useEffect(() => {
    tableHands(table.id)
      .then((h) => {
        setHands(h);
        setI(Math.max(0, h.length - 1));
      })
      .catch(() => setHands([]));
  }, [table.id]);

  const standings =
    table.public?.kind === "poker"
      ? (table.public as PokerPublic).seats.map((s) => ({ user: s.user, name: s.name, chips: s.stack })).sort((a, b) => b.chips - a.chips)
      : ((table.public as BjPublic | null)?.players ?? []).map((p) => ({ user: p.user, name: p.name, chips: p.stack })).sort((a, b) => b.chips - a.chips);

  const h = hands?.[i];

  return (
    <div className="h-full overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <div className="mx-auto max-w-xl">
        <section className="panel rounded-3xl p-5">
          <p className="eyebrow">Table closed</p>
          <p className="mt-1 font-display text-xl font-bold text-bone">{standings[0]?.user === me ? "You finished on top" : `${standings[0]?.name ?? "Someone"} finished on top`}</p>
          <ol className="mt-3 grid gap-1">
            {standings.map((s, k) => (
              <li key={s.user} className={`flex items-center gap-3 rounded-xl px-2.5 py-1.5 text-sm ${s.user === me ? "bg-ember-500/12 ring-1 ring-ember-500/40" : ""}`}>
                <span className="tabular w-5 text-xs font-bold text-ash-500">{k + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{s.user === me ? "You" : s.name}</span>
                <span className="tabular text-xs font-bold text-ash-300">{s.chips.toLocaleString()}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] text-ash-500">Table chips only: your chip balance is untouched.</p>
        </section>

        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-display text-base font-bold">Review together</p>
            {hands && hands.length > 0 && (
              <div className="flex items-center gap-1">
                <button aria-label="Previous hand" disabled={i === 0} onClick={() => setI(i - 1)} className="btn-ash grid h-9 w-9 place-items-center rounded-xl disabled:opacity-40">
                  <IconStep dir="prev" className="h-4 w-4" />
                </button>
                <span className="tabular w-20 text-center text-xs font-bold text-ash-300">
                  {i + 1} / {hands.length}
                </span>
                <button aria-label="Next hand" disabled={i >= hands.length - 1} onClick={() => setI(i + 1)} className="btn-ash grid h-9 w-9 place-items-center rounded-xl disabled:opacity-40">
                  <IconStep dir="next" className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
          {!hands ? (
            <div className="h-40 animate-pulse rounded-3xl bg-ash-900" />
          ) : !h ? (
            <p className="panel rounded-3xl p-5 text-sm text-ash-400">No hands were finished at this table.</p>
          ) : h.record.game === "poker" ? (
            <PokerHand r={h.record as unknown as PokerRec} no={h.hand_no} me={me} />
          ) : (
            <BjRound r={h.record as unknown as BjRec} no={h.hand_no} me={me} />
          )}
        </section>

        <Link href="/play/friends/" className="btn-fire mt-6 flex h-11 items-center justify-center rounded-xl text-sm font-bold">
          Open another table
        </Link>
      </div>
    </div>
  );
}

const net = (n: number) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());

function PokerHand({ r, no, me }: { r: PokerRec; no: number; me: string }) {
  return (
    <div className="panel rounded-3xl p-4">
      <p className="text-xs font-bold text-ash-400">Hand #{no}</p>
      <div className="mt-2 flex min-h-[46px] gap-1">
        {r.board.map((c) => (
          <PlayingCard key={c} card={c} small />
        ))}
        {!r.board.length && <span className="self-center text-xs text-ash-500">No flop</span>}
      </div>
      <ul className="mt-3 grid gap-1.5">
        {r.players.map((p) => (
          <li key={p.user} className="flex items-center gap-2">
            <div className="flex gap-0.5">
              {p.hole.map((c) => (
                <PlayingCard key={c} card={c} small />
              ))}
            </div>
            <span className={`min-w-0 flex-1 truncate text-sm ${p.user === me ? "font-bold text-bone" : "text-ash-200"}`}>{p.user === me ? "You" : p.name}</span>
            <span className={`tabular text-xs font-bold ${p.net > 0 ? "text-emerald-300" : p.net < 0 ? "text-ember-300" : "text-ash-400"}`}>{net(p.net)}</span>
          </li>
        ))}
      </ul>
      <ol className="mt-3 grid gap-0.5 border-t border-ash-800 pt-3 text-xs text-ash-300">
        {r.log
          .filter((l) => l.kind !== "deal")
          .map((l, k) => (
            <li key={k} className={l.kind === "board" ? "mt-1 font-bold text-brass-300" : l.kind === "win" ? "font-bold text-emerald-200" : ""}>
              {l.text}
            </li>
          ))}
      </ol>
    </div>
  );
}

function BjRound({ r, no, me }: { r: BjRec; no: number; me: string }) {
  return (
    <div className="panel rounded-3xl p-4">
      <p className="text-xs font-bold text-ash-400">Round #{no}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-14 text-xs text-ash-500">Dealer</span>
        <div className="flex gap-0.5">
          {r.dealer.map((c, k) => (
            <PlayingCard key={k} card={c} small />
          ))}
        </div>
      </div>
      <ul className="mt-3 grid gap-3">
        {r.players.map((p) => (
          <li key={p.user}>
            <div className="flex items-center gap-2">
              <span className={`w-14 truncate text-xs ${p.user === me ? "font-bold text-bone" : "text-ash-300"}`}>{p.user === me ? "You" : p.name}</span>
              <div className="flex flex-wrap gap-2">
                {p.hands.map((h, k) => (
                  <div key={k} className="flex items-center gap-1">
                    <div className="flex gap-0.5">
                      {h.cards.map((c, j) => (
                        <PlayingCard key={j} card={c} small />
                      ))}
                    </div>
                    <span className="text-[10px] font-semibold text-ash-400">{h.result}</span>
                  </div>
                ))}
              </div>
              <span className={`tabular ml-auto text-xs font-bold ${p.net > 0 ? "text-emerald-300" : p.net < 0 ? "text-ember-300" : "text-ash-400"}`}>{net(p.net)}</span>
            </div>
            {p.notes.filter((n) => !n.ok).map((n, k) => (
              <p key={k} className="ml-16 mt-1 text-[11px] text-ember-200">
                {n.label}: book says {choiceLabel(n.correct).toLowerCase()}, played {choiceLabel(n.chosen).toLowerCase()}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
