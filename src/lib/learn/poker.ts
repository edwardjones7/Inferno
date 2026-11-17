/**
 * Poker (6-max No-Limit Hold'em) lessons. Hand strength comes from `evaluate`, equity and
 * outs from `equity.ts`, opening ranges from `ranges.ts` and response charts from `preflop.ts`,
 * so every answer matches the drills.
 */
import type { Card } from "../blackjack/cards";
import { equity, outs } from "../poker/equity";
import { describe } from "../poker/eval";
import { bbPrice, explainVs3bet, explainVsOpen, SEAT_NAME, vs3betChart, vsOpenChart, type Seat } from "../poker/preflop";
import { BEHIND, codeName, combosOf, handCode, OPEN_RANGES, POSITION_NAME, POSITIONS, rangePercent, type Position } from "../poker/ranges";
import { bluffBreakEven, combosLeft, hitChance, potOddsNeeded, textureOf, type Texture } from "./math";
import type { CheckOption, CheckStep, Lesson, Visual } from "./types";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const SHORT: Record<Position, string> = { UTG: "UTG", HJ: "Hijack", CO: "Cutoff", BTN: "Button", SB: "Small blind" };
const SEAT_PROMPT: Record<Position, string> = {
  UTG: "You're first to act, under the gun.",
  HJ: "Everyone folds to you in the hijack.",
  CO: "Everyone folds to you in the cutoff.",
  BTN: "Everyone folds to you on the button.",
  SB: "Everyone folds to you in the small blind.",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Options from a list of numbers that must include the right one. */
function numberOptions(values: number[], fmt: (n: number) => string): CheckOption[] {
  return [...new Set(values)].sort((a, b) => a - b).map((n) => ({ id: String(n), label: fmt(n) }));
}

/** Showdown question: who wins on this board? */
function showdownCheck(prompt: string, board: Card[], hero: [Card, Card], villain: [Card, Card], note = ""): CheckStep {
  const a = describe([...hero, ...board]);
  const b = describe([...villain, ...board]);
  const answer = a.score > b.score ? "hero" : a.score < b.score ? "villain" : "split";
  const verdict =
    answer === "split"
      ? `Both play ${a.name.toLowerCase()}: split pot.`
      : a.name === b.name
        ? `Both have ${a.name.toLowerCase()}, so the kickers decide.`
        : answer === "hero"
          ? `You have ${a.name.toLowerCase()}, which beats ${b.name.toLowerCase()}.`
          : `Villain's ${b.name.toLowerCase()} beats your ${a.name.toLowerCase()}.`;
  return {
    kind: "check",
    prompt,
    visual: {
      kind: "cards",
      size: "small",
      rows: [
        { label: "Board", cards: board },
        { label: "You", cards: hero },
        { label: "Villain", cards: villain },
      ],
    },
    options: [
      { id: "hero", label: "You win" },
      { id: "villain", label: "Villain wins" },
      { id: "split", label: "Split pot" },
    ],
    answer,
    why: `${verdict}${note ? ` ${note}` : ""}`,
  };
}

/** Raise-or-fold question graded with the opening range for `pos`. */
function openCheck(pos: Position, cards: [Card, Card]): CheckStep {
  const code = handCode(cards[0], cards[1]);
  const inRange = OPEN_RANGES[pos].has(code);
  return {
    kind: "check",
    prompt: `${SEAT_PROMPT[pos]} Raise or fold?`,
    visual: { kind: "cards", size: "small", rows: [{ label: pos, cards }] },
    options: [
      { id: "raise", label: "Raise" },
      { id: "fold", label: "Fold" },
    ],
    answer: inRange ? "raise" : "fold",
    why: `${cap(codeName(code))} (${code}) is ${inRange ? "inside" : "outside"} the ${SHORT[pos]} opening range, which plays about ${Math.round(rangePercent(OPEN_RANGES[pos]))}% of hands.`,
  };
}

/** 3-bet / call / fold question graded with the response chart for `hero` facing `opener`. */
function vsOpenCheck(hero: Seat, opener: Position, cards: [Card, Card]): CheckStep {
  const code = handCode(cards[0], cards[1]);
  const { action, why } = explainVsOpen(hero, opener, code);
  const size = opener === "SB" ? "3bb" : "2.5bb";
  return {
    kind: "check",
    prompt: `The ${POSITION_NAME[opener].toLowerCase()} opens to ${size} and it folds to you in the ${SEAT_NAME[hero].toLowerCase()}. Your play?`,
    visual: { kind: "cards", size: "small", rows: [{ label: hero, cards }] },
    options: [
      { id: "raise", label: "3-bet" },
      { id: "call", label: "Call" },
      { id: "fold", label: "Fold" },
    ],
    answer: action,
    why: `${cap(codeName(code))}: ${why}`,
  };
}

/** 4-bet / call / fold question for the opener `hero` facing a 3-bet from `villain`. */
function vs3betCheck(hero: Position, villain: Seat, cards: [Card, Card]): CheckStep {
  const code = handCode(cards[0], cards[1]);
  const { action, why } = explainVs3bet(hero, villain, code);
  return {
    kind: "check",
    prompt: `You open the ${POSITION_NAME[hero].toLowerCase()} and the ${SEAT_NAME[villain].toLowerCase()} 3-bets. Your play?`,
    visual: { kind: "cards", size: "small", rows: [{ label: hero, cards }] },
    options: [
      { id: "raise", label: "4-bet" },
      { id: "call", label: "Call" },
      { id: "fold", label: "Fold" },
    ],
    answer: action,
    why: `${cap(codeName(code))}: ${why}`,
  };
}

/** Call-or-fold with exact equity from `equity()`. */
function callCheck(hero: [Card, Card], villain: [Card, Card], board: Card[], pot: number, bet: number): CheckStep {
  const e = equity(hero, villain, board).equity;
  const need = potOddsNeeded(pot, bet);
  const o = outs(hero, villain, board).length;
  const answer = e >= need ? "call" : "fold";
  return {
    kind: "check",
    prompt: `Villain moves all-in for ${bet} into a pot of ${pot}, and shows you their hand. Call or fold?`,
    visual: {
      kind: "cards",
      size: "small",
      rows: [
        { label: "Board", cards: board },
        { label: "You", cards: hero },
        { label: "Villain", cards: villain },
      ],
    },
    options: [
      { id: "call", label: "Call" },
      { id: "fold", label: "Fold" },
    ],
    answer,
    why: `You need ${bet} ÷ ${pot + 2 * bet} = ${pct(need)}. With ${o} outs your equity is ${pct(e)}: ${answer === "call" ? "the price is right, call" : "not enough, fold"}.`,
  };
}

export const RANKING_EXAMPLES: Card[][] = [
  ["9H", "8H", "7H", "6H", "5H"],
  ["QS", "QH", "QD", "QC", "4S"],
  ["JS", "JH", "JD", "7C", "7S"],
  ["AD", "JD", "8D", "5D", "2D"],
  ["TS", "9H", "8D", "7C", "6S"],
  ["7S", "7H", "7D", "KC", "2S"],
  ["AS", "AH", "9D", "9C", "4S"],
  ["KS", "KH", "QD", "8C", "3S"],
  ["AS", "JH", "8D", "6C", "3S"],
];

const rangeBars = (): Visual => ({
  kind: "bars",
  caption: "Share of all starting hands each seat opens",
  bars: POSITIONS.map((p) => ({ label: p, value: rangePercent(OPEN_RANGES[p]), hot: p === "BTN" })),
});

const TEXTURE_LABEL: Record<Texture, string> = { dry: "Dry", wet: "Wet", paired: "Paired" };
const textureOptions: CheckOption[] = (["dry", "wet", "paired"] as const).map((t) => ({ id: t, label: TEXTURE_LABEL[t] }));
function textureCheck(board: Card[], why: string): CheckStep {
  const t = textureOf(board);
  return {
    kind: "check",
    prompt: "How would you describe this flop?",
    visual: { kind: "cards", size: "small", rows: [{ label: "Flop", cards: board }] },
    options: textureOptions,
    answer: t,
    why: `${TEXTURE_LABEL[t]}. ${why}`,
  };
}

const SIZES: [string, number][] = [
  ["⅓ pot", 1 / 3],
  ["½ pot", 1 / 2],
  ["⅔ pot", 2 / 3],
  ["Pot", 1],
];

export const POKER_LESSONS: Lesson[] = [
  {
    id: "pk-hand-rankings",
    track: "poker",
    title: "Hand rankings",
    blurb: "What beats what, kickers, and when the board plays.",
    minutes: 3,
    practice: [{ href: "/train/poker/?drill=showdown", label: "Showdown drill" }],
    steps: () => [
      {
        kind: "explain",
        title: "Best five cards wins",
        body: [
          "In Hold'em you make the best five-card hand from your two hole cards and the five on the board. You can use both, one, or none of your own cards.",
          "From strongest to weakest:",
        ],
        visual: {
          kind: "table",
          rows: RANKING_EXAMPLES.map((cards, i) => {
            const d = describe(cards);
            return { left: d.category, cards, right: d.name.includes(", ") ? d.name.split(", ")[1] : d.name.replace(/^Pair of /, ""), hot: i === 0 };
          }),
        },
      },
      {
        kind: "explain",
        title: "Ties and kickers",
        body: [
          "Rarer hands rank higher, which is why a flush beats a straight. When two hands are the same type, compare the highest cards that make them, then the **kickers**: the unused cards that fill out the five.",
          "If the best five cards are identical, the pot is split. Suits never break ties.",
        ],
      },
      showdownCheck("Who wins this pot?", ["KH", "9H", "4H", "2C", "7S"], ["AH", "3H"], ["KS", "KD"]),
      showdownCheck("Same pair of aces. Who wins?", ["AS", "9D", "6C", "3H", "2S"], ["AH", "QC"], ["AD", "JS"], "The queen kicker plays."),
      showdownCheck(
        "The board is a full house. Who wins?",
        ["8S", "8D", "8C", "KH", "KD"],
        ["2C", "3C"],
        ["AH", "4D"],
        "Nobody can improve on eights full of kings, so the board plays and the ace kicker doesn't matter.",
      ),
    ],
  },
  {
    id: "pk-position",
    track: "poker",
    title: "Position",
    blurb: "Acting last is worth more than most cards.",
    minutes: 2,
    practice: [
      { href: "/train/poker/?drill=preflop", label: "Pre-flop drill" },
      { href: "/train/charts/", label: "Range charts" },
    ],
    steps: () => [
      {
        kind: "explain",
        title: "The seats at a 6-max table",
        body: [
          "Before the flop, action starts left of the big blind and moves clockwise. The fewer players left to act behind you, the fewer can wake up with a big hand.",
        ],
        visual: {
          kind: "table",
          head: ["Seat", "Still to act if folded to you"],
          rows: POSITIONS.map((p) => ({ left: `${POSITION_NAME[p]} (${p})`, right: String(BEHIND[p]), hot: p === "BTN" })),
        },
      },
      {
        kind: "explain",
        title: "Last to act sees the most",
        body: [
          "After the flop the button acts **last on every street**. You see what everyone did before you decide: whether they checked (weakness), bet, or how much.",
          "That information lets you win pots with weaker hands, control the pot size and bluff at the right moments. It's why good players play more hands on the button and fewer up front.",
        ],
      },
      {
        kind: "check",
        prompt: "It folds to you in the cutoff. How many players still act after you?",
        options: numberOptions([BEHIND.CO - 1, BEHIND.CO, BEHIND.CO + 1], String),
        answer: String(BEHIND.CO),
        why: `${BEHIND.CO}: the button and both blinds.`,
      },
      {
        kind: "check",
        prompt: "Which seat acts last on the flop, turn and river?",
        options: [
          { id: "UTG", label: "Under the gun" },
          { id: "BB", label: "Big blind" },
          { id: "BTN", label: "Button" },
        ],
        answer: "BTN",
        why: "The button. The blinds act last only before the flop; after it they act first.",
      },
    ],
  },
  {
    id: "pk-opening-ranges",
    track: "poker",
    title: "Opening ranges",
    blurb: "Which hands to raise from each seat, and why it widens.",
    minutes: 3,
    practice: [
      { href: "/train/poker/?drill=preflop", label: "Pre-flop drill" },
      { href: "/train/charts/", label: "Range charts" },
    ],
    steps: () => [
      {
        kind: "explain",
        title: "Raise or fold, never limp",
        body: [
          "When everyone folds to you, either raise or fold. Which hands to raise depends on how many players are left: the later your seat, the wider you open.",
          `UTG opens about ${Math.round(rangePercent(OPEN_RANGES.UTG))}% of hands; the button about ${Math.round(rangePercent(OPEN_RANGES.BTN))}%.`,
        ],
        visual: rangeBars(),
      },
      {
        kind: "explain",
        title: "Under the gun: tight",
        body: ["Pairs on the diagonal, suited hands above it, offsuit below. Five players can still wake up with something, so UTG sticks to strong hands and suited cards that make big hands."],
        visual: { kind: "range", pos: "UTG" },
      },
      {
        kind: "explain",
        title: "Button: wide",
        body: ["Only the blinds are left, and you'll have position after the flop. Most suited hands and any ace become opens."],
        visual: { kind: "range", pos: "BTN" },
      },
      openCheck("UTG", ["AS", "5D"]),
      openCheck("BTN", ["AH", "5C"]),
      openCheck("CO", ["QD", "8S"]),
    ],
  },
  {
    id: "pk-pot-odds",
    track: "poker",
    title: "Pot odds",
    blurb: "How much equity you need to call a bet.",
    minutes: 3,
    practice: [{ href: "/train/poker/?drill=potodds", label: "Pot odds drill" }],
    steps: () => [
      {
        kind: "explain",
        title: "The price of a call",
        body: [
          "Facing a bet, compare what you put in with what you can win. If you'd have to put in a quarter of the final pot, you need to win at least a quarter of the time.",
        ],
        visual: { kind: "formula", text: "Equity needed = call ÷ (pot + bet + call)", note: "The pot before the bet, plus the bet, plus your call." },
      },
      {
        kind: "explain",
        title: "A worked example",
        body: [
          `The pot is 100 and villain bets 50. You call 50 to make a final pot of 200, so you need 50 ÷ 200 = **${pct(potOddsNeeded(100, 50))}**.`,
          `A bigger bet asks more: a pot-size bet needs ${pct(potOddsNeeded(100, 100))}, a quarter-pot bet only ${pct(potOddsNeeded(100, 25))}.`,
        ],
      },
      {
        kind: "check",
        prompt: "The pot is 60 and villain bets 60. What equity do you need to call?",
        options: numberOptions([25, Math.round(potOddsNeeded(60, 60) * 100), 50], (n) => `${n}%`),
        answer: String(Math.round(potOddsNeeded(60, 60) * 100)),
        why: `60 ÷ (60 + 60 + 60) = ${pct(potOddsNeeded(60, 60))}. A pot-size bet always asks for a third.`,
      },
      {
        kind: "check",
        prompt: "The pot is 100 and villain bets 25. What do you need?",
        options: numberOptions([Math.round(potOddsNeeded(100, 25) * 100), 25, 33], (n) => `${n}%`),
        answer: String(Math.round(potOddsNeeded(100, 25) * 100)),
        why: `25 ÷ 150 = ${pct(potOddsNeeded(100, 25))}. Small bets give you a great price.`,
      },
      {
        kind: "explain",
        title: "Equity vs price",
        body: ["Now put it together: estimate your equity (the next lessons show how) and call when it's at least the price."],
      },
      callCheck(["AH", "5H"], ["KS", "QD"], ["KH", "9H", "2C"], 100, 50),
      callCheck(["JC", "TD"], ["AS", "AD"], ["QH", "8S", "3D"], 100, 75),
    ],
  },
  {
    id: "pk-outs",
    track: "poker",
    title: "Outs and the rule of 2 and 4",
    blurb: "Count your outs and turn them into a percentage in your head.",
    minutes: 3,
    practice: [{ href: "/train/poker/?drill=potodds", label: "Pot odds drill" }],
    steps: () => {
      const hero: [Card, Card] = ["8H", "7H"];
      const villain: [Card, Card] = ["KS", "QD"];
      const board: Card[] = ["KH", "9H", "2C"];
      const o = outs(hero, villain, board).length;
      const draws: [string, number][] = [
        ["Gutshot", 4],
        ["Open-ended straight", 8],
        ["Flush draw", 9],
        ["Flush + straight draw", 15],
      ];
      return [
        {
          kind: "explain",
          title: "Outs: the cards that save you",
          body: [
            "When you're behind, an **out** is any unseen card that puts you ahead. A flush draw has 9: thirteen cards of the suit, minus the four you can see.",
          ],
          visual: {
            kind: "cards",
            size: "small",
            rows: [
              { label: "Board", cards: ["AS", "8D", "4D"] },
              { label: "You", cards: ["KD", "QD"], note: "9 diamonds left" },
            ],
          },
        },
        {
          kind: "check",
          prompt: "You're behind top pair. How many outs do you have?",
          visual: {
            kind: "cards",
            size: "small",
            rows: [
              { label: "Board", cards: board },
              { label: "You", cards: hero },
              { label: "Villain", cards: villain },
            ],
          },
          options: numberOptions([4, 8, o, 15], String),
          answer: String(o),
          why: `${o}: every remaining heart makes your flush. No single card makes a straight yet.`,
        },
        {
          kind: "explain",
          title: "The rule of 2 and 4",
          body: [
            "Multiply your outs by **4** on the flop when you'll see both the turn and river (you're all-in), or by **2** for just the next card.",
            "It's slightly generous with big draws, but close enough to decide at the table:",
          ],
          visual: {
            kind: "table",
            head: ["Draw (outs)", "Flop→river · next card"],
            rows: draws.map(([name, n]) => ({
              left: `${name} (${n})`,
              right: `${pct(hitChance(n, 2))} · ${pct(hitChance(n, 1))}`,
              hot: n === 9,
            })),
          },
        },
        {
          kind: "check",
          prompt: "On the turn you have a flush draw (9 outs). Roughly how often do you hit on the river?",
          options: [
            { id: "9", label: "About 9%" },
            { id: "18", label: "About 18%" },
            { id: "36", label: "About 36%" },
          ],
          answer: "18",
          why: `9 × 2 = 18%. The exact figure is ${pct(hitChance(9, 1))}.`,
        },
        {
          kind: "check",
          prompt: "You're all-in on the flop with an open-ended straight draw (8 outs). Your chance by the river?",
          options: [
            { id: "16", label: "About 16%" },
            { id: "32", label: "About 32%" },
            { id: "50", label: "About 50%" },
          ],
          answer: "32",
          why: `8 × 4 = 32%. Exact: ${pct(hitChance(8, 2))}.`,
        },
        {
          kind: "explain",
          title: "Only ×4 if you see both cards",
          body: [
            "If you call a flop bet and could face another bet on the turn, you're only guaranteed one card. Use ×2 against the price of this call, unless you're all-in.",
          ],
        },
      ];
    },
  },
  {
    id: "pk-equity",
    track: "poker",
    title: "Equity and coin flips",
    blurb: "The handful of matchups that cover most all-ins.",
    minutes: 3,
    practice: [{ href: "/train/poker/?drill=equity", label: "Equity drill" }],
    steps: () => {
      const eq = (h: [Card, Card], v: [Card, Card]) => equity(h, v, [], 6000).equity;
      const matchups: { label: string; h: [Card, Card]; v: [Card, Card]; note: string }[] = [
        { label: "AA vs KK", h: ["AS", "AH"], v: ["KD", "KC"], note: "bigger pair" },
        { label: "AK vs AQ", h: ["AS", "KD"], v: ["AH", "QC"], note: "domination" },
        { label: "88 vs A7", h: ["8S", "8H"], v: ["AD", "7C"], note: "pair vs one over" },
        { label: "AK vs 76s", h: ["AS", "KD"], v: ["7H", "6H"], note: "overs vs unders" },
        { label: "QQ vs AK", h: ["QS", "QH"], v: ["AD", "KC"], note: "coin flip" },
      ];
      const jj = eq(["JS", "JH"], ["AD", "KD"]);
      const kq = eq(["KS", "QH"], ["KD", "JC"]);
      const kqOpts = [50, 60, 70];
      const kqNear = kqOpts.reduce((a, n) => (Math.abs(n / 100 - kq) < Math.abs(a / 100 - kq) ? n : a));
      return [
        {
          kind: "explain",
          title: "Equity is your share of the pot",
          body: [
            "If all five board cards were dealt out thousands of times, how often would your hand win? That share is your **equity**.",
            "You don't need to calculate it at the table. A few matchups cover most all-ins:",
          ],
          visual: {
            kind: "bars",
            caption: "First hand's equity before the flop",
            bars: matchups.map((m) => ({ label: m.label, value: eq(m.h, m.v) * 100, note: m.note, hot: m.note === "coin flip" })),
          },
        },
        {
          kind: "explain",
          title: "The coin flip",
          body: [
            "A pair against two higher cards is the famous **coin flip**: the pair is a small favourite, about 55/45.",
            "Being dominated is much worse. AQ against AK shares the ace and can only win by pairing the queen, so it's around 25%.",
          ],
          visual: { kind: "cards", size: "small", rows: [{ label: "Pair", cards: ["QS", "QH"] }, { label: "Overs", cards: ["AD", "KC"] }] },
        },
        {
          kind: "check",
          prompt: "JJ against AK suited, all-in before the flop. Who's ahead?",
          visual: { kind: "cards", size: "small", rows: [{ label: "You", cards: ["JS", "JH"] }, { label: "Villain", cards: ["AD", "KD"] }] },
          options: [
            { id: "pair-big", label: "JJ, about 80%" },
            { id: "pair", label: "JJ, about 55%" },
            { id: "overs", label: "AK, about 55%" },
          ],
          answer: jj > 0.65 ? "pair-big" : jj >= 0.5 ? "pair" : "overs",
          why: `A coin flip: JJ has ${pct(jj)}. Suited overcards claw back a little, but the pair stays ahead.`,
        },
        {
          kind: "check",
          prompt: "KQ against KJ. Roughly what's KQ's equity?",
          visual: { kind: "cards", size: "small", rows: [{ label: "You", cards: ["KS", "QH"] }, { label: "Villain", cards: ["KD", "JC"] }] },
          options: kqOpts.map((n) => ({ id: String(n), label: `About ${n}%` })),
          answer: String(kqNear),
          why: `${pct(kq)}. Same top card, better kicker: the dominated hand mostly needs to pair its jack.`,
        },
      ];
    },
  },
  {
    id: "pk-board-texture",
    track: "poker",
    title: "Board texture",
    blurb: "Dry, wet or paired: read the flop before you read the player.",
    minutes: 3,
    practice: [{ href: "/train/poker/?drill=texture", label: "Texture drill" }],
    steps: () => [
      {
        kind: "explain",
        title: "Three kinds of flop",
        body: [
          "**Dry** flops have few draws: the best hand now is usually the best hand on the river.",
          "**Wet** flops are connected or suited: straights and flushes are possible or close, and hands change a lot by the river.",
          "**Paired** flops make strong hands rarer: few players hold trips.",
        ],
        visual: {
          kind: "cards",
          size: "small",
          rows: [
            { label: "Dry", cards: ["KS", "7D", "2C"] },
            { label: "Wet", cards: ["JH", "TH", "8C"] },
            { label: "Paired", cards: ["8S", "8D", "3C"] },
          ],
        },
      },
      {
        kind: "explain",
        title: "Who does the board favour?",
        body: [
          "The preflop raiser has more AA, KK and AK, so **high, dry boards** favour them. The caller in the big blind has more suited connectors and small pairs, so **low, connected boards** hit them more often.",
          "That decides how often you bet and how big, which is the next lesson.",
        ],
      },
      textureCheck(["QS", "8D", "3H"], "Rainbow, nothing connected: very few draws."),
      textureCheck(["9H", "8H", "6C"], "Connected with a flush draw: lots of straights and draws."),
      textureCheck(["KC", "KD", "5S"], "With a pair on board, few hands have trips."),
    ],
  },
  {
    id: "pk-cbet-sizing",
    track: "poker",
    title: "C-betting and bet sizing",
    blurb: "When to follow up on the flop, and how big.",
    minutes: 3,
    practice: [
      { href: "/train/poker/?drill=cbet", label: "C-bet drill" },
      { href: "/train/poker/?drill=sizing", label: "Sizing drill" },
    ],
    steps: () => [
      {
        kind: "explain",
        title: "The continuation bet",
        body: [
          "A **c-bet** is a flop bet by the player who raised before the flop. It works because two unpaired cards miss the flop about two times in three, and your range is the one with the big pairs.",
        ],
      },
      {
        kind: "explain",
        title: "What your size asks for",
        body: [
          "A bluff must make villain fold often enough to pay for itself; a caller needs equity to match the price. Bigger bets demand more folds but give worse odds to call:",
        ],
        visual: {
          kind: "table",
          head: ["Bet", "Bluff must work · caller needs"],
          rows: SIZES.map(([label, f]) => ({ left: label, right: `${pct(bluffBreakEven(1, f))} · ${pct(potOddsNeeded(1, f))}`, hot: f === 1 / 3 })),
        },
      },
      {
        kind: "check",
        prompt: "You bet half the pot as a pure bluff. How often must villain fold?",
        options: [
          { id: "25", label: "25%" },
          { id: "33", label: "33%" },
          { id: "50", label: "50%" },
        ],
        answer: String(Math.round(bluffBreakEven(1, 1 / 2) * 100)),
        why: `Risk ½ to win 1: ½ ÷ 1½ = ${pct(bluffBreakEven(1, 1 / 2))}.`,
      },
      {
        kind: "explain",
        title: "Size follows texture",
        body: [
          "On **dry boards that favour you**, bet small (about a third of the pot) and often: villain misses, and draws are few, so a small bet does the job cheaply.",
          "On **wet boards**, bet bigger (two-thirds or more) with strong hands and good draws to charge the draws, and check more of the hands that missed.",
        ],
      },
      {
        kind: "check",
        prompt: `You opened the button and the big blind called. The flop is K♠ 7♦ 2♣ (${textureOf(["KS", "7D", "2C"])}). Your default play?`,
        visual: { kind: "cards", size: "small", rows: [{ label: "Flop", cards: ["KS", "7D", "2C"] }] },
        options: [
          { id: "small", label: "Small c-bet, about ⅓ pot" },
          { id: "big", label: "Overbet" },
          { id: "check", label: "Check" },
        ],
        answer: "small",
        why: "A king-high dry board is great for the raiser's range. A small bet with most hands wins the pot often and risks little.",
      },
      {
        kind: "check",
        prompt: "Same spot, but the flop is J♥ T♥ 8♣ and you hold A♠ 4♦ with nothing. Best play?",
        visual: {
          kind: "cards",
          size: "small",
          rows: [
            { label: "Flop", cards: ["JH", "TH", "8C"] },
            { label: "You", cards: ["AS", "4D"] },
          ],
        },
        options: [
          { id: "check", label: "Check" },
          { id: "small", label: "Small c-bet" },
          { id: "pot", label: "Pot-size bet" },
        ],
        answer: "check",
        why: "This wet, connected board hits the caller's range hard, and you have no draw. Give up cheaply and save bets for hands with equity.",
      },
    ],
  },
  {
    id: "pk-hand-reading",
    track: "poker",
    title: "Hand reading: ranges, not hands",
    blurb: "Stop guessing one hand. Narrow a range, count combos.",
    minutes: 4,
    practice: [{ href: "/train/poker/?drill=handread", label: "Hand reading drill" }],
    steps: () => {
      const ak = combosOf("AKs") + combosOf("AKo");
      const dead: Card[] = ["AS", "7D", "2C", "AH", "KD"];
      const akLeft = combosLeft("AK", dead);
      const choices = ["KQo", "76o", "A5s", "55"];
      const outside = choices.filter((c) => !OPEN_RANGES.UTG.has(c));
      return [
        {
          kind: "explain",
          title: "Think in ranges",
          body: [
            "You'll almost never know villain's exact hand. Instead, picture every hand they could have played this way: their **range**.",
            `Start from where they opened. An UTG raise is about ${Math.round(rangePercent(OPEN_RANGES.UTG))}% of hands, so a 7-6-5 flop rarely helps it; a button open is far wider.`,
          ],
          visual: { kind: "range", pos: "UTG" },
        },
        {
          kind: "check",
          prompt: "Villain opened from UTG. Which of these is NOT in that range?",
          options: choices.map((c) => ({ id: c, label: c })),
          answer: outside[0],
          why: `${cap(codeName(outside[0]))} isn't an UTG open. The other three are: pairs from 55, suited aces, and KQ offsuit.`,
        },
        {
          kind: "explain",
          title: "Count combos",
          body: [
            "Not all hands are equally likely. A pair can be dealt 6 ways, a suited hand 4, an offsuit hand 12.",
            `So AK (${ak} combos) is more likely than any single pair (6), even before the flop.`,
          ],
          visual: {
            kind: "table",
            head: ["Hand type", "Combos"],
            rows: [
              { left: "Pocket pair (QQ)", cards: ["QS", "QH"], right: String(combosOf("QQ")) },
              { left: "Suited (AKs)", cards: ["AS", "KS"], right: String(combosOf("AKs")) },
              { left: "Offsuit (AKo)", cards: ["AS", "KD"], right: String(combosOf("AKo")), hot: true },
            ],
          },
        },
        {
          kind: "check",
          prompt: "How many combos of AK are there before the flop, suited and offsuit together?",
          options: numberOptions([4, 12, ak], String),
          answer: String(ak),
          why: `4 suited + 12 offsuit = ${ak}.`,
        },
        {
          kind: "explain",
          title: "Cards you can see are blockers",
          body: [
            "Every card on the board or in your hand removes combos from villain's range. Holding an ace cuts their AK, AA and AQ.",
          ],
        },
        {
          kind: "check",
          prompt: "You hold A♥ K♦ and the flop is A♠ 7♦ 2♣. How many AK combos can villain still have?",
          visual: {
            kind: "cards",
            size: "small",
            rows: [
              { label: "Flop", cards: ["AS", "7D", "2C"] },
              { label: "You", cards: ["AH", "KD"] },
            ],
          },
          options: numberOptions([akLeft, 9, 12, ak], String),
          answer: String(akLeft),
          why: `Two aces and three kings are left: 2 × 3 = ${akLeft}. Your hand blocks most of the AK combos villain could have.`,
        },
      ];
    },
  },
  {
    id: "pk-bb-defence",
    track: "poker",
    title: "Defending the big blind",
    blurb: "You already paid a blind: which hands call, 3-bet or fold.",
    minutes: 4,
    practice: [
      { href: "/train/poker/?drill=vsopen&pos=BB", label: "Big-blind defence drill" },
      { href: "/train/charts/?tab=poker&view=vsopen", label: "Response charts" },
    ],
    steps: () => {
      const openers: Position[] = ["UTG", "HJ", "CO", "BTN", "SB"];
      const defend = (o: Position) => rangePercent(vsOpenChart("BB", o)!.raise) + rangePercent(vsOpenChart("BB", o)!.call);
      return [
        {
          kind: "explain",
          title: "You get a discount",
          body: [
            "The big blind already has 1bb in the pot. When the button opens to 2.5bb and the small blind folds, you call 1.5bb to win 4bb: you need only about **27%** equity, and you close the action, so nobody can raise behind you.",
            "That price is why the big blind defends far more hands than any other seat would call with.",
          ],
          visual: { kind: "formula", text: `1.5 ÷ (4 + 1.5) = ${pct(bbPrice("BTN"))}`, note: "Call 1.5bb into a 4bb pot (2.5bb open + small blind + your big blind)." },
        },
        {
          kind: "explain",
          title: "Defend wider against later seats",
          body: [
            "Late openers raise more hands, so more of yours are good enough. Out of position you won't realise all your equity, so you still fold the weakest offsuit hands.",
          ],
          visual: {
            kind: "bars",
            caption: "Share of hands the big blind continues with (call + 3-bet), 100bb",
            bars: openers.map((o) => ({ label: `vs ${o}`, value: defend(o), hot: o === "BTN" })),
          },
        },
        {
          kind: "explain",
          title: "What defends",
          body: [
            "**Call** with pairs, suited hands (they make flushes and draws, so they realise equity out of position) and connected or high offsuit cards.",
            "**3-bet** your best hands for value, plus some bluffs that block strong hands: suited wheel aces like A5s block AA and AK.",
            "**Fold** weak, disconnected offsuit hands like 9-4 or 7-2: they rarely make a strong hand and play badly out of position.",
          ],
        },
        vsOpenCheck("BB", "BTN", ["QS", "8D"]),
        vsOpenCheck("BB", "UTG", ["KS", "5D"]),
        vsOpenCheck("BB", "BTN", ["AH", "5H"]),
        vsOpenCheck("BB", "CO", ["9S", "4D"]),
      ];
    },
  },
  {
    id: "pk-3bet",
    track: "poker",
    title: "3-betting: value and bluffs",
    blurb: "Re-raise the hands that are ahead, and the right bluffs.",
    minutes: 4,
    practice: [
      { href: "/train/poker/?drill=vsopen", label: "Facing an open drill" },
      { href: "/train/charts/?tab=poker&view=vsopen", label: "Response charts" },
    ],
    steps: () => {
      const width = (h: Seat, o: Position) => rangePercent(vsOpenChart(h, o)!.raise);
      const aaWithAce = combosLeft("AA", ["AS"]);
      return [
        {
          kind: "explain",
          title: "Why re-raise",
          body: [
            "A 3-bet is a re-raise of an open. **Value** 3-bets are ahead of the hands that continue and build a bigger pot. **Bluff** 3-bets win the pot right away often enough, and still have equity when called.",
            "Size about 3x the open in position (7.5bb) and 3.5–4x out of position (10–11bb), so the opener can't call cheaply with position on you.",
          ],
        },
        {
          kind: "explain",
          title: "Width depends on the opener",
          body: ["Against a tight early open you 3-bet mostly premiums. Against a wide late open, far more hands are ahead, so your 3-bet range widens with it."],
          visual: {
            kind: "table",
            head: ["Spot", "3-bet"],
            rows: [
              { left: "Hijack vs UTG", right: `${width("HJ", "UTG").toFixed(1)}%` },
              { left: "Button vs cutoff", right: `${width("BTN", "CO").toFixed(1)}%` },
              { left: "Small blind vs button", right: `${width("SB", "BTN").toFixed(1)}%`, hot: true },
              { left: "Big blind vs button", right: `${width("BB", "BTN").toFixed(1)}%` },
            ],
          },
        },
        {
          kind: "explain",
          title: "Pick bluffs with blockers",
          body: [
            "Good 3-bet bluffs are hands too weak to call but with something going for them. A5s is the classic: the ace **blocks** AA and AK (the hands that would 4-bet you), and it can still make a straight or a flush.",
            "From the small blind there's no flatting: 3-bet or fold, because a call out of position with the big blind still to act loses money.",
          ],
          visual: { kind: "cards", size: "small", rows: [{ label: "Bluff", cards: ["AS", "5S"], note: "blocks AA, AK" }] },
        },
        {
          kind: "check",
          prompt: "You hold A♠ 5♠. How many combinations of pocket aces can your opponent still have?",
          options: numberOptions([aaWithAce, 4, 6], String),
          answer: String(aaWithAce),
          why: `Three aces are left, which make ${aaWithAce} pairs instead of 6. Holding an ace halves their AA, so they 4-bet less often.`,
        },
        vsOpenCheck("SB", "BTN", ["KS", "QD"]),
        vsOpenCheck("SB", "CO", ["7S", "6S"]),
        vsOpenCheck("CO", "HJ", ["AD", "4D"]),
      ];
    },
  },
  {
    id: "pk-vs-3bet",
    track: "poker",
    title: "Facing a 3-bet",
    blurb: "You opened and got re-raised: 4-bet, call or let it go.",
    minutes: 4,
    practice: [
      { href: "/train/poker/?drill=vs3bet", label: "Facing a 3-bet drill" },
      { href: "/train/charts/?tab=poker&view=vs3bet", label: "Response charts" },
    ],
    steps: () => {
      const keep = (hero: Position, v: Seat) => {
        const c = vs3betChart(hero, v)!;
        return ((rangePercent(c.raise) + rangePercent(c.call)) / rangePercent(OPEN_RANGES[hero])) * 100;
      };
      return [
        {
          kind: "explain",
          title: "Folding is part of the plan",
          body: [
            "You open a wide range, so most of it can't continue against a 3-bet. Strong players keep roughly 40–50% of their opening range and fold the rest without regret.",
            "In position (the 3-bet came from a blind) you can call more, because you act last on every street. Out of position, call less and 4-bet or fold more.",
          ],
          visual: {
            kind: "bars",
            caption: "Share of your opening range that continues against a 3-bet",
            bars: [
              { label: "UTG vs BTN", value: keep("UTG", "BTN"), note: "out of position" },
              { label: "CO vs BTN", value: keep("CO", "BTN"), note: "out of position" },
              { label: "CO vs BB", value: keep("CO", "BB"), note: "in position" },
              { label: "BTN vs BB", value: keep("BTN", "BB"), note: "in position", hot: true },
            ],
          },
        },
        {
          kind: "explain",
          title: "4-bet, call, fold",
          body: [
            "**4-bet** (about 2.2–2.5x the 3-bet) with the top of your range, QQ+ and AK against a wide 3-bet, plus a few blocker bluffs like A5s and A4s.",
            "**Call** with pairs and strong suited hands that play well after the flop.",
            "**Fold** offsuit hands from the bottom of your range, like KJo or A9o: they're dominated by the hands that 3-bet.",
          ],
        },
        vs3betCheck("CO", "BTN", ["JS", "JD"]),
        vs3betCheck("CO", "BTN", ["KS", "KD"]),
        vs3betCheck("UTG", "BTN", ["KS", "JD"]),
        vs3betCheck("BTN", "BB", ["8S", "7S"]),
      ];
    },
  },
  {
    id: "pk-ranges-later",
    track: "poker",
    title: "Thinking in ranges on later streets",
    blurb: "Every call and every bet size tells you what's left in their range.",
    minutes: 4,
    practice: [
      { href: "/train/poker/?drill=handread", label: "Hand reading drill" },
      { href: "/train/poker/?drill=potodds", label: "Pot odds drill" },
    ],
    steps: () => [
      {
        kind: "explain",
        title: "Each street removes hands",
        body: [
          "Start from the pre-flop range, then update it on every street. A **call** removes most hands with nothing: people rarely call a bet with no pair and no draw. A **check** removes some of their strongest hands, which usually bet.",
          "By the river, a player who has called twice holds mostly pairs and missed or made draws.",
        ],
      },
      {
        kind: "check",
        prompt: "The big blind called your bets on the flop and the turn. Which of these is least likely to be in their range now?",
        options: [
          { id: "pair", label: "A pair" },
          { id: "draw", label: "A flush draw" },
          { id: "air", label: "No pair and no draw since the flop" },
        ],
        answer: "air",
        why: "Calling twice with nothing is rare. Pairs and draws call; pure air folds early.",
      },
      {
        kind: "explain",
        title: "River bets are value or bluffs",
        body: [
          "On the river nothing is left to draw to, so a bet is either **value** (they want a call from worse) or a **bluff** (they want a fold from better). Medium hands mostly check.",
          "A balanced bettor uses just enough bluffs to make your bluff-catchers break even. That share depends on the size:",
        ],
        visual: {
          kind: "table",
          head: ["River bet", "Bluffs in a balanced range"],
          rows: SIZES.map(([label, f]) => ({ left: label, right: pct(potOddsNeeded(1, f)), hot: f === 1 })),
        },
      },
      {
        kind: "check",
        prompt: "Villain bets the size of the pot on the river. In a balanced range, what share of those bets are bluffs?",
        options: numberOptions([20, Math.round(potOddsNeeded(1, 1) * 100), 50], (n) => `${n}%`),
        answer: String(Math.round(potOddsNeeded(1, 1) * 100)),
        why: `Pot ÷ (pot + pot + pot) = ${pct(potOddsNeeded(1, 1))}, the same as the price you're getting. With more bluffs, calling profits; with fewer, folding does.`,
      },
      {
        kind: "explain",
        title: "Big bets are value-heavy in practice",
        body: [
          "Most players bluff big river bets **less** than balanced. Against an unknown player, a large river bet usually means value: fold bluff-catchers that beat only bluffs, and call with hands that also beat their thinner value bets.",
          "Small bets are the opposite: they get called by more hands, so they're used with thinner value and more bluffs.",
        ],
      },
      {
        kind: "check",
        prompt: "Villain bets a third of the pot on the river instead of the full pot. Compared with the pot-size bet, their range is usually:",
        options: [
          { id: "stronger", label: "Stronger: more value" },
          { id: "wider", label: "Wider: thinner value and more bluffs" },
          { id: "same", label: "About the same" },
        ],
        answer: "wider",
        why: `A third-pot bet only needs ${pct(potOddsNeeded(1, 1 / 3))} equity from a caller, so it gets called by more hands. Thinner value bets and cheap bluffs both use it.`,
      },
    ],
  },
];
