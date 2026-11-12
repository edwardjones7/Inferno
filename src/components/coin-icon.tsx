import { CURRENCIES, type Currency } from "@/lib/currency";

const GLYPH: Record<Currency, string> = { BTC: "₿", ETH: "Ξ", SOL: "◎", USDT: "₮" };

export function CoinIcon({ currency, size = 18 }: { currency: Currency; size?: number }) {
  const color = CURRENCIES[currency].color;
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full font-bold leading-none text-ash-950"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.62,
        background: `radial-gradient(circle at 35% 30%, #fff8, transparent 55%), ${color}`,
        boxShadow: `0 0 10px -2px ${color}`,
      }}
    >
      {GLYPH[currency]}
    </span>
  );
}
