// Live tables with friends: the only writer of live_tables, live_seats, live_private,
// table_secrets and live_hands. The game rules come from the bundled src/lib/online/live.ts
// (see scripts/build-edge.mjs); this file only does auth, loading, saving and concurrency.
//
// POST { action: "create", game, settings? }        -> { id, code }
// POST { action: "join", code }                      -> { id }
// POST { action: "settings", id, settings }          (host, lobby only)
// POST { action: "start", id }                       (host)
// POST { action: "move", id, move }                  move: see Move in live.ts
// POST { action: "leave", id }
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { applyMove, cleanBlackjack, cleanPoker, LiveError, MAX_PLAYERS, startGame } from "../_shared/live.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: auth } = await db.auth.getUser(token);
    const user = auth?.user;
    if (!user) throw new HttpError(401, "Sign in to play with friends");
    const body = (await req.json().catch(() => ({}))) as Row;

    switch (body.action) {
      case "create":
        return json(await create(db, user.id, body));
      case "join":
        return json(await join(db, user.id, String(body.code ?? "")));
      case "settings":
        return json(await updateSettings(db, user.id, String(body.id), body.settings ?? {}));
      case "start":
        return json(await start(db, user.id, String(body.id)));
      case "move":
        return json(await move(db, user.id, String(body.id), body.move));
      case "leave":
        return json(await leave(db, user.id, String(body.id)));
      default:
        throw new HttpError(400, "Unknown action");
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof LiveError) return json({ error: e.message }, 409);
    console.error(e);
    return json({ error: "Something went wrong at the table" }, 500);
  }
});

async function nameOf(db: SupabaseClient, user: string): Promise<string> {
  const { data } = await db.from("profiles").select("name").eq("id", user).maybeSingle();
  return (data?.name as string | undefined) ?? "Player";
}

async function loadTable(db: SupabaseClient, id: string): Promise<Row> {
  const { data, error } = await db.from("live_tables").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "That table doesn't exist");
  return data;
}

async function loadSeats(db: SupabaseClient, id: string): Promise<Row[]> {
  const { data, error } = await db.from("live_seats").select("*").eq("table_id", id).order("seat");
  if (error) throw error;
  return data ?? [];
}

async function create(db: SupabaseClient, user: string, body: Row) {
  const game = body.game === "blackjack" ? "blackjack" : body.game === "poker" ? "poker" : null;
  if (!game) throw new HttpError(400, "Pick poker or blackjack");
  const settings = game === "poker" ? cleanPoker(body.settings ?? {}) : cleanBlackjack(body.settings ?? {});

  // one open table per host
  await db.from("live_tables").update({ status: "closed" }).eq("host", user).eq("status", "lobby");

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const { data, error } = await db.from("live_tables").insert({ code, game, host: user, settings }).select("id, code").single();
    if (error?.code === "23505") continue; // code taken
    if (error) throw error;
    const { error: seatError } = await db.from("live_seats").insert({ table_id: data.id, user_id: user, seat: 0, name: await nameOf(db, user) });
    if (seatError) throw seatError;
    return data;
  }
  throw new HttpError(503, "Couldn't open a table. Try again");
}

async function join(db: SupabaseClient, user: string, code: string) {
  const { data: t } = await db.from("live_tables").select("*").eq("code", code.trim().toUpperCase()).neq("status", "closed").maybeSingle();
  if (!t) throw new HttpError(404, "No open table with that code");
  const seats = await loadSeats(db, t.id);
  if (seats.some((s) => s.user_id === user)) return { id: t.id };
  if (t.status !== "lobby") throw new HttpError(409, "That game has already started");
  if (seats.length >= MAX_PLAYERS[t.game as "poker" | "blackjack"]) throw new HttpError(409, "That table is full");
  const taken = new Set(seats.map((s) => s.seat));
  const seat = [0, 1, 2, 3, 4, 5].find((n) => !taken.has(n))!;
  const { error } = await db.from("live_seats").insert({ table_id: t.id, user_id: user, seat, name: await nameOf(db, user) });
  if (error?.code === "23505") throw new HttpError(409, "Someone took that seat. Try again");
  if (error) throw error;
  return { id: t.id };
}

async function updateSettings(db: SupabaseClient, user: string, id: string, settings: Row) {
  const t = await loadTable(db, id);
  if (t.host !== user) throw new HttpError(403, "Only the host can change the table");
  if (t.status !== "lobby") throw new HttpError(409, "The game has started");
  const clean = t.game === "poker" ? cleanPoker({ ...t.settings, ...settings }) : cleanBlackjack({ ...t.settings, ...settings });
  const { error } = await db.from("live_tables").update({ settings: clean, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return { settings: clean };
}

/** Save an outcome. Fails with a conflict when someone else moved first (`version` changed). */
async function save(db: SupabaseClient, id: string, version: number, out: Row, status: string) {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("live_tables")
    .update({
      public: out.public,
      status,
      version: version + 1,
      deadline: out.deadline ? new Date(out.deadline).toISOString() : null,
      updated_at: now,
    })
    .eq("id", id)
    .eq("version", version)
    .select("id");
  if (error) throw error;
  if (!data?.length) return false;

  const writes = [
    db.from("table_secrets").upsert({ table_id: id, state: out.secret }),
    db.from("live_private").upsert(Object.entries(out.private).map(([user_id, d]) => ({ table_id: id, user_id, data: d, updated_at: now }))),
  ];
  if (out.hands.length) {
    writes.push(db.from("live_hands").upsert(out.hands.map((h: Row) => ({ table_id: id, hand_no: h.handNo, record: { game: h.game, ...h.record } }))));
  }
  for (const r of await Promise.all(writes)) if (r.error) throw r.error;
  return true;
}

async function start(db: SupabaseClient, user: string, id: string) {
  const t = await loadTable(db, id);
  if (t.host !== user) throw new HttpError(403, "Only the host can start");
  if (t.status !== "lobby") throw new HttpError(409, "Already started");
  const seats = (await loadSeats(db, id)).filter((s) => !s.left_at);
  const out = startGame(t.game, t.settings, seats.map((s) => ({ user: s.user_id, seat: s.seat, name: s.name })), rand, Date.now());
  if (!(await save(db, id, t.version, out, out.closed ? "closed" : "playing"))) throw new HttpError(409, "The table changed. Try again");
  return { ok: true };
}

async function move(db: SupabaseClient, user: string, id: string, m: Row) {
  if (!m || typeof m.kind !== "string") throw new HttpError(400, "Missing move");
  for (let attempt = 0; attempt < 3; attempt++) {
    const t = await loadTable(db, id);
    if (t.status !== "playing") throw new HttpError(409, t.status === "closed" ? "The table is closed" : "The game hasn't started");
    const { data: sec } = await db.from("table_secrets").select("state").eq("table_id", id).single();
    const out = applyMove(sec!.state, m, user, rand, Date.now());
    if (await save(db, id, t.version, out, out.closed ? "closed" : "playing")) return { ok: true };
  }
  throw new HttpError(409, "The table is busy. Try again");
}

async function leave(db: SupabaseClient, user: string, id: string) {
  const t = await loadTable(db, id);
  if (t.status === "lobby") {
    if (t.host === user) {
      await db.from("live_tables").update({ status: "closed" }).eq("id", id);
    } else {
      await db.from("live_seats").delete().eq("table_id", id).eq("user_id", user);
    }
    return { ok: true };
  }
  await db.from("live_seats").update({ left_at: new Date().toISOString() }).eq("table_id", id).eq("user_id", user);
  if (t.status === "playing") {
    try {
      await move(db, user, id, { kind: "leave" });
    } catch (e) {
      if (!(e instanceof LiveError) && !(e instanceof HttpError)) throw e;
    }
  }
  return { ok: true };
}
