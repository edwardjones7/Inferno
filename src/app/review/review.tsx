"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BotAvatar } from "@/components/bot-avatar";
import { IconCheck, IconStep, IconX } from "@/components/icons";
import { MiniCard, PlayingCardStatic } from "@/components/playing-card-static";
import { Empty, PageHeader, Segmented } from "@/components/ui";
import type { Card } from "@/lib/blackjack/cards";
import { choiceLabel } from "@/lib/blackjack/coach";
import { TABLES } from "@/lib/blackjack/tables";
import { formatChips, unitsToChips } from "@/lib/chips";
import { botById } from "@/lib/poker/roster";
import { youText } from "@/lib/poker/text";
import { play } from "@/lib/sound";
import { useHydrated, useProgress, type BjRoundRecord, type PokerHandRecord } from "@/lib/store";

type Tab = "poker" | "blackjack" | "matches";
const isTab = (v: unknown): v is Tab => v === "poker" || v === "blackjack" || v === "matches";

const when = (t: number) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function Review() {
  const sp = useSearchParams();
  const router = useRouter();
  const tabParam = sp.get("tab");
  const tab: Tab = isTab(tabParam) ? tabParam : "poker";
  const p = useProgress();
  const hydrated = useHydrated();
  const [mistakesOnly, setMistakesOnly] = useState(false);

  const setTab = (t: Tab) => router.replace(`/review/?tab=${t}`, { scroll: false });

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-5 sm:px-6 lg:pt-10">
      <PageHeader eyebrow="Review" title="Learn from every hand" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <Segmented
            label="Review"
            value={tab}
            onChange={setTab}
            options={[
              { id: "poker", label: "Poker" },
              { id: "blackjack", label: "Blackjack" },
              { id: "matches", label: "Matches" },
            ]}
          />
        </div>
        {tab !== "matches" && (
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-ash-300">
            <input type="checkbox" checked={mistakesOnly} onChange={(e) => setMistakesOnly(e.target.checked)} className="h-4 w-4 accent-ember-500" />
            Mistakes only
          </label>
        )}
      </div>

      {!hydrated ? (
        <div className="panel h-72 animate-pulse rounded-3xl" />
      ) : tab === "poker" ? (
        <PokerReview hands={p.pokerHands} mistakesOnly={mistakesOnly} />
      ) : tab === "blackjack" ? (
        <BlackjackReview rounds={p.bjRounds} mistakesOnly={mistakesOnly} />
      ) : (
        <MatchList matches={p.matches} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ poker */

function PokerReview({ hands, mistakesOnly }: { hands: PokerHandRecord[]; mistakesOnly: boolean }) {
  const list = useMemo(() => [...hands].reverse().filter((h) => !mistakesOnly || h.notes.some((n) => n.ok === false)), [hands, mistakesOnly]);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = list.find((h) => h.id === openId) ?? list[0] ?? null;

  if (!hands.length)
    return (
      <Empty>
        No poker hands yet.{" "}
        <Link href="/play/poker/" className="font-semibold text-ember-400">
          Challenge a bot →
        </Link>
      </Empty>
    );
  if (!list.length) return <Empty>No mistakes in your recent hands. Nice.</Empty>;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      {open && <Replayer key={open.id} hand={open} />}
      <ul className="panel max-h-[70dvh] divide-y divide-ash-800 overflow-y-auto rounded-3xl lg:order-first lg:max-h-[640px]">
        {list.map((h) => {
          const misses = h.notes.filter((n) => n.ok === false).length;
          const on = open?.id === h.id;
          const opp = h.mode === "match" ? botById(h.bots[0]) : null;
          return (
            <li key={h.id}>
              <button
                onClick={() => {
                  setOpenId(h.id);
                  play("click");
                  if (window.matchMedia("(max-width: 1023px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${on ? "bg-ember-500/10" : "hover:bg-ash-850"}`}
              >
                <span className="flex gap-0.5">
                  {h.hole.map((c, i) => (
                    <MiniCard key={i} card={c} />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    {opp ? <BotAvatar bot={opp} size={16} /> : null}
                    <span className="truncate text-ash-200">{opp ? `vs ${opp.name}` : "6-max table"}</span>
                  </span>
                  <span className="block text-[11px] text-ash-500">{when(h.at)}</span>
                </span>
                {misses > 0 && <span className="rounded-full bg-ember-600/20 px-2 py-0.5 text-[10px] font-bold text-ember-300">{misses} miss{misses > 1 ? "es" : ""}</span>}
                <span className={`tabular w-14 text-right text-sm font-bold ${h.net > 0 ? "text-emerald-400" : h.net < 0 ? "text-ash-500" : "text-ash-300"}`}>
                  {h.net > 0 ? "+" : ""}
                  {h.net}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Step through a recorded hand, event by event, with the coach's verdict at each decision. */
function Replayer({ hand }: { hand: PokerHandRecord }) {
  const total = hand.log.length;
  const [step, setStep] = useState(total);
  const go = (n: number) => {
    setStep(Math.max(1, Math.min(total, n)));
    play("click");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setStep((s) => Math.max(1, s - 1));
      if (e.key === "ArrowRight") setStep((s) => Math.min(total, s + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  const shownEvents = hand.log.slice(0, step);
  const boardCount = [0, 3, 4, 5][Math.min(3, shownEvents.filter((e) => e.kind === "board").length)];
  const board = hand.board.slice(0, boardCount);
  const atShowdown = shownEvents.some((e) => e.kind === "showdown");
  const notes = hand.notes.filter((n) => n.at < step);
  const last = shownEvents.at(-1);
  const opp = hand.mode === "match" ? botById(hand.bots[0]) : null;

  return (
    <div className="min-w-0">
      <div className="felt relative overflow-hidden rounded-[28px] px-4 py-5 sm:px-6">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-ash-500">
          <span>Hand #{hand.handNo}</span>
          <span>
            Blinds {hand.bb / 2}/{hand.bb}
          </span>
        </div>

        {/* opponents' shown hands */}
        <div className="mt-3 flex min-h-[64px] flex-wrap justify-center gap-4">
          {atShowdown &&
            Object.entries(hand.shown)
              .filter(([id]) => id !== "0")
              .map(([id, cards]) => (
                <div key={id} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-ash-400">{hand.names[Number(id)]}</span>
                  <span className="flex gap-1">
                    {cards.map((c, i) => (
                      <PlayingCardStatic key={i} card={c as Card} small />
                    ))}
                  </span>
                </div>
              ))}
          {!atShowdown && opp && (
            <div className="flex items-center gap-2 text-xs text-ash-400">
              <BotAvatar bot={opp} size={36} /> {opp.name}
            </div>
          )}
        </div>

        {/* board */}
        <div className="my-4 flex min-h-[62px] justify-center gap-1.5 sm:min-h-[84px]">
          {board.map((c, i) => (
            <PlayingCardStatic key={i} card={c} small />
          ))}
          {Array.from({ length: 5 - board.length }).map((_, i) => (
            <span key={`e${i}`} className="h-[62px] w-[44px] rounded-[7px] border border-dashed border-ash-700/70 sm:h-[84px] sm:w-[60px]" />
          ))}
        </div>

        {/* hero */}
        <div className="flex flex-col items-center gap-1">
          <span className="flex gap-1">
            {hand.hole.map((c, i) => (
              <PlayingCardStatic key={i} card={c} small />
            ))}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ember-300">You</span>
        </div>

        <p className="mt-4 min-h-5 text-center text-sm font-semibold text-bone" aria-live="polite">
          {last ? youText(last.text) : null}
        </p>
      </div>

      {/* transport */}
      <div className="panel mt-3 flex items-center gap-2 rounded-2xl p-2">
        <button onClick={() => go(1)} aria-label="First" className="btn-ash grid h-11 w-11 place-items-center rounded-xl">
          <IconStep dir="first" className="h-4 w-4" />
        </button>
        <button onClick={() => go(step - 1)} aria-label="Previous" className="btn-ash grid h-11 w-11 place-items-center rounded-xl">
          <IconStep dir="prev" className="h-4 w-4" />
        </button>
        <input
          type="range"
          min={1}
          max={total}
          value={step}
          onChange={(e) => setStep(Number(e.target.value))}
          aria-label="Hand progress"
          className="h-2 min-w-0 flex-1 accent-ember-500"
        />
        <button onClick={() => go(step + 1)} aria-label="Next" className="btn-fire grid h-11 w-11 place-items-center rounded-xl">
          <IconStep dir="next" className="h-4 w-4" />
        </button>
        <button onClick={() => go(total)} aria-label="Last" className="btn-ash grid h-11 w-11 place-items-center rounded-xl">
          <IconStep dir="last" className="h-4 w-4" />
        </button>
      </div>

      {/* coach */}
      <div className="mt-3 space-y-2">
        {hand.notes.length === 0 && <p className="px-1 text-xs text-ash-500">You didn&apos;t make a decision this hand.</p>}
        {notes.map((n, i) => (
          <div
            key={i}
            className={`flex gap-3 rounded-2xl px-4 py-3 text-sm ring-1 ${
              n.ok === false ? "bg-ember-500/10 ring-ember-500/40" : n.ok ? "bg-emerald-500/10 ring-emerald-500/30" : "bg-ash-900 ring-ash-700"
            }`}
          >
            <span
              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                n.ok === false ? "bg-ember-500 text-ash-950" : n.ok ? "bg-emerald-400 text-ash-950" : "bg-ash-700 text-ash-200"
              }`}
            >
              {n.ok === false ? <IconX className="h-3.5 w-3.5" /> : n.ok ? <IconCheck className="h-3.5 w-3.5" /> : <span className="text-[10px] font-black">i</span>}
            </span>
            <span className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ash-500">{n.street}</span>
              <span className="block font-bold text-bone">{n.title}</span>
              <span className="block text-ash-300">{n.detail}</span>
            </span>
          </div>
        ))}
        {hand.notes.length > notes.length && <p className="px-1 text-xs text-ash-500">Step forward to see the coach&apos;s next note.</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ blackjack */

function BlackjackReview({ rounds, mistakesOnly }: { rounds: BjRoundRecord[]; mistakesOnly: boolean }) {
  const list = useMemo(() => [...rounds].reverse().filter((r) => !mistakesOnly || r.decisions.some((d) => !d.ok)), [rounds, mistakesOnly]);
  if (!rounds.length)
    return (
      <Empty>
        No blackjack hands yet.{" "}
        <Link href="/play/blackjack/" className="font-semibold text-ember-400">
          Take a seat →
        </Link>
      </Empty>
    );
  if (!list.length) return <Empty>Every decision in your recent hands matched basic strategy.</Empty>;
  return (
    <ul className="grid gap-2.5">
      {list.map((r) => {
        const net = unitsToChips(r.payout - r.wagered);
        const misses = r.decisions.filter((d) => !d.ok);
        return (
          <li key={r.id} className="panel rounded-3xl p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ash-500">Dealer</span>
                <span className="flex gap-0.5">
                  {r.dealer.map((c, i) => (
                    <MiniCard key={i} card={c} />
                  ))}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ash-500">You</span>
                {r.hands.map((h, i) => (
                  <span key={i} className="flex items-center gap-0.5">
                    {h.cards.map((c, j) => (
                      <MiniCard key={j} card={c} />
                    ))}
                    <span className="ml-1 text-[10px] font-bold uppercase text-ash-400">{h.result}</span>
                  </span>
                ))}
              </div>
              <span className="ml-auto flex items-center gap-3">
                <span className="text-[11px] text-ash-500">
                  {TABLES[r.tableId]?.name} · {when(r.at)}
                </span>
                <span className={`tabular text-sm font-bold ${net > 0 ? "text-emerald-400" : net < 0 ? "text-ash-500" : "text-ash-300"}`}>{formatChips(net, { sign: true })}</span>
              </span>
            </div>
            {r.decisions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.decisions.map((d, i) => (
                  <span
                    key={i}
                    title={d.why}
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                      d.ok ? "bg-emerald-500/10 text-emerald-200 ring-emerald-500/30" : "bg-ember-500/10 text-ember-100 ring-ember-500/40"
                    }`}
                  >
                    {d.ok ? <IconCheck className="h-3 w-3" /> : <IconX className="h-3 w-3" />}
                    {d.label}: {choiceLabel(d.chosen).toLowerCase()}
                    {!d.ok && <span className="text-ash-400"> (should {choiceLabel(d.correct).toLowerCase()})</span>}
                  </span>
                ))}
              </div>
            )}
            {misses.length > 0 && misses[0].why && <p className="mt-2 text-xs text-ash-400">{misses[0].why}</p>}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ matches */

function MatchList({ matches }: { matches: ReturnType<typeof useProgress>["matches"] }) {
  if (!matches.length)
    return (
      <Empty>
        No matches yet.{" "}
        <Link href="/play/poker/" className="font-semibold text-ember-400">
          Pick an opponent →
        </Link>
      </Empty>
    );
  return (
    <ul className="panel divide-y divide-ash-800 overflow-hidden rounded-3xl">
      {[...matches].reverse().map((m) => {
        const bot = botById(m.botId);
        const d = m.after - m.before;
        return (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            {bot && <BotAvatar bot={bot} size={40} />}
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">vs {bot?.name ?? m.botId}</span>
              <span className="block text-[11px] text-ash-500">
                {when(m.at)} · {m.hands} hands
              </span>
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${
                m.result === "win" ? "bg-emerald-500 text-ash-950" : m.result === "draw" ? "bg-ash-700 text-ash-200" : "bg-ember-700/60 text-ember-100"
              }`}
            >
              {m.result}
            </span>
            <span className={`tabular w-12 text-right text-sm font-bold ${d > 0 ? "text-emerald-400" : d < 0 ? "text-ember-400" : "text-ash-400"}`}>
              {d > 0 ? "+" : ""}
              {d}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
