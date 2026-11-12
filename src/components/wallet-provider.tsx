"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { accountAction } from "@/app/actions";
import { CURRENCY_CODES, isCurrency, unitsToUsd, type Currency } from "@/lib/currency";
import { useStored } from "@/lib/use-stored";

type Wallet = Record<Currency, number>;

interface WalletCtx {
  ready: boolean;
  name: string;
  wallet: Wallet | null;
  currency: Currency;
  faucetReadyAt: number;
  setCurrency: (c: Currency) => void;
  setWallet: (w: Wallet) => void;
  setFaucetReadyAt: (t: number) => void;
  refresh: () => Promise<void>;
  /** current balance in the selected currency, as USD */
  balanceUsd: number;
}

const Ctx = createContext<WalletCtx | null>(null);
const CURRENCY_KEY = "inferno:currency";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [name, setName] = useState("");
  const [faucetReadyAt, setFaucetReadyAt] = useState(0);
  const [currency, setCurrency] = useStored<Currency>(CURRENCY_KEY, "USDT", isCurrency);

  const apply = useCallback((res: Awaited<ReturnType<typeof accountAction>>) => {
    if (!res.ok) return;
    setWallet(res.data.wallet);
    setName(res.data.name);
    setFaucetReadyAt(res.data.faucetReadyAt);
  }, []);
  const refresh = useCallback(() => accountAction().then(apply), [apply]);

  useEffect(() => {
    accountAction().then(apply);
  }, [apply]);

  const value = useMemo<WalletCtx>(
    () => ({
      ready: wallet !== null,
      name,
      wallet,
      currency,
      faucetReadyAt,
      setCurrency,
      setWallet,
      setFaucetReadyAt,
      refresh,
      balanceUsd: wallet ? unitsToUsd(wallet[currency], currency) : 0,
    }),
    [wallet, name, currency, faucetReadyAt, setCurrency, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}

export const totalUsd = (w: Wallet) => CURRENCY_CODES.reduce((n, c) => n + unitsToUsd(w[c], c), 0);
