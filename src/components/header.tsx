"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { faucetAction } from "@/app/actions";
import { CoinIcon } from "@/components/coin-icon";
import { Wordmark } from "@/components/logo";
import { Odometer, useTrend } from "@/components/odometer";
import { useWallet } from "@/components/wallet-provider";
import { CURRENCIES, CURRENCY_CODES, FAUCET_USD, formatCoin, formatUsd, unitsToUsd } from "@/lib/currency";
import { isMuted, onMuteChange, play, setMuted } from "@/lib/sound";

const NAV = [
  { href: "/", label: "Lobby" },
  { href: "/blackjack", label: "Blackjack" },
  { href: "/trainer", label: "Trainer" },
  { href: "/poker", label: "Poker" },
  { href: "/fairness", label: "Fairness" },
  { href: "/profile", label: "Profile" },
];

export function Header() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-ash-700/60 bg-ash-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
        <Link href="/" aria-label="Inferno home" className="shrink-0">
          <Wordmark />
        </Link>
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <NavLink key={n.href} {...n} active={n.href === "/" ? path === "/" : path.startsWith(n.href)} />
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <FaucetButton />
          <WalletPill />
          <MuteButton />
        </div>
      </div>
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-ash-800 px-3 py-1.5 md:hidden">
        {NAV.map((n) => (
          <NavLink key={n.href} {...n} active={n.href === "/" ? path === "/" : path.startsWith(n.href)} />
        ))}
      </nav>
    </header>
  );
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`relative rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
        active ? "text-bone" : "text-ash-400 hover:text-ash-200"
      }`}
    >
      {label}
      {active && (
        <span className="absolute inset-x-3 -bottom-[3px] h-[2px] rounded-full bg-gradient-to-r from-ember-700 via-ember-400 to-ember-700 shadow-[0_0_10px_rgba(255,122,31,0.9)]" />
      )}
    </Link>
  );
}

function WalletPill() {
  const { wallet, currency, setCurrency, ready } = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trend = useTrend(wallet ? wallet[currency] : null, currency);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!ready || !wallet) {
    return <div className="h-10 w-44 animate-pulse rounded-xl bg-ash-800" />;
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="relative flex h-10 items-center gap-1.5 rounded-xl border border-ash-600/70 bg-ash-900 px-2.5 sm:gap-2 sm:pr-3 transition-colors hover:border-ember-500/60"
      >
        <CoinIcon currency={currency} />
        <span className="tabular text-sm font-semibold text-bone">
          <Odometer value={formatCoin(wallet[currency], currency)} trend={trend} />
          <span className="sr-only" aria-live="polite" aria-atomic>
            {formatCoin(wallet[currency], currency)} {currency}
          </span>
        </span>
        <span className="hidden text-xs text-ash-400 sm:inline">≈ {formatUsd(unitsToUsd(wallet[currency], currency))}</span>
        <svg viewBox="0 0 12 12" className={`hidden h-3 w-3 text-ash-400 transition-transform sm:block ${open ? "rotate-180" : ""}`}>
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      {open && (
        <div role="listbox" className="panel absolute right-0 top-12 w-72 animate-rise rounded-2xl p-2">
          <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-widest text-ash-400">Paper wallet</p>
          {CURRENCY_CODES.map((c) => (
            <button
              key={c}
              role="option"
              aria-selected={c === currency}
              onClick={() => {
                setCurrency(c);
                setOpen(false);
                play("click");
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${
                c === currency ? "bg-ember-500/10 ring-1 ring-ember-500/40" : "hover:bg-ash-800"
              }`}
            >
              <CoinIcon currency={c} size={22} />
              <span className="flex-1">
                <span className="block text-sm font-semibold">{c}</span>
                <span className="block text-xs text-ash-400">{CURRENCIES[c].name}</span>
              </span>
              <span className="text-right">
                <span className="tabular block text-sm">{formatCoin(wallet[c], c)}</span>
                <span className="tabular block text-xs text-ash-400">{formatUsd(unitsToUsd(wallet[c], c))}</span>
              </span>
            </button>
          ))}
          <p className="px-2 pt-2 text-[11px] leading-relaxed text-ash-500">
            Paper funds only. No deposits, no withdrawals, no real value.
          </p>
        </div>
      )}
    </div>
  );
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [intervalMs]);
  return now;
}

function FaucetButton() {
  const { ready, currency, faucetReadyAt, setWallet, setFaucetReadyAt } = useWallet();
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  if (!ready || !now) return null;
  const wait = Math.max(0, faucetReadyAt - now);
  const label = wait
    ? `${Math.floor(wait / 3_600_000)}h ${String(Math.floor((wait % 3_600_000) / 60_000)).padStart(2, "0")}m`
    : `+${formatUsd(FAUCET_USD)}`;

  return (
    <button
      disabled={busy || wait > 0}
      aria-label={wait ? "Faucet cooling down" : "Claim free paper funds"}
      title={wait ? "The forge is cooling down" : `Claim ${formatUsd(FAUCET_USD)} of free paper ${currency}`}
      onClick={async () => {
        setBusy(true);
        const res = await faucetAction(currency);
        setBusy(false);
        if (!res.ok) return void toast.error(res.error);
        setWallet(res.data.wallet);
        setFaucetReadyAt(res.data.faucetReadyAt);
        play("win");
        toast.success(`Forged ${formatUsd(FAUCET_USD)} in paper ${currency}`);
      }}
      className={`flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-bold sm:px-3 ${wait ? "btn-ash" : "btn-fire"}`}
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
        <path fill="currentColor" d="M8.4 1c.4 2.3-.7 3.5-1.8 4.8C5.6 7 4.5 8.2 4.5 10.1a3.5 3.5 0 0 0 7 0c0-2.7-2-4.1-2.8-6.1C8.3 2.9 8.1 2 8.4 1Z" />
      </svg>
      <span className="tabular hidden sm:inline">{label}</span>
    </button>
  );
}

function MuteButton() {
  const muted = useSyncExternalStore(onMuteChange, isMuted, () => false);
  return (
    <button
      onClick={() => setMuted(!muted)}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      className="btn-ash grid h-10 w-10 place-items-center rounded-xl"
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
        <path fill="currentColor" d="M3 8h3l4-4v12l-4-4H3z" />
        {muted ? (
          <path d="M13 7l5 6M18 7l-5 6" stroke="currentColor" strokeWidth="1.6" fill="none" />
        ) : (
          <path d="M13 7a4 4 0 0 1 0 6M15 5a7 7 0 0 1 0 10" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}
