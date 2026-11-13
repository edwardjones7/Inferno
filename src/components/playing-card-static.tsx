import { isRed, RANK_LABEL, rankOf, SUIT_SYMBOL, suitOf, type Card } from "@/lib/blackjack/cards";

/** Server-renderable card for decoration and history (no animation). */
export function PlayingCardStatic({ card, large = false, small = false }: { card: Card; large?: boolean; small?: boolean }) {
  if (small) return <SmallCard card={card} />;
  const rank = RANK_LABEL(rankOf(card));
  const suit = SUIT_SYMBOL[suitOf(card)];
  return (
    <div
      className={`relative overflow-hidden font-display ${isRed(card) ? "text-ember-600" : "text-ash-950"} ${
        large ? "h-[210px] w-[150px] rounded-2xl" : "h-[120px] w-[86px] rounded-[10px]"
      }`}
      style={{
        background: "linear-gradient(160deg, #fffaf2 0%, #f6ecdf 55%, #ead9c6 100%)",
        boxShadow: "0 24px 40px -16px rgba(0,0,0,.95), 0 0 50px -20px rgba(255,90,31,.6), inset 0 0 0 1px rgba(80,40,20,.15)",
      }}
    >
      <div className={`absolute flex flex-col items-center leading-none ${large ? "left-3 top-3" : "left-2 top-2"}`}>
        <span className={`font-bold ${large ? "text-3xl" : "text-xl"}`}>{rank}</span>
        <span className={large ? "text-2xl" : "text-lg"}>{suit}</span>
      </div>
      <div className={`absolute flex rotate-180 flex-col items-center leading-none ${large ? "bottom-3 right-3" : "bottom-2 right-2"}`}>
        <span className={`font-bold ${large ? "text-3xl" : "text-xl"}`}>{rank}</span>
        <span className={large ? "text-2xl" : "text-lg"}>{suit}</span>
      </div>
      <span className={`absolute inset-0 grid place-items-center ${large ? "text-7xl" : "text-[44px]"}`}>{suit}</span>
    </div>
  );
}

export function MiniCard({ card }: { card: Card }) {
  return (
    <span
      className={`inline-flex h-7 w-5 flex-col items-center justify-center rounded-[3px] bg-[#f6ecdf] font-display text-[9px] font-bold leading-none ${
        isRed(card) ? "text-ember-600" : "text-ash-950"
      }`}
    >
      {RANK_LABEL(rankOf(card))}
      <span className="text-[8px]">{SUIT_SYMBOL[suitOf(card)]}</span>
    </span>
  );
}

/** Compact card for poker boards and hands (60×84 on desktop, 44×62 on phones). */
function SmallCard({ card }: { card: Card }) {
  const rank = RANK_LABEL(rankOf(card));
  const suit = SUIT_SYMBOL[suitOf(card)];
  return (
    <div
      className={`relative h-[62px] w-[44px] overflow-hidden rounded-[7px] font-display sm:h-[84px] sm:w-[60px] sm:rounded-[9px] ${
        isRed(card) ? "text-ember-600" : "text-ash-950"
      }`}
      style={{
        background: "linear-gradient(160deg, #fffaf2 0%, #f6ecdf 55%, #ead9c6 100%)",
        boxShadow: "0 14px 24px -12px rgba(0,0,0,.9), inset 0 0 0 1px rgba(80,40,20,.15)",
      }}
    >
      <div className="absolute left-1 top-1 flex flex-col items-center leading-none sm:left-1.5 sm:top-1.5">
        <span className="text-sm font-bold sm:text-lg">{rank}</span>
        <span className="text-xs sm:text-sm">{suit}</span>
      </div>
      <span className="absolute inset-0 grid place-items-center pt-3 text-xl sm:text-3xl">{suit}</span>
    </div>
  );
}
