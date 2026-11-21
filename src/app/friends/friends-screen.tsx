"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { IconCheck, IconChevron, IconCopy, IconFriends, IconSend, IconTrophy, IconX } from "@/components/icons";
import { SignInCard } from "@/components/online/sign-in";
import { StreakFlame } from "@/components/streak/streak-flame";
import { PageHeader, SectionTitle } from "@/components/ui";
import { errorText } from "@/lib/online/client";
import {
  acceptFriend,
  addFriend,
  loadFriends,
  loadLeague,
  loadSharedHands,
  markHandSeen,
  myFriendCode,
  removeFriend,
  shareHand,
  useOnline,
  type Friend,
  type SharedHand,
} from "@/lib/online/social";
import { daysLeftInWeek, duel, friendStreak, tierName, zoneOf, type Duel } from "@/lib/online/social-rules";
import { play } from "@/lib/sound";
import { today, useHydrated, useProgress, type BjRoundRecord, type PokerHandRecord } from "@/lib/store";

const PokerReplay3D = dynamic(() => import("@/components/replay/poker-replay-3d").then((m) => m.PokerReplay3D), { ssr: false });
const BlackjackReplay3D = dynamic(() => import("@/components/replay/blackjack-replay-3d").then((m) => m.BlackjackReplay3D), { ssr: false });

export function FriendsScreen() {
  const friends = useOnline(loadFriends, ["friendships"]);
  const hydrated = useHydrated();

  return (
    <div className="mx-auto max-w-5xl px-4 pb-12 pt-5 sm:px-6 lg:pt-10">
      <PageHeader eyebrow="The Club" title="Friends">
        {friends.status === "signed-in" && (
          <Link href="/play/friends/" className="btn-fire flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-bold">
            Sit down together
            <IconChevron className="h-4 w-4" />
          </Link>
        )}
      </PageHeader>

      {!hydrated || friends.status === "loading" ? (
        <div className="h-64 animate-pulse rounded-3xl bg-ash-900" />
      ) : friends.status === "signed-out" ? (
        <div className="max-w-xl">
          <SignInCard />
          <ul className="mt-5 grid gap-2 text-sm text-ash-300">
            <li>· Duel friends on the same three daily puzzles.</li>
            <li>· Keep a streak going together.</li>
            <li>· Climb a weekly league from Copper to Diamond on training XP.</li>
            <li>· Sit at a private poker or blackjack table, then review every hand together.</li>
          </ul>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="grid gap-6">
            <AddFriend onAdded={friends.reload} />
            <FriendList me={friends.me!} friends={friends.data} error={friends.error} reload={friends.reload} />
          </div>
          <div className="grid gap-6">
            <League />
            <Inbox friends={friends.data ?? []} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ add a friend */

function AddFriend({ onAdded }: { onAdded: () => void }) {
  const params = useSearchParams();
  const [code, setCode] = useState<string | null>(null);
  const [input, setInput] = useState(() => (params.get("add") ?? "").toUpperCase().slice(0, 8));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    myFriendCode()
      .then(setCode)
      .catch(() => {});
  }, []);

  const add = async () => {
    const c = input.trim().toUpperCase();
    if (c.length !== 8) return toast.error("Friend codes have 8 characters");
    setBusy(true);
    try {
      const r = await addFriend(c);
      play("chip");
      toast.success(r === "accepted" ? "You're friends now" : r === "already" ? "Already friends" : r === "pending" ? "Request already sent" : "Request sent");
      setInput("");
      onAdded();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const shareCode = async () => {
    if (!code) return;
    const url = `${location.origin}/friends/?add=${code}`;
    const text = `Add me on Inferno: ${code}`;
    try {
      if (navigator.share) await navigator.share({ title: "Inferno", text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast.success("Copied your code");
      }
    } catch {
      // share sheet dismissed
    }
  };

  return (
    <section className="panel rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Your friend code</p>
          <p className="tabular mt-1 font-mono text-2xl font-bold tracking-[0.2em] text-bone">{code ?? "········"}</p>
        </div>
        <button onClick={() => void shareCode()} disabled={!code} className="btn-ash flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold">
          <IconCopy className="h-4 w-4" /> Share
        </button>
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
          placeholder="Their code"
          aria-label="Friend code"
          className="tabular h-11 w-full rounded-xl border border-ash-700 bg-ash-950 px-3 font-mono text-[15px] font-semibold tracking-[0.2em] text-bone outline-none placeholder:tracking-normal placeholder:text-ash-600 focus:border-ember-500"
        />
        <button disabled={busy || input.length !== 8} className="btn-fire h-11 shrink-0 rounded-xl px-4 text-sm font-bold disabled:opacity-50">
          Add
        </button>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ friends */

function FriendList({ me, friends, error, reload }: { me: string; friends: Friend[] | null; error: string | null; reload: () => void }) {
  const p = useProgress();
  const myMet = useMemo(() => [...p.streak.met, ...p.streak.covered], [p.streak.met, p.streak.covered]);
  const myPuzzles = p.daily[today()] ?? [];

  if (!friends) {
    return error ? (
      <p className="panel rounded-3xl p-5 text-sm text-ash-400">Couldn&apos;t load your friends. Check your connection.</p>
    ) : (
      <div className="h-40 animate-pulse rounded-3xl bg-ash-900" />
    );
  }

  const incoming = friends.filter((f) => f.status === "incoming");
  const outgoing = friends.filter((f) => f.status === "outgoing");
  const accepted = friends.filter((f) => f.status === "accepted");

  const act = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      reload();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div className="grid gap-6">
      {incoming.length > 0 && (
        <section>
          <SectionTitle title="Requests" />
          <ul className="panel divide-y divide-ash-800 rounded-3xl">
            {incoming.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={f.name} />
                <span className="min-w-0 flex-1 truncate font-bold">{f.name}</span>
                <button onClick={() => void act(() => removeFriend(me, f.id), "Declined")} aria-label={`Decline ${f.name}`} className="btn-ash grid h-9 w-9 place-items-center rounded-xl">
                  <IconX className="h-4 w-4" />
                </button>
                <button onClick={() => void act(() => acceptFriend(f.id), `You and ${f.name} are friends`)} className="btn-fire h-9 rounded-xl px-3 text-xs font-bold">
                  Accept
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionTitle title={`Friends${accepted.length ? ` · ${accepted.length}` : ""}`} />
        {accepted.length === 0 ? (
          <div className="panel rounded-3xl p-5 text-sm text-ash-400">
            <IconFriends className="mb-2 h-6 w-6 text-brass-500" />
            No friends yet. Share your code, or add theirs above. Friends see each other&apos;s streaks and duel on the daily puzzles.
          </div>
        ) : (
          <ul className="panel divide-y divide-ash-800 rounded-3xl">
            {accepted.map((f) => (
              <FriendRow key={f.id} f={f} together={friendStreak(myMet, f.met)} duel={duel(myPuzzles, f.puzzles)} onRemove={() => void act(() => removeFriend(me, f.id), "Removed")} />
            ))}
          </ul>
        )}
        {outgoing.length > 0 && (
          <p className="mt-2 px-1 text-xs text-ash-500">
            Waiting on {outgoing.map((f) => f.name).join(", ")}.{" "}
            {outgoing.map((f) => (
              <button key={f.id} onClick={() => void act(() => removeFriend(me, f.id), "Request cancelled")} className="font-semibold underline-offset-2 hover:text-bone hover:underline">
                Cancel {f.name}
              </button>
            ))}
          </p>
        )}
      </section>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[linear-gradient(160deg,#7f5a2e,#3a2714)] font-display text-sm text-[#fff3df] ring-1 ring-brass-300/50">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

const DUEL_TEXT: Record<Duel["verdict"], string> = {
  win: "You won today's puzzles",
  loss: "They won today's puzzles",
  tie: "Tied on today's puzzles",
  waiting: "Duel in progress",
  unplayed: "Today's puzzles: your move",
};

function FriendRow({ f, together, duel: d, onRemove }: { f: Friend; together: number; duel: Duel; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ash-850/50">
        <Avatar name={f.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-bone">{f.name}</span>
          <span className="block truncate text-xs text-ash-400">
            {together > 0 ? `${together}-day streak together` : f.met.includes(today()) ? "Hit their goal today" : "Hasn't hit today's goal"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-sm font-bold text-ember-200">
          <StreakFlame streak={f.streak} size={22} />
          <span className="tabular">{f.streak}</span>
        </span>
      </button>
      {open && (
        <div className="grid gap-3 px-4 pb-4">
          <div className="rounded-2xl bg-ash-950/60 p-3 ring-1 ring-ash-800">
            <p className="mb-2 flex items-center justify-between text-xs font-bold">
              <span className={d.verdict === "win" ? "text-emerald-300" : d.verdict === "loss" ? "text-ember-300" : "text-ash-300"}>{DUEL_TEXT[d.verdict]}</span>
              <span className="tabular text-ash-400">
                {d.mine}–{d.theirs}
              </span>
            </p>
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-xs">
              <span className="text-ash-500">You</span>
              <Dots xs={d.rows.map((r) => r.mine)} />
              <span className="text-ash-500">{f.name}</span>
              {/* their answers stay hidden until you've played, so the duel can't be copied */}
              <Dots xs={d.rows.map((r, i) => (d.rows[i].mine === null && r.theirs !== null ? undefined : r.theirs))} />
            </div>
            {d.verdict === "unplayed" && (
              <Link href="/train/daily/" className="btn-fire mt-3 inline-flex h-9 items-center rounded-xl px-3 text-xs font-bold">
                Play today&apos;s puzzles
              </Link>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {(["poker", "blackjack", "training"] as const).map((k) => (
              <div key={k} className="rounded-xl bg-ash-950/60 py-2 ring-1 ring-ash-800">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ash-500">{k}</p>
                <p className="tabular font-display font-bold">{f.ratings[k] ?? "–"}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-between gap-2">
            <ShareHandButton friend={f} />
            <button onClick={onRemove} className="text-xs font-semibold text-ash-500 hover:text-ember-300">
              Remove friend
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** true solved, false missed, null not played, undefined hidden */
function Dots({ xs }: { xs: (boolean | null | undefined)[] }) {
  return (
    <span className="flex gap-1.5">
      {xs.map((x, i) => (
        <span
          key={i}
          className={`grid h-5 w-5 place-items-center rounded-full ring-1 ${
            x === true ? "bg-emerald-500/20 text-emerald-300 ring-emerald-400/50" : x === false ? "bg-ember-700/20 text-ember-300 ring-ember-500/50" : x === undefined ? "bg-ash-800 ring-ash-600" : "ring-ash-700"
          }`}
        >
          {x === true ? <IconCheck className="h-3 w-3" /> : x === false ? <IconX className="h-3 w-3" /> : x === undefined ? <span className="h-1 w-1 rounded-full bg-ash-400" /> : null}
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ share a hand */

function ShareHandButton({ friend }: { friend: Friend }) {
  const p = useProgress();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const hands = useMemo(
    () =>
      [
        ...p.pokerHands.map((h) => ({ id: h.id, at: h.at, game: "poker" as const, label: `Poker #${h.handNo}: ${h.net >= 0 ? "+" : ""}${Math.round((h.net / h.bb) * 10) / 10} bb`, hand: h as unknown })),
        ...p.bjRounds.map((r) => ({ id: r.id, at: r.at, game: "blackjack" as const, label: `Blackjack: ${r.hands.map((h) => h.total).join(" / ")} vs dealer`, hand: r as unknown })),
      ]
        .sort((a, b) => b.at - a.at)
        .slice(0, 12),
    [p.pokerHands, p.bjRounds],
  );

  const send = async (h: (typeof hands)[number]) => {
    try {
      await shareHand(friend.id, h.game, h.hand, note);
      toast.success(`Sent to ${friend.name}`);
      setOpen(false);
      setNote("");
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} disabled={!hands.length} className="btn-ash flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold disabled:opacity-40">
        <IconSend className="h-4 w-4" /> Send a hand
      </button>
    );
  }
  return (
    <div className="w-full rounded-2xl bg-ash-950/60 p-3 ring-1 ring-ash-800">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 280))}
        placeholder="What do you think of this spot? (optional)"
        aria-label="Note"
        className="mb-2 h-10 w-full rounded-xl border border-ash-700 bg-ash-950 px-3 text-sm text-bone outline-none placeholder:text-ash-600 focus:border-ember-500"
      />
      <ul className="grid max-h-56 gap-1 overflow-y-auto">
        {hands.map((h) => (
          <li key={h.id}>
            <button onClick={() => void send(h)} className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs hover:bg-ash-850">
              <span className="truncate font-semibold text-bone">{h.label}</span>
              <span className="shrink-0 text-ash-500">{new Date(h.at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
            </button>
          </li>
        ))}
      </ul>
      <button onClick={() => setOpen(false)} className="mt-2 text-xs font-semibold text-ash-500 hover:text-bone">
        Cancel
      </button>
    </div>
  );
}

function Inbox({ friends }: { friends: Friend[] }) {
  const inbox = useOnline(loadSharedHands, ["shared_hands"]);
  const [viewing, setViewing] = useState<SharedHand | null>(null);
  const mine = (inbox.data ?? []).filter((h) => h.recipient === inbox.me);
  const nameOf = (id: string) => friends.find((f) => f.id === id)?.name ?? "A friend";

  const open = (h: SharedHand) => {
    setViewing(h);
    if (!h.seen) void markHandSeen(h.id).then(inbox.reload);
  };

  return (
    <section>
      <SectionTitle title="Hands sent to you" />
      {mine.length === 0 ? (
        <p className="panel rounded-3xl p-5 text-sm text-ash-400">When a friend sends you a hand to look at, it shows up here with their note.</p>
      ) : (
        <ul className="panel divide-y divide-ash-800 rounded-3xl">
          {mine.map((h) => (
            <li key={h.id}>
              <button onClick={() => open(h)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ash-850/50">
                {!h.seen && <span className="h-2 w-2 shrink-0 rounded-full bg-ember-400 shadow-[0_0_6px_rgba(255,122,31,0.9)]" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-bone">
                    {nameOf(h.sender)} · {h.game === "poker" ? "poker hand" : "blackjack round"}
                  </span>
                  <span className="block truncate text-xs text-ash-400">{h.note ?? "No note"}</span>
                </span>
                <IconChevron className="h-4 w-4 shrink-0 text-ash-500" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {viewing?.game === "poker" && <PokerReplay3D hand={viewing.hand as PokerHandRecord} onClose={() => setViewing(null)} />}
      {viewing?.game === "blackjack" && <BlackjackReplay3D round={viewing.hand as BjRoundRecord} onClose={() => setViewing(null)} />}
    </section>
  );
}

/* ------------------------------------------------------------------ league */

function League() {
  const league = useOnline(loadLeague);
  const data = league.data;
  const rows = data?.rows ?? [];
  const meIndex = rows.findIndex((r) => r.me);
  // the top of the table plus a window around you
  const shown = rows.filter((_, i) => i < 10 || Math.abs(i - meIndex) <= 2);

  return (
    <section>
      <SectionTitle title="League" />
      <div className="panel relative overflow-hidden rounded-3xl p-5">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgba(214,186,128,0.2),transparent)]" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brass-500/15 text-brass-300 ring-1 ring-brass-400/40">
            <IconTrophy className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg font-bold text-bone">{data ? `${tierName(data.tier)} League` : " "}</p>
            <p className="text-xs text-ash-400">
              {data ? `Top 7 move up · ${daysLeftInWeek()} day${daysLeftInWeek() === 1 ? "" : "s"} left this week` : league.error ? "Couldn't load the league" : "Finding your group…"}
            </p>
          </div>
        </div>
        {rows.length > 0 && (
          <ol className="relative mt-4 grid gap-1">
            {shown.map((r) => {
              const rank = rows.indexOf(r) + 1;
              const zone = zoneOf(rank, rows.length, r.tier, r.xp);
              return (
                <li
                  key={r.userId}
                  className={`flex items-center gap-3 rounded-xl px-2.5 py-1.5 text-sm ${r.me ? "bg-ember-500/12 ring-1 ring-ember-500/40" : ""}`}
                >
                  <span className={`tabular w-6 text-right text-xs font-bold ${zone === "up" ? "text-emerald-300" : zone === "down" ? "text-ember-400" : "text-ash-500"}`}>{rank}</span>
                  <span className={`min-w-0 flex-1 truncate ${r.me ? "font-bold text-bone" : "text-ash-200"}`}>{r.me ? "You" : r.name}</span>
                  <span className="tabular text-xs font-bold text-ash-300">{r.xp} XP</span>
                </li>
              );
            })}
          </ol>
        )}
        <p className="relative mt-3 text-[11px] text-ash-500">League XP is the same XP as your daily goal: lessons, drills, puzzles, and a little from table play.</p>
      </div>
    </section>
  );
}
