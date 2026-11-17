/**
 * Blackjack lessons. Every strategy check is graded with `basicStrategy` for the Inferno
 * Classic rules (6 decks, S17, DAS, late surrender, 3:2) and explained with `explain`, so the
 * lessons can never disagree with the drills or the live coach.
 */
import type { Card } from "../blackjack/cards";
import { DEFAULT_RULES } from "../blackjack/engine";
import { basicStrategy, explain, MOVE_LABEL, spotOf, type Move } from "../blackjack/strategy";
import { dealerBustChance, hiLo, insuranceEv, runningCount, trueCount } from "./math";
import type { CheckStep, Lesson, Visual } from "./types";

const pct = (x: number) => `${Math.round(x * 100)}%`;

const hand = (up: Card, cards: Card[]): Visual => ({
  kind: "cards",
  size: "normal",
  rows: [
    { label: "Dealer", cards: [up] },
    { label: "You", cards },
  ],
});

/** A strategy question graded by basic strategy, offering only `moves`. */
function bjCheck(prompt: string, cards: [Card, Card], up: Card, moves: Move[]): CheckStep {
  const answer = basicStrategy(cards, up, moves, DEFAULT_RULES);
  const spot = spotOf(cards, up);
  return {
    kind: "check",
    prompt,
    visual: hand(up, cards),
    options: moves.map((m) => ({ id: m, label: MOVE_LABEL[m] })),
    answer,
    why: `${spot.label}: ${MOVE_LABEL[answer].toLowerCase()}. ${explain(spot, answer)}`,
  };
}

const UPCARDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const bustBars = (): Visual => ({
  kind: "bars",
  caption: "Dealer bust chance by upcard (after checking for blackjack)",
  bars: UPCARDS.map((u) => ({ label: u === 11 ? "A" : String(u), value: dealerBustChance(u) * 100, hot: u <= 6 })),
});

const HS: Move[] = ["hit", "stand"];
const HSD: Move[] = ["hit", "stand", "double"];
const HSDP: Move[] = ["hit", "stand", "double", "split"];
const ALL: Move[] = ["hit", "stand", "double", "surrender"];

export const BLACKJACK_LESSONS: Lesson[] = [
  {
    id: "bj-dealer-bust",
    track: "blackjack",
    title: "Why the dealer busts on 2–6",
    blurb: "The dealer has no choices. That's the weakness you exploit.",
    minutes: 3,
    practice: [
      { href: "/train/blackjack/?spot=hard-14-5", label: "Drill 14 vs 5" },
      { href: "/train/charts/", label: "See the full chart" },
    ],
    steps: () => {
      const b6 = dealerBustChance(6);
      const b10 = dealerBustChance(10);
      const options = [
        { id: "10", label: "About 1 in 10", v: 0.1 },
        { id: "25", label: "About 1 in 4", v: 0.25 },
        { id: "40", label: "About 2 in 5", v: 0.4 },
      ];
      const nearest = options.reduce((a, o) => (Math.abs(o.v - b6) < Math.abs(a.v - b6) ? o : a));
      return [
        {
          kind: "explain",
          title: "The dealer plays by a script",
          body: [
            "You choose how to play your hand. The dealer doesn't: they **must hit 16 or less and stand on 17 or more**, whatever you hold.",
            "The house edge comes from one rule: you act first, so if you bust you lose, even when the dealer busts afterwards. Your weapon is the reverse: when the dealer is likely to bust, stand and let them take the risk.",
          ],
          visual: { kind: "formula", text: "Dealer: hit ≤16 · stand ≥17", note: "At Inferno Classic the dealer also stands on soft 17." },
        },
        {
          kind: "explain",
          title: "Small upcards are bust cards",
          body: [
            "Almost a third of the deck is worth ten. Under a 4, 5 or 6 that makes 14, 15 or 16, a total the dealer is forced to hit, and any card from 6 up busts it.",
            `Under a big card the opposite happens: a ten under a ten is 20, done. A dealer showing 6 busts **${pct(b6)}** of the time; showing 10, only ${pct(b10)}.`,
          ],
          visual: bustBars(),
        },
        {
          kind: "check",
          prompt: "The dealer shows a 6. Roughly how often do they bust?",
          options: options.map(({ id, label }) => ({ id, label })),
          answer: nearest.id,
          why: `A 6 busts about ${pct(b6)} of the time, close to 2 in 5. It's one of the dealer's worst cards.`,
        },
        {
          kind: "explain",
          title: "Stiff hands: stand against weakness",
          body: [
            "A hard 12 to 16 is a **stiff**: one more card can bust it, but it rarely wins as it stands.",
            "Against 2 to 6, stand (12 is the one exception against 2 and 3) and make the dealer draw. Against 7 or higher the dealer usually finishes on 17 or better, so a stiff has to take a card and try to improve.",
          ],
          visual: hand("5H", ["TS", "6D"]),
        },
        bjCheck("You have 14. The dealer shows a 5.", ["TS", "4D"], "5H", HS),
        bjCheck("You have 14 again, but now the dealer shows a 9.", ["TC", "4H"], "9S", HS),
      ];
    },
  },
  {
    id: "bj-hard-totals",
    track: "blackjack",
    title: "Hard totals",
    blurb: "When to hit and when to stand with no ace in your hand.",
    minutes: 3,
    practice: [
      { href: "/train/blackjack/?spot=hard-12-3", label: "Drill 12 vs 3" },
      { href: "/train/blackjack/", label: "Mixed drill" },
    ],
    steps: () => [
      {
        kind: "explain",
        title: "Hard means no safety net",
        body: [
          "A hand is **hard** when it has no ace, or its ace can only count as 1. From 12 up, a single card can bust you.",
          "Most of your hands are hard totals, so this is the part of the chart worth knowing cold.",
        ],
        visual: { kind: "cards", rows: [{ label: "Hard 15", cards: ["9C", "6H"] }, { label: "Hard 17", cards: ["TD", "7S"] }] },
      },
      {
        kind: "explain",
        title: "The whole hard chart in four lines",
        body: ["Doubling gets its own lesson. For now, hit or stand:"],
        visual: {
          kind: "table",
          head: ["Your total", "Play"],
          rows: [
            { left: "17 or more", right: "Always stand" },
            { left: "13 – 16", right: "Stand vs 2–6, hit vs 7–A", hot: true },
            { left: "12", right: "Stand vs 4–6, otherwise hit" },
            { left: "11 or less", right: "Always take a card" },
          ],
        },
      },
      bjCheck("You have 12. The dealer shows a 3.", ["9D", "3C"], "3S", HS),
      {
        kind: "explain",
        title: "Why 12 is the odd one out",
        body: [
          `Against a 2 or 3 the dealer busts only ${pct(dealerBustChance(2))}–${pct(dealerBustChance(3))} of the time, while your 12 busts only on a ten-value card (4 ranks out of 13).`,
          "So taking one card is worth the risk. Against 4, 5 and 6 the dealer busts often enough that standing wins.",
        ],
      },
      bjCheck("You have 16 and surrender isn't offered. The dealer shows a 10.", ["TH", "6S"], "KD", HS),
      bjCheck("You have 13. The dealer shows a 2.", ["8S", "5C"], "2D", HS),
    ],
  },
  {
    id: "bj-soft-totals",
    track: "blackjack",
    title: "Soft totals",
    blurb: "Ace hands can't bust with one card. Most players play them too timidly.",
    minutes: 3,
    practice: [
      { href: "/train/blackjack/?spot=soft-18-9", label: "Drill soft 18 vs 9" },
      { href: "/train/blackjack/", label: "Mixed drill" },
    ],
    steps: () => [
      {
        kind: "explain",
        title: "The ace is a free hit",
        body: [
          "A **soft** hand has an ace counted as 11. If the next card would bust you, the ace drops to 1, so one card can never bust a soft hand.",
          "That changes everything: soft 17 (A,6) is not a hand to stand on. It only wins when the dealer busts, and hitting costs you nothing.",
        ],
        visual: { kind: "cards", rows: [{ label: "Soft 17", cards: ["AH", "6C"] }, { label: "Soft 18", cards: ["AS", "7D"] }] },
      },
      {
        kind: "explain",
        title: "Soft chart",
        body: ["Against weak dealer cards, soft hands double: you can't bust, and the dealer often will."],
        visual: {
          kind: "table",
          head: ["Your hand", "Play"],
          rows: [
            { left: "Soft 19–20", right: "Stand" },
            { left: "Soft 18", right: "Double vs 3–6, stand vs 2, 7, 8, hit vs 9–A", hot: true },
            { left: "Soft 17", right: "Double vs 3–6, otherwise hit" },
            { left: "Soft 15–16", right: "Double vs 4–6, otherwise hit" },
            { left: "Soft 13–14", right: "Double vs 5–6, otherwise hit" },
          ],
        },
      },
      bjCheck("You have A,7 (soft 18). The dealer shows a 9.", ["AC", "7H"], "9D", HSD),
      bjCheck("You have A,6. The dealer shows a 4.", ["AD", "6S"], "4C", HSD),
      bjCheck("You have A,7. The dealer shows a 2.", ["AH", "7C"], "2S", HSD),
    ],
  },
  {
    id: "bj-pairs",
    track: "blackjack",
    title: "Pairs and splitting",
    blurb: "Two rules you never break, and the pairs that depend on the dealer.",
    minutes: 3,
    practice: [
      { href: "/train/blackjack/?spot=pair-9-7", label: "Drill 9,9 vs 7" },
      { href: "/train/charts/", label: "Pair chart" },
    ],
    steps: () => [
      {
        kind: "explain",
        title: "Always and never",
        body: [
          "**Always split aces and 8s.** Two hands starting from 11 crush one soft 12, and 16 is the worst total in the game, while two hands starting from 8 are fine.",
          "**Never split 10s or 5s.** A 20 already wins most of the time. Two 5s are a hard 10, a doubling hand, not two hands starting from 5.",
        ],
        visual: { kind: "cards", rows: [{ label: "Split", cards: ["8S", "8H"] }, { label: "Keep", cards: ["KC", "QD"] }] },
      },
      {
        kind: "explain",
        title: "The rest depend on the dealer",
        body: ["Split more against bust cards, where an extra hand is extra profit. With double after split allowed:"],
        visual: {
          kind: "table",
          head: ["Pair", "Split against"],
          rows: [
            { left: "9,9", right: "2–6, 8, 9 (stand vs 7, 10, A)", hot: true },
            { left: "7,7", right: "2–7" },
            { left: "6,6", right: "2–6" },
            { left: "4,4", right: "5–6 only" },
            { left: "2,2 / 3,3", right: "2–7" },
          ],
        },
      },
      bjCheck("You have 8,8. The dealer shows a 10.", ["8C", "8D"], "TH", ["hit", "stand", "split"]),
      bjCheck("You have two kings. The dealer shows a 6.", ["KS", "KH"], "6D", HSDP),
      bjCheck("You have 9,9. The dealer shows a 7.", ["9S", "9H"], "7C", HSDP),
      bjCheck("You have 5,5. The dealer shows a 6.", ["5D", "5C"], "6H", HSDP),
    ],
  },
  {
    id: "bj-doubling",
    track: "blackjack",
    title: "Doubling down",
    blurb: "Put more money out when you're the favourite.",
    minutes: 2,
    practice: [
      { href: "/train/blackjack/?spot=hard-10-9", label: "Drill 10 vs 9" },
      { href: "/train/blackjack/", label: "Mixed drill" },
    ],
    steps: () => [
      {
        kind: "explain",
        title: "Double your bet, take one card",
        body: [
          "Doubling doubles your stake and gives you exactly one more card. It's how basic strategy wins back most of the house edge: you bet more in exactly the spots where you're ahead.",
          "The best hands to double are 10 and 11, where a ten-value card makes 20 or 21, and soft hands against a weak dealer.",
        ],
        visual: hand("6C", ["6H", "5S"]),
      },
      {
        kind: "explain",
        title: "Hard doubles",
        body: ["Soft doubles were in the last lesson. For hard hands:"],
        visual: {
          kind: "table",
          head: ["Your total", "Double against"],
          rows: [
            { left: "11", right: "2–10 (hit vs A when the dealer stands on soft 17)", hot: true },
            { left: "10", right: "2–9" },
            { left: "9", right: "3–6" },
            { left: "8 or less", right: "Never" },
          ],
        },
      },
      bjCheck("You have 11. The dealer shows a 10.", ["7S", "4D"], "QC", HSD),
      bjCheck("You have 10. The dealer shows a 10.", ["6C", "4H"], "JS", HSD),
      bjCheck("You have 9. The dealer shows a 2.", ["5S", "4C"], "2H", HSD),
      bjCheck("You have A,4. The dealer shows a 5.", ["AS", "4D"], "5C", HSD),
    ],
  },
  {
    id: "bj-surrender",
    track: "blackjack",
    title: "Surrender",
    blurb: "Giving up half your bet is sometimes the cheapest option.",
    minutes: 2,
    practice: [{ href: "/train/blackjack/?spot=hard-16-10", label: "Drill 16 vs 10" }],
    steps: () => [
      {
        kind: "explain",
        title: "Losing half beats losing more",
        body: [
          "With late surrender, after the dealer checks for blackjack you can give up your first two cards and get half your bet back.",
          "It's right when you'd lose more than half your bet on average by playing on. Hard 16 against a 10 loses roughly 54 cents per dollar even with perfect play, so surrendering for 50 cents is a saving.",
        ],
        visual: { kind: "formula", text: "Surrender when you win < 25% of the time", note: "Losing half every time costs less than losing the whole bet three times in four." },
      },
      {
        kind: "explain",
        title: "Only a handful of hands",
        body: ["Surrender is a rescue, not a habit. At a dealer-stands-on-17 table:"],
        visual: {
          kind: "table",
          head: ["Your hand", "Surrender against"],
          rows: [
            { left: "Hard 16", right: "9, 10, A", hot: true },
            { left: "Hard 15", right: "10" },
            { left: "8,8", right: "Never: split them" },
          ],
        },
      },
      bjCheck("You have 16. The dealer shows a 10.", ["TS", "6C"], "KD", ALL),
      bjCheck("You have 15. The dealer shows a 9.", ["9C", "6D"], "9H", ALL),
      bjCheck("You have 8,8. The dealer shows a 10.", ["8H", "8S"], "TD", [...ALL, "split"]),
    ],
  },
  {
    id: "bj-insurance",
    track: "blackjack",
    title: "Insurance is a sucker bet",
    blurb: "The side bet that sounds safe and costs about 7%.",
    minutes: 2,
    practice: [{ href: "/train/blackjack/", label: "Drill with insurance offers" }],
    steps: () => {
      const ev = insuranceEv(6);
      const ev20 = insuranceEv(6, ["KS", "QH"]);
      const p = 96 / 311;
      return [
        {
          kind: "explain",
          title: "What insurance actually is",
          body: [
            "When the dealer shows an ace you're offered insurance: a side bet of up to half your stake that pays **2 to 1** if the dealer has blackjack.",
            "It doesn't protect your hand. It's a separate bet on one question: is the hole card worth ten?",
          ],
          visual: hand("AS", ["TH", "9C"]),
        },
        {
          kind: "explain",
          title: "Run the numbers",
          body: [
            `A six-deck shoe has 96 ten-value cards. With the ace showing, 311 cards are unseen, so the hole card is a ten ${pct(p)} of the time.`,
            `A 2:1 payout needs 1 in 3 (33%) to break even. At ${pct(p)} the bet loses about **${Math.abs(ev * 100).toFixed(1)}%** of every chip you put on it, far worse than the main game.`,
          ],
          visual: { kind: "formula", text: `EV = 2 × ${pct(p)} − ${pct(1 - p)} ≈ ${(ev * 100).toFixed(1)}%`, note: "Per chip bet on insurance, six decks." },
        },
        {
          kind: "check",
          prompt: "You hold K,Q for 20 and the dealer shows an ace. Take insurance?",
          visual: hand("AD", ["KS", "QH"]),
          options: [
            { id: "take", label: "Take it, protect the 20" },
            { id: "decline", label: "Decline" },
          ],
          answer: "decline",
          why: `Decline. Your two tens are out of the shoe, so a ten under the ace is even less likely: insurance here loses about ${Math.abs(ev20 * 100).toFixed(1)}%.`,
        },
        {
          kind: "explain",
          title: "Even money is the same bet",
          body: [
            "Holding blackjack against an ace, the dealer offers **even money**: a guaranteed 1:1 now instead of 3:2 unless the dealer also has blackjack.",
            "That is exactly insurance on your blackjack, with the same negative expectation. Over time, turning it down pays more.",
          ],
          visual: hand("AH", ["AC", "KD"]),
        },
        {
          kind: "check",
          prompt: "You have blackjack and the dealer shows an ace. Take even money?",
          visual: hand("AH", ["AC", "KD"]),
          options: [
            { id: "take", label: "Take even money" },
            { id: "decline", label: "Decline, play for 3:2" },
          ],
          answer: "decline",
          why: "Decline. Even money is insurance in disguise; the 3:2 payout you keep most of the time is worth more than the guarantee.",
        },
        {
          kind: "check",
          prompt: "Insurance pays 2:1. How often must the hole card be a ten for it to break even?",
          options: [
            { id: "25", label: "25%" },
            { id: "33", label: "33%" },
            { id: "50", label: "50%" },
          ],
          answer: "33",
          why: `Win 2 once, lose 1 twice: break even at 1 in 3. A fresh shoe gives only ${pct(p)}, which is why the bet loses.`,
        },
      ];
    },
  },
  {
    id: "bj-counting",
    track: "blackjack",
    title: "Intro to card counting",
    blurb: "Hi-Lo: track the shoe and know when it favours you.",
    minutes: 4,
    practice: [{ href: "/train/counting/", label: "Counting trainer" }],
    steps: () => {
      const seq: Card[] = ["5H", "KS", "3D", "9C", "2S", "6H", "AD", "4C"];
      const rc = runningCount(seq);
      const seq2: Card[] = ["TS", "2D", "7H", "QC", "AS", "3H"];
      const rc2 = runningCount(seq2);
      const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
      const near = [rc2 - 2, rc2, rc2 + 2].map((n) => ({ id: String(n), label: signed(n) }));
      const tc = trueCount(9, 3);
      return [
        {
          kind: "explain",
          title: "Why the past matters",
          body: [
            "Unlike dice, a shoe remembers. When lots of small cards have been dealt, the rest of the shoe is rich in tens and aces.",
            "That helps you: more blackjacks (paid 3:2 to you, but only 1:1 to the dealer), better doubles, and more dealer busts, since the dealer must hit stiffs.",
          ],
        },
        {
          kind: "explain",
          title: "The Hi-Lo tags",
          body: ["Give every card you see a tag and keep a running total, starting from 0 after the shuffle."],
          visual: {
            kind: "table",
            head: ["Cards", "Tag"],
            rows: [
              { left: "2 – 6", cards: ["2C", "4D", "6S"], right: `+${hiLo("4D")}`, hot: true },
              { left: "7 – 9", cards: ["7H", "8C", "9D"], right: String(hiLo("8C")) },
              { left: "10 – A", cards: ["TS", "KH", "AC"], right: String(hiLo("KH")) },
            ],
          },
        },
        {
          kind: "explain",
          title: "Keep a running count",
          body: [`Add the tags as cards appear. These eight cards come to **${signed(rc)}**: more low cards left the shoe than high ones.`],
          visual: { kind: "cards", rows: [{ cards: seq, note: seq.map((c) => (hiLo(c) > 0 ? "+1" : hiLo(c) < 0 ? "−1" : "0")).join("  ") }], size: "small" },
        },
        {
          kind: "check",
          prompt: "Starting from zero, what is the running count after these cards?",
          visual: { kind: "cards", rows: [{ cards: seq2 }], size: "small" },
          options: near,
          answer: String(rc2),
          why: `${seq2.map((c) => (hiLo(c) > 0 ? "+1" : hiLo(c) < 0 ? "−1" : "0")).join(", ")} adds up to ${signed(rc2)}.`,
        },
        {
          kind: "explain",
          title: "True count: per deck left",
          body: [
            "A +6 with one deck left is huge; with five decks left it's diluted. Divide the running count by the decks still in the shoe to get the **true count**.",
            "Each +1 of true count moves roughly half a percent of edge your way. Counters bet more from about +2, and at +3 or higher even insurance becomes a good bet.",
          ],
          visual: { kind: "formula", text: "True count = running count ÷ decks left", note: `Running +6, 3 decks left → true +${trueCount(6, 3)}` },
        },
        {
          kind: "check",
          prompt: "The running count is +9 and about 3 decks are left. What's the true count?",
          options: [
            { id: "1", label: "+1" },
            { id: "3", label: "+3" },
            { id: "9", label: "+9" },
          ],
          answer: String(tc),
          why: `9 ÷ 3 = +${tc}. A good count: time to raise your bet.`,
        },
      ];
    },
  },
];
