/**
 * Daily and weekly challenges, and what's claimable (which decides the comeback grant).
 * Amounts, caps and the tuning rationale live in economy.ts; this file holds the pool.
 *
 * Progress is never tracked separately: it's measured from the activity the store already
 * keeps (hands, drill answers, lessons, puzzles, matches) inside the period's time window,
 * so it can't drift from what the player actually did. Only claimed keys are stored.
 */
import { LESSONS } from "./learn";
import type { Progress } from "./store";
import {
  addDays,
  CHALLENGE_REWARDS,
  checkInStatus,
  COMEBACK_BELOW,
  COMEBACK_COOLDOWN_MS,
  COMEBACK_GRANT,
  dayKey,
  EconomyError,
  grantChips,
  netWorth,
  proGrants,
  startOfDay,
  startOfWeek,
  type Wallet,
} from "./economy";

/* ------------------------------------------------------------------ challenges */

export type Period = "day" | "week";
type Group = "learn" | "skill" | "volume";

type Activity = Pick<Progress, "bjRounds" | "drills" | "pokerHands" | "matches" | "lessons" | "daily" | "days">;

interface Span {
  from: number;
  to: number;
  /** the calendar days in the window */
  days: string[];
}

export interface ChallengeDef {
  id: string;
  period: Period;
  group: Group;
  game: "blackjack" | "poker" | "both";
  title: string;
  /** a line of why it matters or how it counts */
  detail: string;
  target: number;
  reward: number;
  measure: (a: Activity, w: Span) => number;
  /** whether it can still be done; checked against activity before the period began */
  possible?: (a: Activity, from: number) => boolean;
  href: string;
}

const inWin = (at: number, w: Span) => at >= w.from && at < w.to;
const rounds = (a: Activity, w: Span) => a.bjRounds.filter((r) => inWin(r.at, w));
const pokerHands = (a: Activity, w: Span) => a.pokerHands.filter((h) => inWin(h.at, w));
const lessonsLeft = (a: Activity, before: number) => LESSONS.filter((l) => !(a.lessons[l.id] && a.lessons[l.id] < before)).length;

function longestRun(oks: boolean[]): number {
  let run = 0;
  let best = 0;
  for (const ok of oks) {
    run = ok ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

const bjStreak = (a: Activity, w: Span) => longestRun(rounds(a, w).flatMap((r) => r.decisions.map((d) => d.ok)));
const bjClean = (a: Activity, w: Span) => rounds(a, w).filter((r) => r.decisions.length > 0 && r.decisions.every((d) => d.ok)).length;
const drillsRight = (a: Activity, w: Span) => a.drills.filter((d) => d.ok && inWin(d.at, w)).length;
const lessonsDone = (a: Activity, w: Span) => Object.values(a.lessons).filter((t) => inWin(t, w)).length;
const coachAgrees = (a: Activity, w: Span) => pokerHands(a, w).reduce((n, h) => n + h.notes.filter((x) => x.ok === true).length, 0);
const bigHands = (bb: number) => (a: Activity, w: Span) => pokerHands(a, w).filter((h) => h.net >= bb * h.bb).length;

const R = CHALLENGE_REWARDS;

export const CHALLENGES: ChallengeDef[] = [
  // ---- daily
  {
    id: "d-lesson",
    period: "day",
    group: "learn",
    game: "both",
    title: "Finish a lesson",
    detail: "Any lesson on the Learn path.",
    target: 1,
    reward: R.day.lesson,
    measure: lessonsDone,
    possible: (a, from) => lessonsLeft(a, from) >= 1,
    href: "/train/learn/",
  },
  {
    id: "d-drills",
    period: "day",
    group: "learn",
    game: "both",
    title: "Get 15 drill answers right",
    detail: "Blackjack or poker drills, puzzles and reviews all count.",
    target: 15,
    reward: R.day.learn,
    measure: drillsRight,
    href: "/train/",
  },
  {
    id: "d-daily",
    period: "day",
    group: "learn",
    game: "both",
    title: "Answer today's three puzzles",
    detail: "One blackjack spot and two poker spots.",
    target: 3,
    reward: R.day.learn,
    measure: (a, w) => w.days.reduce((n, d) => n + (a.daily[d]?.length ?? 0), 0),
    href: "/train/daily/",
  },
  {
    id: "d-bj-streak",
    period: "day",
    group: "skill",
    game: "blackjack",
    title: "Make 10 right blackjack plays in a row",
    detail: "Live decisions at the table, graded against basic strategy.",
    target: 10,
    reward: R.day.skill,
    measure: bjStreak,
    href: "/play/blackjack/",
  },
  {
    id: "d-bj-clean",
    period: "day",
    group: "skill",
    game: "blackjack",
    title: "Play 8 blackjack hands without a mistake",
    detail: "Every decision in the hand matches basic strategy.",
    target: 8,
    reward: R.day.skillEasy,
    measure: bjClean,
    href: "/play/blackjack/",
  },
  {
    id: "d-pk-coach",
    period: "day",
    group: "skill",
    game: "poker",
    title: "Make 8 poker plays the coach agrees with",
    detail: "Any poker table: cash game or heads-up.",
    target: 8,
    reward: R.day.skill,
    measure: coachAgrees,
    href: "/play/poker/table/",
  },
  {
    id: "d-pk-pot",
    period: "day",
    group: "skill",
    game: "poker",
    title: "Win 20 big blinds in one hand",
    detail: "Net profit on a single hand, any poker table.",
    target: 1,
    reward: R.day.skill,
    measure: bigHands(20),
    href: "/play/poker/table/",
  },
  {
    id: "d-bj-hands",
    period: "day",
    group: "volume",
    game: "blackjack",
    title: "Play 20 blackjack hands",
    detail: "Any table, any bet.",
    target: 20,
    reward: R.day.volume,
    measure: (a, w) => rounds(a, w).length,
    href: "/play/blackjack/",
  },
  {
    id: "d-pk-hands",
    period: "day",
    group: "volume",
    game: "poker",
    title: "Play 25 poker hands",
    detail: "Cash game or heads-up.",
    target: 25,
    reward: R.day.volume,
    measure: (a, w) => pokerHands(a, w).length,
    href: "/play/poker/table/",
  },
  // ---- weekly
  {
    id: "w-lessons",
    period: "week",
    group: "learn",
    game: "both",
    title: "Finish 3 lessons",
    detail: "Work through the Learn path, either game.",
    target: 3,
    reward: R.week.lessons,
    measure: lessonsDone,
    possible: (a, from) => lessonsLeft(a, from) >= 3,
    href: "/train/learn/",
  },
  {
    id: "w-daily",
    period: "week",
    group: "learn",
    game: "both",
    title: "Solve every daily puzzle on 3 days",
    detail: "All three right on the same day.",
    target: 3,
    reward: R.week.learn,
    measure: (a, w) => w.days.filter((d) => (a.daily[d] ?? []).filter(Boolean).length >= 3).length,
    href: "/train/daily/",
  },
  {
    id: "w-drills",
    period: "week",
    group: "learn",
    game: "both",
    title: "Get 100 drill answers right",
    detail: "Drills, puzzles and your review queue.",
    target: 100,
    reward: R.week.learn,
    measure: drillsRight,
    href: "/train/",
  },
  {
    id: "w-bj-streak",
    period: "week",
    group: "skill",
    game: "blackjack",
    title: "Make 25 right blackjack plays in a row",
    detail: "One mistake resets the run.",
    target: 25,
    reward: R.week.skill,
    measure: bjStreak,
    href: "/play/blackjack/",
  },
  {
    id: "w-pk-pot",
    period: "week",
    group: "skill",
    game: "poker",
    title: "Win 50 big blinds in one hand",
    detail: "Get value from a big hand. Net profit, any poker table.",
    target: 1,
    reward: R.week.skill,
    measure: bigHands(50),
    href: "/play/poker/table/",
  },
  {
    id: "w-match",
    period: "week",
    group: "skill",
    game: "poker",
    title: "Win a heads-up match",
    detail: "Beat any bot on the ladder.",
    target: 1,
    reward: R.week.match,
    measure: (a, w) => a.matches.filter((m) => m.result === "win" && inWin(m.at, w)).length,
    href: "/play/poker/",
  },
  {
    id: "w-pk-coach",
    period: "week",
    group: "skill",
    game: "poker",
    title: "Make 40 poker plays the coach agrees with",
    detail: "Any poker table.",
    target: 40,
    reward: R.week.skill,
    measure: coachAgrees,
    href: "/play/poker/table/",
  },
  {
    id: "w-active",
    period: "week",
    group: "volume",
    game: "both",
    title: "Play or train on 5 days",
    detail: "Anything counts: a hand, a drill, a puzzle.",
    target: 5,
    reward: R.week.active,
    measure: (a, w) => w.days.filter((d) => a.days.includes(d)).length,
    href: "/train/",
  },
  {
    id: "w-hands",
    period: "week",
    group: "volume",
    game: "both",
    title: "Play 100 hands",
    detail: "Blackjack and poker hands both count.",
    target: 100,
    reward: R.week.volume,
    measure: (a, w) => rounds(a, w).length + pokerHands(a, w).length,
    href: "/play/",
  },
];

/** How many challenges each period offers. */
export const CHALLENGES_PER_PERIOD: Record<Period, number> = { day: 3, week: 3 };

export function periodWindow(period: Period, now: Date): Span & { key: string; ends: number } {
  const start = period === "day" ? startOfDay(now) : startOfWeek(now);
  const len = period === "day" ? 1 : 7;
  const end = addDays(start, len);
  const days = Array.from({ length: len }, (_, i) => dayKey(addDays(start, i)));
  return { key: `${period === "day" ? "d" : "w"}${dayKey(start)}`, from: start.getTime(), to: end.getTime(), ends: end.getTime(), days };
}

function hash(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** mulberry32 */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The period's challenges, the same for everyone on that date: one learning challenge, one
 * that rewards good decisions, and a third that is any other kind (so volume is at most one
 * of three). Challenges that can't be done any more (no lessons left) are skipped.
 */
export function pickChallenges(period: Period, now: Date, a?: Activity): ChallengeDef[] {
  const w = periodWindow(period, now);
  const rand = rng(hash(`inferno-challenges:${w.key}`));
  const pool = CHALLENGES.filter((c) => c.period === period).filter((c) => !a || !c.possible || c.possible(a, w.from));
  // Fisher-Yates with the seeded generator
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out: ChallengeDef[] = [];
  const take = (ok: (c: ChallengeDef) => boolean) => {
    const c = pool.find((c) => !out.includes(c) && ok(c));
    if (c) out.push(c);
  };
  take((c) => c.group === "learn");
  take((c) => c.group === "skill");
  // keep the games balanced: if both picks lean one way, prefer the other game for the third
  const games = new Set(out.map((c) => c.game));
  const other = games.has("blackjack") && !games.has("poker") ? "poker" : games.has("poker") && !games.has("blackjack") ? "blackjack" : null;
  if (other) take((c) => c.game === other || c.game === "both");
  while (out.length < CHALLENGES_PER_PERIOD[period] && out.length < pool.length) take(() => true);
  return out.slice(0, CHALLENGES_PER_PERIOD[period]);
}

export interface Challenge extends ChallengeDef {
  /** unique per period, e.g. "d2026-11-17:d-lesson" */
  key: string;
  progress: number;
  done: boolean;
  claimed: boolean;
  /** when the period ends (ms) */
  ends: number;
}

export function challengesFor(period: Period, p: Wallet & Activity, now: Date): Challenge[] {
  const w = periodWindow(period, now);
  return pickChallenges(period, now, p).map((c) => {
    const key = `${w.key}:${c.id}`;
    const progress = Math.min(c.target, c.measure(p, w));
    return { ...c, key, progress, done: progress >= c.target, claimed: p.economy.claimed.includes(key), ends: w.ends };
  });
}

export function claimChallenge(p: Wallet & Activity, key: string, now: Date): number {
  const c = [...challengesFor("day", p, now), ...challengesFor("week", p, now)].find((c) => c.key === key);
  if (!c) throw new EconomyError("That challenge has ended");
  if (c.claimed) throw new EconomyError("Already claimed");
  if (!c.done) throw new EconomyError("Not finished yet");
  // keep only this week's and today's claims
  const keep = new Set([periodWindow("day", now).key, periodWindow("week", now).key]);
  p.economy.claimed = [...p.economy.claimed.filter((k) => keep.has(k.split(":")[0])), key];
  return grantChips(p, c.reward, "challenge", now.getTime(), c.id);
}

/* ------------------------------------------------------------------ comeback */

/** Anything claimable right now besides ads and the comeback itself. */
export function claimableCount(p: Wallet & Activity, now: Date, pro: boolean): number {
  const g = proGrants(p, now, pro);
  const ch = [...challengesFor("day", p, now), ...challengesFor("week", p, now)].filter((c) => c.done && !c.claimed).length;
  return (checkInStatus(p, now, pro).available ? 1 : 0) + ch + (g.signup ? 1 : 0) + (g.monthly ? 1 : 0);
}

export interface ComebackStatus {
  /** balance (plus chips at the cash table) is under the floor */
  broke: boolean;
  /** can be claimed right now */
  available: boolean;
  /** when the cooldown ends (ms), if it's running */
  readyAt: number | null;
  /** something else must be claimed first */
  blocked: boolean;
}

export function comebackStatus(p: Wallet & Activity, now: Date, pro: boolean): ComebackStatus {
  const broke = netWorth(p) < COMEBACK_BELOW;
  const readyAt = p.economy.comebackAt ? p.economy.comebackAt + COMEBACK_COOLDOWN_MS : 0;
  const cooling = readyAt > now.getTime();
  const blocked = broke && claimableCount(p, now, pro) > 0;
  return { broke, available: broke && !cooling && !blocked, readyAt: cooling ? readyAt : null, blocked };
}

export function claimComeback(p: Wallet & Activity, now: Date, pro: boolean): number {
  const s = comebackStatus(p, now, pro);
  if (!s.broke) throw new EconomyError("You still have chips to play with");
  if (s.blocked) throw new EconomyError("Claim your other rewards first");
  if (!s.available) throw new EconomyError("Not ready yet");
  p.economy.comebackAt = now.getTime();
  return grantChips(p, COMEBACK_GRANT, "comeback", now.getTime());
}

