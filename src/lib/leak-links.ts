/**
 * Where to send the player to practise a missed spot, from its game/kind/key. Shared by the
 * Train hub, the review queue and anything else that lists leaks.
 */
const COUNTING_KINDS = new Set(["count", "truecount", "index"]);
const CHART_KEY = /^(hard|soft|pair)-\d{1,2}-\d{1,2}$/;

export const isCountingKind = (kind: string) => COUNTING_KINDS.has(kind);

export function leakHref(l: { game: "blackjack" | "poker"; kind: string; key: string }): string {
  if (l.game === "poker") {
    const pos = /^pre-(UTG|HJ|CO|BTN|SB)-/.exec(l.key)?.[1];
    if (pos) return `/train/poker/?drill=preflop&pos=${pos}`;
    const resp = /^(vo|v3)-(UTG|HJ|CO|BTN|SB|BB)-(UTG|HJ|CO|BTN|SB|BB)-/.exec(l.key);
    if (resp) return `/train/poker/?drill=${resp[1] === "vo" ? "vsopen" : "vs3bet"}&pos=${resp[2]}&vs=${resp[3]}`;
    return `/train/poker/?drill=${l.kind}`;
  }
  if (isCountingKind(l.kind)) return "/train/counting/";
  return CHART_KEY.test(l.key) ? `/train/blackjack/?spot=${l.key}` : "/train/blackjack/";
}
