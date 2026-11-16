/**
 * Practice chips. Nothing here has real-world value; chips only measure how well you play.
 * Blackjack amounts are stored as integer cents of a chip (`CHIP_UNITS` per chip) so 3:2
 * payouts on odd bets never touch floats.
 */
export const CHIP_UNITS = 100;

export const STARTING_CHIPS = 2_500;
/** Refills top the balance back up to this many chips. */
export const REFILL_TO = 2_500;
export const MIN_BET = 1;
export const MAX_BET = 5_000;

export const chipsToUnits = (chips: number) => Math.round(chips * CHIP_UNITS);
export const unitsToChips = (units: number) => units / CHIP_UNITS;

export function formatChips(chips: number, opts: { sign?: boolean; compact?: boolean } = {}): string {
  const abs = Math.abs(chips);
  const body =
    opts.compact && abs >= 10_000
      ? `${(abs / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`
      : abs.toLocaleString("en-US", { minimumFractionDigits: abs % 1 ? 2 : 0, maximumFractionDigits: 2 });
  if (chips < 0) return `−${body}`;
  return opts.sign && chips > 0 ? `+${body}` : body;
}
