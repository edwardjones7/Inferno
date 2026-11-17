/**
 * How each character looks and emotes. A look is pure data (colors, hair, hat, outfit,
 * accessories, temperament); `figure.tsx` builds a stylized figure from it out of simple
 * shapes, so the whole cast costs no art assets and stays light on phones.
 *
 * The cast is a 1940s back-room crew, to match the speakeasy art across the app: fedoras and
 * flat caps, pinstripes and waistcoats, cigars and pinky rings. Each bot keeps its signature
 * colour somewhere on the outfit (tie, band, suspenders) so it still reads as itself.
 *
 * Temperament sets the resting face and how strongly each mood shows, so the same "won" or
 * "folded" moment reads differently on a giddy beginner and on a cold final boss.
 */

export type HairStyle = "slick" | "bald" | "bun" | "curly" | "messy";
export type HatStyle = "fedora" | "flatcap" | "porkpie";
/**
 * suit / doublebreast: jacket over shirt and tie. vest: waistcoat over shirt sleeves.
 * shirt: shirt sleeves rolled up, with suspenders in the accent colour. overcoat: a long coat
 * with the collar turned up.
 */
export type Outfit = "suit" | "doublebreast" | "vest" | "shirt" | "overcoat";
export type Accessory =
  | "glasses"
  | "shades"
  | "beard"
  | "mustache"
  | "stubble"
  | "scar"
  | "freckles"
  | "earring"
  | "visor"
  | "bowtie"
  | "tie"
  | "turtleneck"
  | "cigar"
  | "toothpick"
  | "pocketsquare"
  | "carnation"
  | "ring"
  | "garters"
  | "watchchain";

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
  /** `tilt` cocks the hat: + pulls the brim down over the eyes, − pushes it back */
  hat?: { style: HatStyle; main: string; band: string; tilt?: number };
  /** `main` is the jacket/waistcoat/coat (the shirt itself for "shirt"); `accent` is the tie, suspenders, garters */
  outfit: { style: Outfit; main: string; accent: string; shirt: string; pinstripe?: boolean };
  eyes: string;
  accessories: Accessory[];
  /** body proportions: shoulders width and head size multipliers */
  build: { width: number; head: number; height: number };
  temper: Temper;
}

const f = (smile: number, open = 0, brow = 0, lid = 0): Face => ({ smile, open, brow, lid });

const CREAM = "#d6c9ad";

/* ------------------------------------------------------------------ poker bots */

export const BOT_LOOKS: Record<string, Look> = {
  // Beginner calling station: the newsboy who runs errands for the crew, thrilled to be dealt in
  pip: {
    skin: "#f2c9a0",
    hair: { style: "messy", color: "#b8692a" },
    hat: { style: "flatcap", main: "#8a6a3e", band: "#5e4527", tilt: -0.1 },
    outfit: { style: "shirt", main: "#d9c8a2", accent: "#c97a2b", shirt: "#d9c8a2" },
    eyes: "#3b2a1a",
    accessories: ["freckles", "bowtie"],
    build: { width: 0.9, head: 1.12, height: 0.92 },
    temper: { rest: f(0.55, 0.1, 0.35), smirk: 0, energy: 0.85, push: f(0.8, 0.45, 0.5) },
  },
  // Beginner rock: the old bookkeeper who has seen every hustle and waits for aces
  moss: {
    skin: "#d9a982",
    hair: { style: "bald", color: "#c9c4b8" },
    outfit: { style: "vest", main: "#2f4a33", accent: "#8a9a6a", shirt: "#d2c8b0" },
    eyes: "#2b3a2a",
    accessories: ["glasses", "mustache", "watchchain", "garters", "bowtie"],
    build: { width: 1.0, head: 1.0, height: 0.95 },
    temper: { rest: f(0.0, 0, 0.1, 0.45), smirk: 0, energy: 0.2, push: f(0.15, 0, -0.2, 0.25) },
  },
  // Beginner maniac: a young hothead with his sleeves rolled up, raising everything
  kindle: {
    skin: "#e8b48c",
    hair: { style: "slick", color: "#c85a1e" },
    outfit: { style: "shirt", main: "#d4c6a8", accent: "#b3260c", shirt: "#d4c6a8" },
    eyes: "#40210f",
    accessories: ["tie", "toothpick"],
    build: { width: 0.88, head: 1.08, height: 0.9 },
    temper: { rest: f(0.65, 0.2, 0.3), smirk: 0.15, energy: 1, push: f(1, 0.6, -0.3) },
  },
  // Intermediate rock: the quiet man in the overcoat, hat brim low, unreadable
  ash: {
    skin: "#c99a7a",
    hair: { style: "slick", color: "#2a1d16" },
    hat: { style: "fedora", main: "#2b2624", band: "#5c4a3d", tilt: 0.14 },
    outfit: { style: "overcoat", main: "#3b3330", accent: "#17110f", shirt: "#17110f" },
    eyes: "#5a5048",
    accessories: ["turtleneck", "stubble"],
    build: { width: 0.97, head: 0.98, height: 1.0 },
    temper: { rest: f(0, 0, -0.05, 0.35), smirk: 0, energy: 0.25, push: f(0.05, 0, -0.35, 0.3) },
  },
  // Intermediate station: the big, friendly muscle who can't let a pair go
  cinder: {
    skin: "#8d5a3c",
    hair: { style: "curly", color: "#1e1410" },
    hat: { style: "porkpie", main: "#3a2a20", band: "#7a0f0a" },
    outfit: { style: "doublebreast", main: "#5a1410", accent: "#d9a84e", shirt: CREAM },
    eyes: "#24140c",
    accessories: ["mustache", "tie", "carnation", "ring"],
    build: { width: 1.2, head: 1.0, height: 1.02 },
    temper: { rest: f(0.4, 0, 0.15), smirk: 0, energy: 0.6, push: f(0.5, 0.3, 0.3) },
  },
  // Advanced aggro: the flashy one in a pale fedora and loud pinstripes, pressure everywhere
  blaze: {
    skin: "#e0a77f",
    hair: { style: "slick", color: "#c99a3a" },
    hat: { style: "fedora", main: "#e6dcc4", band: "#c22a0c", tilt: -0.08 },
    outfit: { style: "suit", main: "#7a1a0e", accent: "#ffd24b", shirt: "#1c1210", pinstripe: true },
    eyes: "#2a160a",
    accessories: ["shades", "tie", "pocketsquare", "ring"],
    build: { width: 1.05, head: 1.0, height: 1.0 },
    temper: { rest: f(0.45, 0, -0.25), smirk: 0.35, energy: 0.8, push: f(0.75, 0.25, -0.6) },
  },
  // Advanced shark: the card mechanic in a waistcoat and sleeve garters, precise and cold
  ember: {
    skin: "#b77b55",
    hair: { style: "slick", color: "#1f0b07" },
    outfit: { style: "vest", main: "#24120e", accent: "#d9a23a", shirt: CREAM },
    eyes: "#3a1608",
    accessories: ["garters", "tie", "mustache"],
    build: { width: 0.94, head: 1.0, height: 1.0 },
    temper: { rest: f(0.05, 0, -0.3, 0.2), smirk: 0.1, energy: 0.35, push: f(0.15, 0, -0.55, 0.25) },
  },
  // Master: the boss. Black pinstripe, ember-banded fedora, a lit cigar and a scar to explain
  scorch: {
    skin: "#e6b998",
    hair: { style: "slick", color: "#120806" },
    hat: { style: "fedora", main: "#141010", band: "#c2410c", tilt: 0.06 },
    outfit: { style: "doublebreast", main: "#16100e", accent: "#8f1a0c", shirt: CREAM, pinstripe: true },
    eyes: "#c2410c",
    accessories: ["tie", "cigar", "pocketsquare", "scar", "ring"],
    build: { width: 1.1, head: 1.0, height: 1.05 },
    temper: { rest: f(0.25, 0, -0.2, 0.45), smirk: 0.45, energy: 0.3, push: f(0.45, 0, -0.45, 0.5) },
  },
};

/** Fallback for a bot id without a look: a plain suit in the bot's colors. */
export function lookForBot(id: string, colors: [string, string]): Look {
  return (
    BOT_LOOKS[id] ?? {
      skin: "#d9a982",
      hair: { style: "slick", color: "#2a1a10" },
      hat: { style: "fedora", main: "#2a2220", band: colors[1] },
      outfit: { style: "suit", main: "#2a2220", accent: colors[1], shirt: CREAM },
      eyes: "#2a1a10",
      accessories: ["tie"],
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
    outfit: { style: "vest", main: "#6e140a", accent: "#d9a84e", shirt: CREAM },
    eyes: "#3a1608",
    accessories: ["bowtie", "earring", "garters"],
    build: { width: 0.95, head: 1.0, height: 1.05 },
    temper: { rest: f(0.35, 0, 0.05), smirk: 0.05, energy: 0.45, push: f(0.5, 0.2, 0.2) },
  },
  rook: {
    skin: "#c98f6a",
    hair: { style: "messy", color: "#8a8378" },
    outfit: { style: "vest", main: "#2d3a2a", accent: "#7a6a4a", shirt: "#d4c8aa" },
    eyes: "#2b2a24",
    accessories: ["visor", "beard", "bowtie", "garters"],
    build: { width: 1.1, head: 1.0, height: 1.0 },
    temper: { rest: f(-0.05, 0, -0.2, 0.35), smirk: 0, energy: 0.3, push: f(0.1, 0, -0.3, 0.3) },
  },
  dot: {
    skin: "#f0cdb0",
    hair: { style: "curly", color: "#ece6dc" },
    outfit: { style: "vest", main: "#4a1a30", accent: "#b08a5a", shirt: "#dccdb0" },
    eyes: "#3a2a20",
    accessories: ["glasses", "bowtie", "watchchain"],
    build: { width: 0.95, head: 1.05, height: 0.95 },
    temper: { rest: f(0.55, 0, 0.3, 0.15), smirk: 0, energy: 0.5, push: f(0.7, 0.3, 0.4) },
  },
  slick: {
    skin: "#dcae8a",
    hair: { style: "slick", color: "#2a1a10" },
    outfit: { style: "suit", main: "#1d1a24", accent: "#b08a4a", shirt: CREAM, pinstripe: true },
    eyes: "#2a1a10",
    accessories: ["mustache", "tie", "pocketsquare", "ring"],
    build: { width: 1.0, head: 1.0, height: 1.05 },
    temper: { rest: f(0.4, 0, -0.1, 0.2), smirk: 0.55, energy: 0.55, push: f(0.6, 0.15, -0.2) },
  },
};
