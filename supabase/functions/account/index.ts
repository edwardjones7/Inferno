// Account deletion (required by the App Store for apps that create accounts). Deleting the
// auth user cascades to every row that belongs to it: profile, friend code, backup, friends,
// daily stats, leagues, shared hands and table seats.
//
// POST { action: "delete" }
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data } = await db.auth.getUser(token);
    if (!data?.user) return json({ error: "Sign in first" }, 401);
    const body = await req.json().catch(() => ({}));
    if (body.action !== "delete") return json({ error: "Unknown action" }, 400);
    const { error } = await db.auth.admin.deleteUser(data.user.id);
    if (error) throw error;
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "Couldn't delete the account. Try again" }, 500);
  }
});
