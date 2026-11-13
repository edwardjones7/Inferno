/**
 * Table presets. Each is a rule set the engine, strategy and trainer all understand.
 * House edges were measured by simulating 1,000,000 perfect basic-strategy hands per
 * table with this engine (6 decks, fresh shuffle every hand).
 */
import { DEFAULT_RULES, type Rules } from "./engine";

export interface TableInfo {
  id: TableId;
  name: string;
  /** compact rules summary for chips/badges */
  short: string;
  blurb: string;
  rules: Rules;
  /** house edge with perfect basic strategy, percent */
  edge: number;
}

export type TableId = "classic" | "h17" | "sixfive" | "oldschool";

export const TABLES: Record<TableId, TableInfo> = {
  classic: {
    id: "classic",
    name: "Inferno Classic",
    short: "S17 · 3:2 · DAS · Surrender",
    blurb: "Player-friendly rules. Dealer stands on all 17s.",
    rules: DEFAULT_RULES,
    edge: 0.32,
  },
  h17: {
    id: "h17",
    name: "Hit 17",
    short: "H17 · 3:2 · DAS · Surrender",
    blurb: "Dealer hits soft 17, like most Las Vegas shoe games. A few plays change.",
    rules: { ...DEFAULT_RULES, dealerHitsSoft17: true },
    edge: 0.51,
  },
  oldschool: {
    id: "oldschool",
    name: "Old School",
    short: "S17 · 3:2 · No DAS · No surrender",
    blurb: "No doubling after splits and no surrender, so small pairs split less.",
    rules: { ...DEFAULT_RULES, doubleAfterSplit: false, surrender: false },
    edge: 0.54,
  },
  sixfive: {
    id: "sixfive",
    name: "6:5 Trap",
    short: "H17 · 6:5 · DAS · No surrender",
    blurb: "Blackjack pays 6:5 instead of 3:2. Same strategy, six times the house edge. Learn to walk away.",
    rules: { ...DEFAULT_RULES, dealerHitsSoft17: true, blackjackPays: 1.2, surrender: false },
    edge: 1.95,
  },
};

export const TABLE_IDS = Object.keys(TABLES) as TableId[];
export const isTableId = (v: unknown): v is TableId => typeof v === "string" && v in TABLES;
export const tableOf = (id: unknown): TableInfo => (isTableId(id) ? TABLES[id] : TABLES.classic);
