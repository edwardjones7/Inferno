"use client";

/**
 * Live tables from the player's side: every change goes through the `table` edge function;
 * reads come straight from the database (row level security shows you only your table and
 * your own hidden cards) and stay live through realtime.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Game, Move, Private, Public } from "./live";
import { supabase } from "./client";

export interface LiveTable {
  id: string;
  code: string;
  game: Game;
  host: string;
  status: "lobby" | "playing" | "closed";
  settings: Record<string, unknown>;
  public: Public | null;
  version: number;
  deadline: string | null;
}

export interface LiveSeat {
  user_id: string;
  seat: number;
  name: string;
  left_at: string | null;
}

export class TableError extends Error {}

async function call<T = { ok: true }>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke("table", { body });
  if (error) {
    let message = "Couldn't reach the table. Check your connection.";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const j = await ctx.json();
        if (j?.error) message = j.error;
      } catch {}
    }
    throw new TableError(message);
  }
  return data as T;
}

export const createTable = (game: Game, settings: Record<string, unknown> = {}) => call<{ id: string; code: string }>({ action: "create", game, settings });
export const joinTable = (code: string) => call<{ id: string }>({ action: "join", code });
export const startTable = (id: string) => call({ action: "start", id });
export const sendMove = (id: string, move: Move) => call({ action: "move", id, move });
export const leaveTable = (id: string) => call({ action: "leave", id });
export const updateTableSettings = (id: string, settings: Record<string, unknown>) => call({ action: "settings", id, settings });

/** Tables you're seated at that are still open, newest first. */
export async function myOpenTables(me: string): Promise<LiveTable[]> {
  const { data: seats } = await supabase().from("live_seats").select("table_id").eq("user_id", me).is("left_at", null);
  const ids = (seats ?? []).map((s) => s.table_id as string);
  if (!ids.length) return [];
  const { data } = await supabase().from("live_tables").select("*").in("id", ids).neq("status", "closed").order("created_at", { ascending: false });
  return (data ?? []) as LiveTable[];
}

export interface HandRecord {
  hand_no: number;
  record: Record<string, unknown> & { game: Game };
}

/** Every hand of a closed table, all cards face up (readable once the table closes). */
export async function tableHands(id: string): Promise<HandRecord[]> {
  const { data, error } = await supabase().from("live_hands").select("hand_no, record").eq("table_id", id).order("hand_no");
  if (error) throw error;
  return (data ?? []) as HandRecord[];
}

/**
 * Everything one table screen needs, kept live. Also keeps the game moving: when someone's
 * clock runs out, or a finished hand has been shown long enough, any player's app nudges
 * the server (the server checks the clock; duplicate nudges are harmless).
 */
export function useLiveTable(id: string | null, me: string | null) {
  const [table, setTable] = useState<LiveTable | null>(null);
  const [seats, setSeats] = useState<LiveSeat[]>([]);
  const [priv, setPriv] = useState<Private | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!id || !me) return;
    const sb = supabase();
    const [t, s, p] = await Promise.all([
      sb.from("live_tables").select("*").eq("id", id).maybeSingle(),
      sb.from("live_seats").select("user_id, seat, name, left_at").eq("table_id", id).order("seat"),
      sb.from("live_private").select("data").eq("table_id", id).eq("user_id", me).maybeSingle(),
    ]);
    if (t.error || s.error) setError(t.error?.message ?? s.error?.message ?? null);
    else setError(t.data ? null : "This table isn't open to you");
    setTable((t.data as LiveTable | null) ?? null);
    setSeats((s.data as LiveSeat[] | null) ?? []);
    setPriv(((p.data?.data as Private | undefined) ?? null) as Private | null);
    setLoaded(true);
  }, [id, me]);

  useEffect(() => {
    if (!id || !me) return;
    // load after subscribing so no change slips between the read and the subscription
    const first = setTimeout(() => void refresh(), 0);
    const sb = supabase();
    const ch = sb
      .channel(`table:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_tables", filter: `id=eq.${id}` }, (e) => {
        if (e.new && "id" in e.new) setTable((prev) => (prev && (e.new as LiveTable).version < prev.version ? prev : (e.new as LiveTable)));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "live_seats", filter: `table_id=eq.${id}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "live_private", filter: `table_id=eq.${id}` }, (e) => {
        const row = e.new as { user_id?: string; data?: Private };
        if (row?.user_id === me && row.data) setPriv(row.data);
      })
      .subscribe();
    // realtime can drop on flaky mobile networks: a slow poll keeps the table honest
    const poll = setInterval(() => void refresh(), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      void sb.removeChannel(ch);
    };
  }, [id, me, refresh]);

  // keep the game moving
  const nudged = useRef<string>("");
  useEffect(() => {
    if (!table || table.status !== "playing" || !table.public || !id) return;
    const pub = table.public;
    const host = table.host === me;
    const due = pub.nextAt ?? (pub.deadline ? pub.deadline + 1_000 : null);
    if (due === null) return;
    const kind: Move["kind"] = pub.nextAt ? "next" : "timeout";
    // the host nudges on time; everyone else a little later in case the host is away
    const at = due + (host ? 0 : 4_000);
    const key = `${table.version}:${kind}`;
    const t = setTimeout(() => {
      if (nudged.current === key) return;
      nudged.current = key;
      sendMove(id, { kind } as Move).catch(() => {});
    }, Math.max(0, at - Date.now()));
    return () => clearTimeout(t);
  }, [table, id, me]);

  return { table, seats, priv, error, loaded, refresh };
}
