/**
 * How each character looks and emotes. A look is pure data (colors, hair, outfit,
 * accessories, temperament); `figure.tsx` builds a stylized figure from it out of simple
 * shapes, so the whole cast costs no art assets and stays light on phones.
 *
 * Temperament sets the resting face and how strongly each mood shows, so the same "won" or
 * "folded" moment reads differently on a giddy beginner and on a cold final boss.
 */

export type HairStyle = "beanie" | "spiky" | "bob" | "slick" | "bald" | "bun" | "mohawk" | "curly" | "hood" | "messy";
export type Outfit = "hoodie" | "suit" | "cardigan" | "tee" | "jacket" | "vest";
export type Accessory =
  | "glasses"
  | "shades"
  | "headphones"
  | "crown"
  | "beard"
  | "mustache"
  | "bowtie"
  | "tie"
  | "freckles"
  | "earring"
  | "visor"
  | "chain"
  | "scarf";

/** A face: -1..1 smile (negative frowns), 0..1 open mouth, -1..1 brows (negative = angry/focused, positive = worried/surprised), 0..1 heavy lids. */
export interface Face {
  smile: number;
  open: number;
  brow: number;
  lid: number;
}

export interface Temper {
  /** resting face */
  rest: Face;
  /** extra tilt of the mouth: a smirk */
  smirk: number;
  /** 0..1 how big the gestures are (Kindle bounces, Scorch barely moves) */
  energy: number;
  /** the face when betting or raising */
  push: Face;
}

export interface Look {
  skin: string;
  hair: { style: HairStyle; color: string };
  outfit: { style: Outfit; main: string; accent: string };
  eyes: string;
  accessories: Accessory[];
  /** body proportions: shoulders width and head size multipliers */
  build: { width: number; head: number; height: number };
  temper: Temper;
}

const f = (smile: number, open = 0, brow = 0, lid = 0): Face => ({ smile, open, brow, lid });

/* ------------------------------------------------------------------ poker bots */

export const BOT_LOOKS: Record<string, Look> = {
  // Beginner calling station: cheerful, wide-eyed, here for fun
  pip: {
    skin: "#f2c9a0",
    hair: { style: "beanie", color: "#e8a33c" },
    outfit: { style: "hoodie", main: "#f0b44c", accent: "#fff1cf" },
    eyes: "#3b2a1a",
    accessories: ["freckles"],
    build: { width: 0.9, head: 1.12, height: 0.92 },
    temper: { rest: f(0.55, 0.1, 0.35), smirk: 0, energy: 0.85, push: f(0.8, 0.45, 0.5) },
  },
  // Beginner rock: an old regular who waits for aces
  moss: {
    skin: "#d9a982",
    hair: { style: "bald", color: "#c9c4b8" },
    outfit: { style: "cardigan", main: "#3f6b45", accent: "#d8cfb4" },
    eyes: "#2b3a2a",
    accessories: ["glasses", "beard"],
    build: { width: 1.0, head: 1.0, height: 0.95 },
    temper: { rest: f(0.0, 0, 0.1, 0.45), smirk: 0, energy: 0.2, push: f(0.15, 0, -0.2, 0.25) },
  },
  // Beginner maniac: young, restless, raises everything
  kindle: {
    skin: "#e8b48c",
    hair: { style: "spiky", color: "#ff7a26" },
    outfit: { style: "tee", main: "#d1350e", accent: "#ffb36b" },
    eyes: "#40210f",
    accessories: ["headphones"],
    build: { width: 0.88, head: 1.08, height: 0.9 },
    temper: { rest: f(0.65, 0.2, 0.3), smirk: 0.15, energy: 1, push: f(1, 0.6, -0.3) },
  },
  // Intermediate rock: hooded, calm, unreadable
  ash: {
    skin: "#c99a7a",
    hair: { style: "hood", color: "#4a3d34" },
    outfit: { style: "hoodie", main: "#5c4a3d", accent: "#d8d0c8" },
    eyes: "#5a5048",
    accessories: ["scarf"],
    build: { width: 0.95, head: 0.98, height: 1.0 },
    temper: { rest: f(0, 0, -0.05, 0.35), smirk: 0, energy: 0.25, push: f(0.05, 0, -0.35, 0.3) },
  },
  // Intermediate station: big, friendly, can't let a pair go
  cinder: {
    skin: "#8d5a3c",
    hair: { style: "curly", color: "#1e1410" },
    outfit: { style: "jacket", main: "#7a0f0a", accent: "#ff8f6b" },
    eyes: "#24140c",
    accessories: ["mustache", "chain"],
    build: { width: 1.18, head: 1.0, height: 1.02 },
    temper: { rest: f(0.4, 0, 0.15), smirk: 0, energy: 0.6, push: f(0.5, 0.3, 0.3) },
  },
  // Advanced aggro: flashy, shades, pressure everywhere
  blaze: {
    skin: "#e0a77f",
    hair: { style: "mohawk", color: "#ffd24b" },
    outfit: { style: "jacket", main: "#e5360f", accent: "#ffd24b" },
    eyes: "#2a160a",
    accessories: ["shades", "earring"],
    build: { width: 1.05, head: 1.0, height: 1.0 },
    temper: { rest: f(0.45, 0, -0.25), smirk: 0.35, energy: 0.8, push: f(0.75, 0.25, -0.6) },
  },
  // Advanced shark: precise, focused, headphones on
  ember: {
    skin: "#b77b55",
    hair: { style: "bob", color: "#2a0f0a" },
    outfit: { style: "vest", main: "#2b1410", accent: "#ffc24b" },
    eyes: "#3a1608",
    accessories: ["headphones"],
    build: { width: 0.92, head: 1.0, height: 1.0 },
    temper: { rest: f(0.05, 0, -0.3, 0.2), smirk: 0.1, energy: 0.35, push: f(0.15, 0, -0.55, 0.25) },
  },
  // Master: the final boss in a suit and crown
  scorch: {
    skin: "#e6b998",
    hair: { style: "slick", color: "#120806" },
    outfit: { style: "suit", main: "#1a0705", accent: "#ffe9b8" },
    eyes: "#c2410c",
    accessories: ["crown", "tie"],
    build: { width: 1.08, head: 1.0, height: 1.05 },
    temper: { rest: f(0.25, 0, -0.2, 0.45), smirk: 0.45, energy: 0.3, push: f(0.45, 0, -0.45, 0.5) },
  },
};

/** Fallback for a bot id without a look: a neutral figure in the bot's colors. */
export function lookForBot(id: string, colors: [string, string]): Look {
  return (
    BOT_LOOKS[id] ?? {
      skin: "#d9a982",
      hair: { style: "messy", color: "#2a1a10" },
      outfit: { style: "tee", main: colors[1], accent: colors[0] },
      eyes: "#2a1a10",
      accessories: [],
      build: { width: 1, head: 1, height: 1 },
      temper: { rest: f(0.2), smirk: 0, energy: 0.5, push: f(0.4, 0.2, -0.3) },
    }
  );
}

/* ------------------------------------------------------------------ dealers */

export const DEALER_LOOKS: Record<string, Look> = {
  vesper: {
    skin: "#e8bd9a",
    hair: { style: "bun", color: "#3a120a" },
    outfit: { style: "vest", main: "#8f1a0c", accent: "#ffd27a" },
    eyes: "#3a1608",
    accessories: ["bowtie", "earring"],
    build: { width: 0.95, head: 1.0, height: 1.05 },
    temper: { rest: f(0.35, 0, 0.05), smirk: 0.05, energy: 0.45, push: f(0.5, 0.2, 0.2) },
  },
  rook: {
    skin: "#c98f6a",
    hair: { style: "messy", color: "#8a8378" },
    outfit: { style: "vest", main: "#2d3a2a", accent: "#e7dcc0" },
    eyes: "#2b2a24",
    accessories: ["visor", "beard", "bowtie"],
    build: { width: 1.1, head: 1.0, height: 1.0 },
    temper: { rest: f(-0.05, 0, -0.2, 0.35), smirk: 0, energy: 0.3, push: f(0.1, 0, -0.3, 0.3) },
  },
  dot: {
    skin: "#f0cdb0",
    hair: { style: "curly", color: "#ece6dc" },
    outfit: { style: "cardigan", main: "#6b2a4a", accent: "#f3d9a4" },
    eyes: "#3a2a20",
    accessories: ["glasses", "bowtie"],
    build: { width: 0.95, head: 1.05, height: 0.95 },
    temper: { rest: f(0.55, 0, 0.3, 0.15), smirk: 0, energy: 0.5, push: f(0.7, 0.3, 0.4) },
  },
  slick: {
    skin: "#dcae8a",
    hair: { style: "slick", color: "#2a1a10" },
    outfit: { style: "suit", main: "#2a2238", accent: "#c9a6ff" },
    eyes: "#2a1a10",
    accessories: ["shades", "mustache", "tie", "chain"],
    build: { width: 1.0, head: 1.0, height: 1.05 },
    temper: { rest: f(0.4, 0, -0.1, 0.2), smirk: 0.55, energy: 0.55, push: f(0.6, 0.15, -0.2) },
  },
};
