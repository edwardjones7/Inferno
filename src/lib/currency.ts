/**
 * Paper currencies. Every amount is stored as an integer number of base units
 * (1 coin = 1e8 units, satoshi-style) so ledger math never touches floats.
 * Prices are fixed paper prices used to show USD equivalents and size chips.
 */
export const UNITS = 100_000_000;

export const CURRENCIES = {
  BTC: { code: "BTC", name: "Bitcoin", usd: 97_000, decimals: 8, color: "#F7931A" },
  ETH: { code: "ETH", name: "Ethereum", usd: 3_400, decimals: 6, color: "#8C8CF7" },
  SOL: { code: "SOL", name: "Solana", usd: 180, decimals: 4, color: "#14F195" },
  USDT: { code: "USDT", name: "Tether", usd: 1, decimals: 2, color: "#26A17B" },
} as const;

export type Currency = keyof typeof CURRENCIES;
export const CURRENCY_CODES = Object.keys(CURRENCIES) as Currency[];
export const isCurrency = (v: unknown): v is Currency => typeof v === "string" && v in CURRENCIES;

export const STARTING_USD = 2_500;
export const FAUCET_USD = 500;
export const FAUCET_COOLDOWN_MS = 4 * 60 * 60 * 1000;
export const MIN_BET_USD = 1;
export const MAX_BET_USD = 5_000;

export const usdToUnits = (usd: number, c: Currency) => Math.round((usd / CURRENCIES[c].usd) * UNITS);
export const unitsToUsd = (units: number, c: Currency) => (units / UNITS) * CURRENCIES[c].usd;

export function formatCoin(units: number, c: Currency): string {
  const { decimals } = CURRENCIES[c];
  return (units / UNITS).toLocaleString("en-US", {
    minimumFractionDigits: c === "USDT" ? 2 : Math.min(decimals, 4),
    maximumFractionDigits: decimals,
  });
}

export function formatUsd(usd: number, opts: { sign?: boolean; compact?: boolean } = {}): string {
  const abs = Math.abs(usd);
  const body = opts.compact && abs >= 10_000
    ? `$${(abs / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`
    : `$${abs.toLocaleString("en-US", { minimumFractionDigits: abs % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  if (usd < 0) return `-${body}`;
  return opts.sign && usd > 0 ? `+${body}` : body;
}
