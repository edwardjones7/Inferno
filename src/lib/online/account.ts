"use client";

/**
 * Optional accounts. Nothing in the app needs one: an account adds cloud backup, friends,
 * leagues and live tables. Sign-in is by a 6-digit email code (works the same in the browser
 * and inside the iOS/Android shells, where web redirects are awkward); Google and Apple are
 * offered on the web once they're enabled in the Supabase dashboard.
 */
import { Capacitor } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { getProgress } from "../store";
import { supabase } from "./client";

export interface Account {
  status: "loading" | "signed-out" | "signed-in";
  userId: string | null;
  email: string | null;
}

const SERVER: Account = { status: "loading", userId: null, email: null };
let state: Account = SERVER;
let started = false;
const listeners = new Set<() => void>();

function set(next: Account) {
  if (next.status === state.status && next.userId === state.userId && next.email === state.email) return;
  state = next;
  listeners.forEach((l) => l());
}

const fromSession = (s: Session | null): Account =>
  s?.user ? { status: "signed-in", userId: s.user.id, email: s.user.email ?? null } : { status: "signed-out", userId: null, email: null };

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const sb = supabase();
  sb.auth
    .getSession()
    .then(({ data }) => set(fromSession(data.session)))
    .catch(() => set({ status: "signed-out", userId: null, email: null }));
  sb.auth.onAuthStateChange((_event, session) => set(fromSession(session)));
}

function subscribe(l: () => void) {
  start();
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAccount(): Account {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}

export const currentAccount = () => state;

/** Email a 6-digit sign-in code. New emails get an account on the spot. */
export async function sendCode(email: string): Promise<void> {
  const { error } = await supabase().auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true, data: { name: getProgress().name } },
  });
  if (error) throw error;
}

export async function verifyCode(email: string, code: string): Promise<void> {
  const { error } = await supabase().auth.verifyOtp({ email: email.trim(), token: code.replace(/\D/g, ""), type: "email" });
  if (error) throw error;
}

/**
 * Google and Apple sign-in redirect through the browser, so they're web-only for now, and
 * only shown once the providers are switched on in Supabase (Authentication > Providers)
 * and listed in NEXT_PUBLIC_OAUTH_PROVIDERS, e.g. "google,apple".
 */
const PROVIDERS = (process.env.NEXT_PUBLIC_OAUTH_PROVIDERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
export const oauthProviders = (): ("google" | "apple")[] =>
  typeof window === "undefined" || Capacitor.isNativePlatform() ? [] : (PROVIDERS.filter((p) => p === "google" || p === "apple") as ("google" | "apple")[]);

export async function signInWith(provider: "google" | "apple"): Promise<void> {
  const { error } = await supabase().auth.signInWithOAuth({ provider, options: { redirectTo: `${location.origin}/profile/` } });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase().auth.signOut();
}

/** Delete the account and everything stored online for it. Progress on this device stays. */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase().functions.invoke("account", { body: { action: "delete" } });
  if (error) throw error;
  await supabase().auth.signOut();
}
