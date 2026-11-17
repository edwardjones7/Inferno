/**
 * The blackjack dealers: one per table, each with a personality that fits the table's rules.
 * Dealers never give strategy advice that contradicts the coach. Their lines are flavour,
 * and where they touch on rules they're true (the 6:5 dealer's patter is the lesson: 6:5
 * really does cost you).
 */
import type { TableId } from "./tables";

export type DealerEvent = "greet" | "playerBlackjack" | "playerWin" | "playerBust" | "dealerBust" | "dealerBlackjack" | "push" | "dealerWin";

export interface DealerProfile {
  id: string;
  name: string;
  title: string;
  bio: string;
  lines: Record<DealerEvent, string[]>;
}

export const DEALERS: Record<string, DealerProfile> = {
  vesper: {
    id: "vesper",
    name: "Vesper",
    title: "House dealer",
    bio: "Vesper runs the Classic table: fast hands, clean pitches, and a genuine smile when you hit a blackjack.",
    lines: {
      greet: ["Welcome to the Classic. Bets in when you're ready.", "Good rules here: 3 to 2, dealer stands on soft 17."],
      playerBlackjack: ["Blackjack! Three to two, paid with pleasure.", "There it is. Nicely done."],
      playerWin: ["Winner. Here you go.", "Well played."],
      playerBust: ["Too many, sorry.", "That one went over."],
      dealerBust: ["I'm over. Everybody wins.", "Dealer busts!"],
      dealerBlackjack: ["Blackjack for the house, I'm afraid.", "Sorry, I had it underneath."],
      push: ["Push. Your bet stays.", "Same total. Push."],
      dealerWin: ["House takes that one.", "Mine this time."],
    },
  },
  rook: {
    id: "rook",
    name: "Rook",
    title: "Thirty years on the floor",
    bio: "Rook has dealt every game in the building and hits soft 17 like the house tells him to. Gruff, fair, secretly rooting for you.",
    lines: {
      greet: ["Dealer hits soft 17 here. Costs you a little. Sit down.", "Chips in the circle. Let's go."],
      playerBlackjack: ["Hm. Blackjack. Paid.", "Good card, kid."],
      playerWin: ["Yours.", "Fair and square."],
      playerBust: ["Bust.", "Over. Happens."],
      dealerBust: ["Bah. Over.", "There goes the house's money."],
      dealerBlackjack: ["House blackjack.", "Ace in the hole. Tough."],
      push: ["Push.", "Nobody wins. Again."],
      dealerWin: ["House.", "That's mine."],
    },
  },
  dot: {
    id: "dot",
    name: "Dot",
    title: "Old School hostess",
    bio: "Dot has dealt the Old School table since it opened. Single-hand, no surrender, and endless encouragement.",
    lines: {
      greet: ["Hello, sweetheart! Pull up a chair.", "Old rules at this table, honey: no surrender."],
      playerBlackjack: ["Oh, blackjack! Look at you!", "Wonderful! Three to two for you, dear."],
      playerWin: ["You win, honey!", "There we go!"],
      playerBust: ["Oh, too bad, dear.", "Over, I'm afraid. Next one's yours."],
      dealerBust: ["Oops, I went over! Lucky you.", "Silly me, bust!"],
      dealerBlackjack: ["Oh no, I'm so sorry, dear.", "Blackjack for me. I wish it weren't."],
      push: ["A tie! Keep your bet, honey.", "Push, nobody loses."],
      dealerWin: ["Not this time, dear.", "Mine, but you'll get the next."],
    },
  },
  slick: {
    id: "slick",
    name: "Slick",
    title: "Smiles at the 6:5 table",
    bio: "Slick deals the 6:5 table and wants you to love it. Notice what he doesn't mention: a 6:5 blackjack pays less than 3:2, and the house edge more than triples.",
    lines: {
      greet: ["Welcome, welcome! Six to five, practically three to two!", "Best seat in the house, friend."],
      playerBlackjack: ["Blackjack! Six to five, my friend. Barely any difference!", "Look at that! Paid six to five, of course."],
      playerWin: ["A winner! Stay a while.", "See? This table loves you."],
      playerBust: ["Ooh, unlucky. Go again?", "Over! Shake it off, another hand."],
      dealerBust: ["Ha! Over. Your lucky night.", "Bust! Keep it rolling."],
      dealerBlackjack: ["Blackjack. Happens to the best of us.", "Ah, house blackjack. Next one, friend."],
      push: ["Push! Free hand, basically.", "Tie goes to... nobody!"],
      dealerWin: ["House. Run it back?", "Close one. Again?"],
    },
  },
};

export const TABLE_DEALER: Record<TableId, string> = {
  classic: "vesper",
  h17: "rook",
  oldschool: "dot",
  sixfive: "slick",
};

export const dealerFor = (tableId: TableId): DealerProfile => DEALERS[TABLE_DEALER[tableId]] ?? DEALERS.vesper;
