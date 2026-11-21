"use client";

import { useState } from "react";
import { toast } from "sonner";
import { IconCloud } from "@/components/icons";
import { oauthProviders, sendCode, signInWith, verifyCode } from "@/lib/online/account";
import { errorText } from "@/lib/online/client";

/**
 * Email-code sign-in: type your email, get a 6-digit code, type it in. No password, no
 * redirect (which matters inside the iOS/Android shells). Google and Apple on the web.
 */
export function SignInCard({ title = "Sign in to play with friends", why }: { title?: string; why?: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const providers = oauthProviders();

  const send = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast.error("That email doesn't look right");
    setBusy(true);
    try {
      await sendCode(email);
      setSent(true);
      toast.success("Code sent", { description: `Check ${email.trim()}` });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      await verifyCode(email, code);
      toast.success("Signed in");
    } catch (e) {
      toast.error(errorText(e, "That code didn't work. Check it, or send a new one."));
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (p: "google" | "apple") => {
    try {
      await signInWith(p);
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const input = "h-11 w-full rounded-xl border border-ash-700 bg-ash-950 px-3 text-[15px] font-semibold text-bone outline-none placeholder:text-ash-600 focus:border-ember-500";

  return (
    <div className="panel relative overflow-hidden rounded-3xl p-5">
      <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[radial-gradient(closest-side,rgba(255,154,46,0.18),transparent)]" />
      <div className="relative flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ember-500/12 text-ember-300 ring-1 ring-ember-500/40">
          <IconCloud className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-base font-bold text-bone">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ash-400">
            {why ?? "An account backs up your progress and lets you add friends, join a league and sit at a table together. Playing alone never needs one."}
          </p>
        </div>
      </div>

      {!sent ? (
        <form
          className="relative mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" className={input} />
          <button disabled={busy} className="btn-fire h-11 shrink-0 rounded-xl px-4 text-sm font-bold disabled:opacity-60">
            {busy ? "…" : "Send code"}
          </button>
        </form>
      ) : (
        <form
          className="relative mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <p className="mb-2 text-xs text-ash-400">
            Enter the 6-digit code we sent to <span className="font-semibold text-bone">{email.trim()}</span>.
          </p>
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-label="Sign-in code"
              className={`${input} tabular tracking-[0.3em]`}
            />
            <button disabled={busy || code.length < 6} className="btn-fire h-11 shrink-0 rounded-xl px-4 text-sm font-bold disabled:opacity-60">
              {busy ? "…" : "Sign in"}
            </button>
          </div>
          <button type="button" onClick={() => setSent(false)} className="mt-2 text-xs font-semibold text-ash-400 underline-offset-2 hover:text-bone hover:underline">
            Use a different email
          </button>
        </form>
      )}

      {providers.length > 0 && !sent && (
        <div className="relative mt-3">
          <p className="mb-2 text-center text-[11px] font-semibold text-ash-500">or continue with</p>
          <div className={`grid gap-2 ${providers.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {providers.map((p) => (
              <button key={p} onClick={() => void oauth(p)} className="btn-ash h-10 rounded-xl text-xs font-bold">
                {p === "google" ? "Google" : "Apple"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
