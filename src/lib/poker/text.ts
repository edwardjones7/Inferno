/** The hero's seat is named "You", so engine log lines need second-person verbs. */
const VERBS: Record<string, string> = {
  has: "have",
  posts: "post",
  wins: "win",
  folds: "fold",
  checks: "check",
  calls: "call",
  raises: "raise",
  bets: "bet",
  shows: "show",
};

export function youText(text: string): string {
  return text.replace(/\bYou (has|posts|wins|folds|checks|calls|raises|bets|shows)\b/g, (_, v: string) => `You ${VERBS[v]}`);
}
