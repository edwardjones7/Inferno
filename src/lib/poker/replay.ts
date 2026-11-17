/**
 * Rebuilds a saved poker hand as a sequence of table states, one per log event, so the
 * hand can be replayed on the 3D table: chips going in street by street, folds, the board
 * coming out, cards turned over at showdown and the pot pushed to the winner. Everything is
 * read back from the hand's log, which records every blind, action and amount.
 */
import type { Card } from "../blackjack/cards";
import type { HandEvent, PokerState, Seat, Street } from "./game-types";
import type { PokerHandRecord, PokerNote } from "../store";

export interface ReplayFrame {
  state: PokerState;
  /** the log event this frame shows (null for the opening frame) */
  event: HandEvent | null;
  /** the coach's note on the hero's decision at this event, if any */
  note: PokerNote | null;
  /** bot seats whose cards are face up at this point (showdown) */
  revealed: number[];
}

/** Placeholder hole cards for bots whose cards were never shown (always drawn face down). */
const HIDDEN: Card[] = ["2C", "3C"];

const num = (text: string, re: RegExp) => {
  const m = text.match(re);
  return m ? Number(m[1]) : 0;
};

export function replayFrames(rec: PokerHandRecord): ReplayFrame[] {
  const seats: Seat[] = rec.names.map((name, id) => ({
    id,
    name,
    isHero: id === 0,
    style: null,
    stack: 0,
    hole: id === 0 ? rec.hole : (rec.shown[id] ?? HIDDEN),
    folded: false,
    allIn: false,
    committed: 0,
    totalCommitted: 0,
    acted: false,
    lastAction: null,
  }));
  const bySeatName = new Map(rec.names.map((n, i) => [n, i]));
  const s: PokerState = {
    handNo: rec.handNo,
    sb: 0,
    bb: rec.bb,
    button: 0,
    seats,
    board: [],
    deck: [],
    street: "preflop",
    toAct: null,
    currentBet: 0,
    lastRaiseSize: rec.bb,
    pot: 0,
    pots: [],
    winners: [],
    log: [],
  };
  const revealed = new Set<number>();
  const notes = new Map(rec.notes.map((n) => [n.at, n]));

  const put = (x: Seat, amount: number) => {
    x.committed += amount;
    x.totalCommitted += amount;
  };
  const snapshot = (event: HandEvent | null, i: number): ReplayFrame => ({
    state: {
      ...s,
      seats: s.seats.map((x) => ({ ...x })),
      board: [...s.board],
      winners: [...s.winners],
      pot: s.seats.reduce((n, x) => n + x.totalCommitted, 0),
      log: rec.log.slice(0, i + 1),
    },
    event,
    note: event ? (notes.get(i) ?? null) : null,
    revealed: [...revealed],
  });

  const frames: ReplayFrame[] = [snapshot(null, -1)];
  rec.log.forEach((e, i) => {
    const x = e.seat !== undefined ? s.seats[e.seat] : undefined;
    s.street = e.street as Street;
    switch (e.kind) {
      case "deal": {
        const m = e.text.match(/: (.+) has the button/);
        if (m && bySeatName.has(m[1])) s.button = bySeatName.get(m[1])!;
        break;
      }
      case "blind":
        if (x) {
          const a = num(e.text, /blind (\d+)/);
          put(x, a);
          x.lastAction = `${/small/.test(e.text) ? "SB" : "BB"} ${a}`;
        }
        break;
      case "action":
        if (/^Uncalled (\d+) returned/.test(e.text)) {
          const back = num(e.text, /^Uncalled (\d+)/);
          if (x) {
            x.committed -= back;
            x.totalCommitted -= back;
          }
        } else if (x) {
          if (/ folds$/.test(e.text)) {
            x.folded = true;
            x.lastAction = "Fold";
          } else if (/ checks$/.test(e.text)) {
            x.lastAction = "Check";
          } else if (/ calls (\d+)/.test(e.text)) {
            put(x, num(e.text, / calls (\d+)/));
            x.lastAction = `Call ${x.committed}`;
          } else if (/ (?:bets|raises to) (\d+)/.test(e.text)) {
            const to = num(e.text, / (?:bets|raises to) (\d+)/);
            put(x, to - x.committed);
            x.lastAction = `${/ bets /.test(e.text) ? "Bet" : "Raise"} ${to}`;
          }
          if (/\(all-in\)/.test(e.text)) x.allIn = true;
        }
        break;
      case "board": {
        // a new street: bets go into the middle
        for (const o of s.seats) {
          o.committed = 0;
          if (!o.folded && !o.allIn) o.lastAction = null;
        }
        const cards = e.text.split(": ")[1]?.split(" ").filter(Boolean) as Card[] | undefined;
        if (cards) s.board.push(...cards.filter((c) => !s.board.includes(c)));
        break;
      }
      case "showdown":
        if (x && !x.isHero) revealed.add(x.id);
        break;
      case "win":
        if (x) {
          s.street = "done";
          for (const o of s.seats) o.committed = 0;
          s.winners.push({ seat: x.id, amount: num(e.text, /wins (\d+)/), pot: s.winners.length, ...(/ with /.test(e.text) ? { hand: e.text.split(" with ")[1] } : {}) });
        }
        break;
    }
    frames.push(snapshot(e, i));
  });
  return frames;
}
