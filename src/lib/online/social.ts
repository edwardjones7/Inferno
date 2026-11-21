"use client";

/** Friends, puzzle duels, friend streaks, leagues and shared hands: reads and writes. */
import { useCallback, useEffect, useState } from "react";
import { addDays, dayKey } from "../economy";
import { useAccount } from "./account";
import { supabase } from "./client";

export interface FriendProfile {
  id: string;
  name: string;
  streak: number;
  best: number;
  ratings: Partial<Record<"poker" | "blackjack" | "training", number>>;
}

export interface Friend extends FriendProfile {
  status: "accepted" | "incoming" | "outgoing";
  /** days this friend met their goal, recent first-ish (last ~5 weeks) */
  met: string[];
  /** today's daily puzzle answers, if they've played */
  puzzles: boolean[] | null;
  todayXp: number;
}

const HISTORY_DAYS = 35;

export async function myFriendCode(): Promise<string | null> {
  const { data, error } = await supabase().from("friend_codes").select("code").maybeSingle();
  if (error) throw error;
  return (data?.code as string | undefined) ?? null;
}

/** Returns "sent", "accepted" (they'd already asked you), "pending" or "already". */
export async function addFriend(code: string): Promise<string> {
  const { data, error } = await supabase().rpc("add_friend", { friend_code: code });
  if (error) throw error;
  return data as string;
}

export async function acceptFriend(id: string): Promise<void> {
  const { error } = await supabase().rpc("accept_friend", { other: id });
  if (error) throw error;
}

export async function removeFriend(me: string, id: string): Promise<void> {
  const [low, high] = me < id ? [me, id] : [id, me];
  const { error } = await supabase().from("friendships").delete().eq("user_low", low).eq("user_high", high);
  if (error) throw error;
}

export async function loadFriends(me: string, now = new Date()): Promise<Friend[]> {
  const sb = supabase();
  const { data: rows, error } = await sb.from("friendships").select("user_low, user_high, requester, status");
  if (error) throw error;
  if (!rows?.length) return [];
  const others = rows.map((r) => (r.user_low === me ? r.user_high : r.user_low) as string);
  const since = dayKey(addDays(now, -HISTORY_DAYS));
  const today = dayKey(now);
  const [profiles, stats] = await Promise.all([
    sb.from("profiles").select("id, name, streak, best_streak, ratings").in("id", others),
    sb.from("day_stats").select("user_id, day, xp, goal_met, puzzles").in("user_id", others).gte("day", since),
  ]);
  if (profiles.error) throw profiles.error;
  if (stats.error) throw stats.error;
  return rows
    .map((r) => {
      const id = (r.user_low === me ? r.user_high : r.user_low) as string;
      const prof = profiles.data?.find((x) => x.id === id);
      const mine = (stats.data ?? []).filter((s) => s.user_id === id);
      const t = mine.find((s) => s.day === today);
      return {
        id,
        name: prof?.name ?? "Player",
        streak: prof?.streak ?? 0,
        best: prof?.best_streak ?? 0,
        ratings: (prof?.ratings ?? {}) as Friend["ratings"],
        status: r.status === "accepted" ? "accepted" : r.requester === me ? "outgoing" : "incoming",
        met: mine.filter((s) => s.goal_met).map((s) => s.day as string),
        puzzles: (t?.puzzles as boolean[] | null) ?? null,
        todayXp: t?.xp ?? 0,
      } satisfies Friend;
    })
    .sort((a, b) => Number(a.status !== "incoming") - Number(b.status !== "incoming") || b.streak - a.streak || a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ leagues */

export interface LeagueRow {
  userId: string;
  name: string;
  xp: number;
  tier: number;
  me: boolean;
}

export async function loadLeague(): Promise<{ tier: number; rows: LeagueRow[] }> {
  const sb = supabase();
  const { data: tier, error } = await sb.rpc("join_league");
  if (error) throw error;
  const board = await sb.rpc("league_board");
  if (board.error) throw board.error;
  const rows = ((board.data ?? []) as { user_id: string; name: string; xp: number; tier: number; is_me: boolean }[]).map((r) => ({
    userId: r.user_id,
    name: r.name,
    xp: r.xp,
    tier: r.tier,
    me: r.is_me,
  }));
  return { tier: tier as number, rows };
}

/* ------------------------------------------------------------------ shared hands */

export interface SharedHand {
  id: string;
  sender: string;
  recipient: string;
  game: "poker" | "blackjack";
  hand: unknown;
  note: string | null;
  seen: boolean;
  createdAt: string;
}

export async function shareHand(recipient: string, game: "poker" | "blackjack", hand: unknown, note?: string): Promise<void> {
  const { data } = await supabase().auth.getUser();
  if (!data.user) throw new Error("Sign in first");
  const { error } = await supabase()
    .from("shared_hands")
    .insert({ sender: data.user.id, recipient, game, hand, note: note?.trim().slice(0, 280) || null });
  if (error) throw error;
}

export async function loadSharedHands(): Promise<SharedHand[]> {
  const { data, error } = await supabase()
    .from("shared_hands")
    .select("id, sender, recipient, game, hand, note, seen, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, createdAt: r.created_at }) as SharedHand);
}

export async function markHandSeen(id: string): Promise<void> {
  await supabase().from("shared_hands").update({ seen: true }).eq("id", id);
}

/* ------------------------------------------------------------------ hooks */

/** Load something for the signed-in player, with a reload function and live refresh on realtime events. */
export function useOnline<T>(load: (me: string) => Promise<T>, realtimeTables: string[] = []) {
  const account = useAccount();
  const me = account.userId;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const key = realtimeTables.join(",");

  useEffect(() => {
    if (!me) return;
    let alive = true;
    load(me)
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(e?.message ?? "offline"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` is a stable module function per call site
  }, [me, tick]);

  useEffect(() => {
    if (!me || !key) return;
    const ch = supabase().channel(`watch:${key}:${me}`);
    for (const table of key.split(",")) ch.on("postgres_changes", { event: "*", schema: "public", table }, reload);
    ch.subscribe();
    return () => {
      void supabase().removeChannel(ch);
    };
  }, [me, key, reload]);

  return { me, status: account.status, data, error, reload };
}
