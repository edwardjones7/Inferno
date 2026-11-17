"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BotAvatar } from "@/components/bot-avatar";
import { IconCheck, IconStep, IconX } from "@/components/icons";
import { MiniCard, PlayingCardStatic } from "@/components/playing-card-static";
import { ProBadge } from "@/components/pro/pro-badge";
import { Empty, PageHeader, Segmented } from "@/components/ui";
import type { Card } from "@/lib/blackjack/cards";
import { choiceLabel, type Decision } from "@/lib/blackjack/coach";
import { formatCost } from "@/lib/blackjack/ev";
import { TABLES } from "@/lib/blackjack/tables";
import { formatChips, unitsToChips } from "@/lib/chips";
import { FREE_REVIEW_HANDS, lockedReviewIds, paywallReason } from "@/lib/gates";
import type { HandEvent } from "@/lib/poker/game-types";
import { botById } from "@/lib/poker/roster";
import { youText } from "@/lib/poker/text";
import { openPaywall, PRO_NAME, useIsPro } from "@/lib/pro";
import { play } from "@/lib/sound";
import { useHydrated, useProgress, type BjRoundRecord, type PokerHandRecord, type PokerNote } from "@/lib/store";

type Tab = "poker" | "blackjack" | "matches";
const isTab = (v: unknown): v is Tab => v === "poker" || v === "blackjack" || v === "matches";
type Sort = "recent" | "costliest";

const when = (t: number) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const bbText = (bb: number) => `${bb < 10 ? bb.toFixed(1) : Math.round(bb)} bb`;

export function Review() {
  const sp = useSearchParams();
  const router = useRouter();
  const tabParam = sp.get("tab");
  const tab: Tab = isTab(tabParam) ? tabParam : "poker";
  const p = useProgress();
  const hydrated = useHydrated();
  const pro = useIsPro();
  const [mistakesOnly, setMistakesOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("recent");

  const setTab = (t: Tab) => router.replace(`/review/?tab=${t}`, { scroll: false });

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-5 sm:px-6 lg:pt-10">
      <PageHeader eyebrow="The Books" title="Learn from every hand" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-full sm:max-w-md sm:basis-auto">
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
          <>
            <div className="w-48 shrink-0">
              <Segmented
                label="Sort"
                value={sort}
                onChange={setSort}
                options={[
                  { id: "recent", label: "Recent" },
                  { id: "costliest", label: "Costliest" },
                ]}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-ash-300">
              <input type="checkbox" checked={mistakesOnly} onChange={(e) => setMistakesOnly(e.target.checked)} className="h-4 w-4 accent-ember-500" />
              Mistakes only
            </label>
          </>
        )}
      </div>

      {!hydrated ? (
        <div className="panel h-72 animate-pulse rounded-3xl" />
      ) : tab === "poker" ? (
        <PokerReview hands={p.pokerHands} mistakesOnly={mistakesOnly} sort={sort} pro={pro} />
      ) : tab === "blackjack" ? (
        <BlackjackReview rounds={p.bjRounds} mistakesOnly={mistakesOnly} sort={sort} pro={pro} />
      ) : (
        <MatchList matches={p.matches} />
      )}
    </div>
  );
}

/** Drill link for a mistake: compact pill used in both tabs. */
function DrillLink({ href, children = "Drill this spot →" }: { href: string; children?: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={() => play("click")}
      className="inline-flex h-7 shrink-0 items-center rounded-full bg-ember-500/15 px-2.5 text-[11px] font-bold text-ember-200 ring-1 ring-ember-500/40 hover:bg-ember-500/25"
    >
      {children}
    </Link>
  );
}

/** One quiet line under a list with locked history. */
function LockedNote({ count, game }: { count: number; game: "poker" | "blackjack" }) {
  if (!count) return null;
  return (
    <p className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-1 text-center text-xs text-ash-500">
      Your last {FREE_REVIEW_HANDS} {game === "poker" ? "hands" : "rounds"} are free to replay. {count} older{" "}
      {count === 1 ? "one is" : "ones are"} kept for {PRO_NAME}.
      <button
        onClick={() => {
          play("click");
          openPaywall(paywallReason.review(game));
        }}
        className="font-bold text-ember-400 hover:text-ember-300"
      >
        See Pro
      </button>
    </p>
  );
}

/* ------------------------------------------------------------------ poker */

/** How costly a hand's mistakes were: estimated bb given up, then how many ✗ notes. */
function pokerScore(h: PokerHandRecord) {
  const misses = h.notes.filter((n) => n.ok === false);
  return { cost: misses.reduce((s, n) => s + (n.cost ?? 0), 0), misses: misses.length };
}

const pokerDrillHref = (n: PokerNote) => (n.street === "preflop" ? "/train/poker/?drill=preflop" : "/train/poker/?drill=cbet");

function PokerReview({ hands, mistakesOnly, sort, pro }: { hands: PokerHandRecord[]; mistakesOnly: boolean; sort: Sort; pro: boolean }) {
  const locked = useMemo(() => lockedReviewIds(hands, pro), [hands, pro]);
  const list = useMemo(() => {
    const recent = [...hands].reverse().filter((h) => !mistakesOnly || h.notes.some((n) => n.ok === false));
    if (sort === "recent") return recent;
    const scored = recent.map((h) => ({ h, s: pokerScore(h) }));
    // stable sort keeps recency as the final tie-break
    scored.sort((a, b) => b.s.cost - a.s.cost || b.s.misses - a.s.misses);
    return scored.map((x) => x.h);
  }, [hands, mistakesOnly, sort]);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = list.find((h) => h.id === openId && !locked.has(h.id)) ?? list.find((h) => !locked.has(h.id)) ?? null;

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
    <>
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      {open ? (
        <Replayer key={open.id} hand={open} />
      ) : (
        <Empty>Hands this old are kept for {PRO_NAME}. Turn off the filter to see your recent ones.</Empty>
      )}
      <ul className="panel max-h-[70dvh] divide-y divide-ash-800 overflow-y-auto rounded-3xl lg:order-first lg:max-h-[640px]">
        {list.map((h) => {
          const { cost, misses } = pokerScore(h);
          const on = open?.id === h.id;
          const opp = h.mode === "match" ? botById(h.bots[0]) : null;
          const isLocked = locked.has(h.id);
          return (
            <li key={h.id}>
              <button
                onClick={() => {
                  if (isLocked) {
                    play("click");
                    return openPaywall(paywallReason.review("poker"));
                  }
                  setOpenId(h.id);
                  play("click");
                  if (window.matchMedia("(max-width: 1023px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${on ? "bg-ember-500/10" : "hover:bg-ash-850"}`}
              >
                <span className={`flex gap-0.5 ${isLocked ? "opacity-40 grayscale" : ""}`}>
                  {h.hole.map((c, i) => (
                    <MiniCard key={i} card={c} />
                  ))}
                </span>
                <span className={`min-w-0 flex-1 ${isLocked ? "opacity-60" : ""}`}>
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    {opp ? <BotAvatar bot={opp} size={16} /> : null}
                    <span className="truncate text-ash-200">{opp ? `vs ${opp.name}` : "6-max table"}</span>
                  </span>
                  <span className="block text-[11px] text-ash-500">{when(h.at)}</span>
                </span>
                {isLocked ? (
                  <ProBadge />
                ) : (
                  misses > 0 && (
                    <span className="rounded-full bg-ember-600/20 px-2 py-0.5 text-[10px] font-bold text-ember-300">
                      {cost > 0 ? `−${bbText(cost)}` : `${misses} miss${misses > 1 ? "es" : ""}`}
                    </span>
                  )
                )}
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
    <LockedNote count={locked.size} game="poker" />
    </>
  );
}

const STREET_LABEL: Record<string, string> = { preflop: "Pre-flop", flop: "Flop", turn: "Turn", river: "River", showdown: "Showdown", done: "Result" };

/** Chips in the middle after the first `step` events, rebuilt from the log text. */
function potAt(log: readonly HandEvent[], step: number): number {
  let banked = 0;
  let street = new Map<number, number>();
  const sum = () => [...street.values()].reduce((a, b) => a + b, 0);
  for (const e of log.slice(0, step)) {
    if (e.kind === "board") {
      banked += sum();
      street = new Map();
      continue;
    }
    if (e.seat === undefined) continue;
    const cur = street.get(e.seat) ?? 0;
    let m: RegExpExecArray | null;
    if (e.kind === "blind" && (m = /blind (\d+)/.exec(e.text))) street.set(e.seat, cur + Number(m[1]));
    else if (e.kind === "action" && (m = /^Uncalled (\d+) returned/.exec(e.text))) street.set(e.seat, cur - Number(m[1]));
    else if (e.kind === "action" && (m = / calls (\d+)/.exec(e.text))) street.set(e.seat, cur + Number(m[1]));
    else if (e.kind === "action" && (m = / (?:bets|raises to) (\d+)/.exec(e.text))) street.set(e.seat, Number(m[1]));
  }
  return banked + sum();
}

/**
 * Step through a recorded hand action by action (or street by street), pausing on each
 * of the hero's decisions before revealing what they did and the coach's verdict.
 */
function Replayer({ hand }: { hand: PokerHandRecord }) {
  const log = hand.log;
  const total = log.length;

  // step = how many log events are visible. Street boundaries are steps where a street starts.
  const marks = useMemo(() => {
    const lastBlind = log.reduce((acc, e, i) => (e.kind === "blind" || e.kind === "deal" ? i : acc), 0);
    const out: { street: string; step: number }[] = [{ street: "preflop", step: Math.min(total, lastBlind + 1) }];
    log.forEach((e, i) => {
      if (e.kind === "board") out.push({ street: e.street, step: i + 1 });
    });
    const end = log.findIndex((e) => e.kind === "showdown" || e.kind === "win");
    if (end >= 0) out.push({ street: log[end].kind === "showdown" ? "showdown" : "done", step: total });
    return out;
  }, [log, total]);
  const decisions = useMemo(() => [...new Set(hand.notes.map((n) => n.at))].filter((a) => a >= 1 && a <= total).sort((a, b) => a - b), [hand.notes, total]);

  const [step, setStep] = useState(() => marks[0]?.step ?? total);
  const clamp = (n: number) => Math.max(1, Math.min(total, n));
  const go = (n: number) => {
    setStep(clamp(n));
    play("click");
  };
  const prevStreet = () => go([...marks].reverse().find((m) => m.step < step)?.step ?? 1);
  const nextStreet = () => go(marks.find((m) => m.step > step)?.step ?? total);
  const nextDecision = decisions.find((a) => a > step);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setStep((s) => Math.max(1, s - 1));
      if (e.key === "ArrowRight") setStep((s) => Math.min(total, s + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  const shownEvents = log.slice(0, step);
  const boardCount = [0, 3, 4, 5][Math.min(3, shownEvents.filter((e) => e.kind === "board").length)];
  const board = hand.board.slice(0, boardCount);
  const atShowdown = shownEvents.some((e) => e.kind === "showdown");
  const notes = hand.notes.filter((n) => n.at < step);
  /** the hero is about to act at this step (their action is the next event) */
  const pending = hand.notes.filter((n) => n.at === step);
  /** the hero's action was the last event revealed */
  const fresh = new Set(hand.notes.filter((n) => n.at === step - 1));
  const last = shownEvents.at(-1);
  const opp = hand.mode === "match" ? botById(hand.bots[0]) : null;
  const pot = potAt(log, step);
  const currentStreet = [...marks].reverse().find((m) => m.step <= step)?.street ?? "preflop";

  return (
    <div className="min-w-0">
      <div className="felt relative overflow-hidden rounded-3xl px-4 py-5 sm:px-6">
        <div className="flex items-center justify-between caps-label">
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

        {/* board + pot */}
        <div className="mt-4 flex min-h-[62px] justify-center gap-1.5 sm:min-h-[84px]">
          {board.map((c, i) => (
            <PlayingCardStatic key={i} card={c} small />
          ))}
          {Array.from({ length: 5 - board.length }).map((_, i) => (
            <span key={`e${i}`} className="h-[62px] w-[44px] rounded-[7px] border border-dashed border-ash-700/70 sm:h-[84px] sm:w-[60px]" />
          ))}
        </div>
        <p className="mb-4 mt-2 text-center">
          <span className="tabular rounded-full bg-ash-950/70 px-3 py-1 text-xs font-bold text-ember-200 ring-1 ring-ash-700">Pot {pot}</span>
        </p>

        {/* hero */}
        <div className="flex flex-col items-center gap-1">
          <span className={`flex gap-1 rounded-xl p-1 ${pending.length ? "ring-2 ring-ember-400 shadow-[0_0_24px_-4px_rgba(255,90,31,0.8)]" : ""}`}>
            {hand.hole.map((c, i) => (
              <PlayingCardStatic key={i} card={c} small />
            ))}
          </span>
          <span className="eyebrow">{pending.length ? "Your decision" : "You"}</span>
        </div>

        <p className="mt-4 min-h-5 text-center text-sm font-semibold text-bone" aria-live="polite">
          {pending.length ? "Your turn. What would you do?" : last ? youText(last.text) : null}
        </p>
      </div>

      {/* streets */}
      <div className="mt-3 flex gap-1 overflow-x-auto" role="group" aria-label="Jump to street">
        {marks.map((m) => {
          const on = m.street === currentStreet;
          return (
            <button
              key={`${m.street}-${m.step}`}
              onClick={() => go(m.step)}
              aria-current={on ? "step" : undefined}
              className={`h-8 shrink-0 rounded-xl px-3 text-xs font-bold transition-colors ${on ? "bg-ember-500 text-ash-950" : "bg-ash-900 text-ash-400 ring-1 ring-ash-700 hover:text-bone"}`}
            >
              {STREET_LABEL[m.street] ?? m.street}
            </button>
          );
        })}
        {nextDecision !== undefined && (
          <button
            onClick={() => go(nextDecision)}
            className="ml-auto h-8 shrink-0 rounded-xl bg-ember-500/15 px-3 text-xs font-bold text-ember-200 ring-1 ring-ember-500/40 hover:bg-ember-500/25"
          >
            Next decision →
          </button>
        )}
      </div>

      {/* transport: outer buttons jump a street, inner ones a single action */}
      <div className="panel mt-2 flex items-center gap-2 rounded-2xl p-2">
        <button onClick={prevStreet} aria-label="Previous street" title="Previous street" className="btn-ash grid h-11 w-11 shrink-0 place-items-center rounded-xl">
          <IconStep dir="first" className="h-4 w-4" />
        </button>
        <button onClick={() => go(step - 1)} aria-label="Previous action" title="Previous action" className="btn-ash grid h-11 w-11 shrink-0 place-items-center rounded-xl">
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
        <button onClick={() => go(step + 1)} aria-label="Next action" title="Next action" className="btn-fire grid h-11 w-11 shrink-0 place-items-center rounded-xl">
          <IconStep dir="next" className="h-4 w-4" />
        </button>
        <button onClick={nextStreet} aria-label="Next street" title="Next street" className="btn-ash grid h-11 w-11 shrink-0 place-items-center rounded-xl">
          <IconStep dir="last" className="h-4 w-4" />
        </button>
      </div>

      {/* coach */}
      <div className="mt-3 space-y-2">
        {hand.notes.length === 0 && <p className="px-1 text-xs text-ash-500">You didn&apos;t make a decision this hand.</p>}
        {[...notes].reverse().map((n, i) => (
          <NoteCard key={`${n.at}-${i}`} note={n} fresh={fresh.has(n)} />
        ))}
        {pending.length > 0 && (
          <p className="rounded-2xl bg-ash-900 px-4 py-3 text-sm text-ash-300 ring-1 ring-ember-500/40">
            <span className="eyebrow">{STREET_LABEL[pending[0].street] ?? pending[0].street} · your move</span>
            <span className="block">Decide what you&apos;d do, then step forward to see your play and the coach&apos;s verdict.</span>
          </p>
        )}
        {!pending.length && hand.notes.length > notes.length && <p className="px-1 text-xs text-ash-500">Step forward to reach your next decision.</p>}
      </div>
    </div>
  );
}

function NoteCard({ note: n, fresh }: { note: PokerNote; fresh: boolean }) {
  return (
    <div
      className={`flex gap-3 rounded-2xl px-4 py-3 text-sm ring-1 ${
        n.ok === false ? "bg-ember-500/10 ring-ember-500/40" : n.ok ? "bg-emerald-500/10 ring-emerald-500/30" : "bg-ash-900 ring-ash-700"
      } ${fresh ? "ring-2" : ""}`}
    >
      <span
        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
          n.ok === false ? "bg-ember-500 text-ash-950" : n.ok ? "bg-emerald-400 text-ash-950" : "bg-ash-700 text-ash-200"
        }`}
      >
        {n.ok === false ? <IconX className="h-3.5 w-3.5" /> : n.ok ? <IconCheck className="h-3.5 w-3.5" /> : <span className="text-[10px] font-black">i</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 caps-label">
          {STREET_LABEL[n.street] ?? n.street}
          {n.ok === false && n.cost !== undefined && n.cost > 0 && <span className="tracking-normal text-ember-300 normal-case">costs ~{bbText(n.cost)}</span>}
        </span>
        <span className="block font-bold text-bone">{n.title}</span>
        <span className="block text-ash-300">{n.detail}</span>
        {n.ok === false && (
          <span className="mt-2 block">
            <DrillLink href={pokerDrillHref(n)} />
          </span>
        )}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ blackjack */

/** Sum of priced mistakes (fraction of the bet) and the number of mistakes. Older rows have no cost. */
function bjScore(r: BjRoundRecord) {
  const misses = r.decisions.filter((d) => !d.ok);
  return { cost: misses.reduce((s, d) => s + (d.cost ?? 0), 0), misses: misses.length };
}

/** Only opening chart cells the trainer can deal (hard 5–19, soft 13–20, pairs). */
function drillableSpot(d: Decision): boolean {
  const m = /^(hard|soft|pair)-(\d{1,2})-(\d{1,2})$/.exec(d.spot);
  if (!m) return false;
  const v = Number(m[2]);
  return m[1] === "pair" || (m[1] === "hard" ? v >= 5 && v <= 19 : v >= 13 && v <= 20);
}

function BlackjackReview({ rounds, mistakesOnly, sort, pro }: { rounds: BjRoundRecord[]; mistakesOnly: boolean; sort: Sort; pro: boolean }) {
  const locked = useMemo(() => lockedReviewIds(rounds, pro), [rounds, pro]);
  const list = useMemo(() => {
    const recent = [...rounds].reverse().filter((r) => !mistakesOnly || r.decisions.some((d) => !d.ok));
    if (sort === "recent") return recent;
    const scored = recent.map((r) => ({ r, s: bjScore(r) }));
    scored.sort((a, b) => b.s.cost - a.s.cost || b.s.misses - a.s.misses);
    return scored.map((x) => x.r);
  }, [rounds, mistakesOnly, sort]);
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
    <>
    <ul className="grid gap-2.5">
      {list.map((r) => {
        if (locked.has(r.id)) return <LockedRound key={r.id} round={r} />;
        const net = unitsToChips(r.payout - r.wagered);
        const misses = r.decisions.filter((d) => !d.ok);
        const { cost } = bjScore(r);
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
                    {!d.ok && d.cost !== undefined && <span className="tabular text-ember-300"> −{formatCost(d.cost)}</span>}
                  </span>
                ))}
              </div>
            )}
            {misses.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                {misses[0].why && <p className="min-w-0 flex-1 basis-60 text-xs text-ash-400">{misses[0].why}</p>}
                {cost > 0 && <span className="text-[11px] font-semibold text-ember-300">Mistakes cost ~{formatCost(cost)} of the bet</span>}
                {[...new Map(misses.filter(drillableSpot).map((d) => [d.spot, d])).values()].map((d) => (
                  <DrillLink key={d.spot} href={`/train/blackjack/?spot=${d.spot}`}>
                    Drill {d.label} →
                  </DrillLink>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
    <LockedNote count={locked.size} game="blackjack" />
    </>
  );
}

/** An older round for a free player: the cards and when, with the coach's notes behind Pro. */
function LockedRound({ round: r }: { round: BjRoundRecord }) {
  return (
    <li>
      <button
        onClick={() => {
          play("click");
          openPaywall(paywallReason.review("blackjack"));
        }}
        className="panel flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-3xl p-4 text-left transition-colors hover:border-ember-500/40"
      >
        <span className="flex items-center gap-1.5 opacity-40 grayscale">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ash-500">Dealer</span>
          <span className="flex gap-0.5">
            {r.dealer.map((c, i) => (
              <MiniCard key={i} card={c} />
            ))}
          </span>
        </span>
        <span className="flex items-center gap-1.5 opacity-40 grayscale">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ash-500">You</span>
          {r.hands.map((h, i) => (
            <span key={i} className="flex gap-0.5">
              {h.cards.map((c, j) => (
                <MiniCard key={j} card={c} />
              ))}
            </span>
          ))}
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span className="text-[11px] text-ash-500">{when(r.at)}</span>
          <ProBadge />
        </span>
      </button>
    </li>
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
