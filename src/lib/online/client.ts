"use client";

/** The one Supabase client, created on first use in the browser (never during the static build). */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "./config";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (typeof window === "undefined") throw new Error("Supabase is browser-only in this app");
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "inferno:auth" },
  });
  return client;
}

/** Errors from Supabase as one readable line for a toast. */
export function errorText(e: unknown, fallback = "Couldn't reach the server. Check your connection."): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    const m = (e as { message: string }).message;
    if (/fetch|network|Failed to/i.test(m)) return fallback;
    return m;
  }
  return fallback;
}
