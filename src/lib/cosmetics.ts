/**
 * Table and card designs: a small typed catalogue of looks for the 3D (and 2D) tables.
 * Purely cosmetic: they change nothing about the game, and they are never bought with
 * chips (AGENTS.md). Which ones need Inferno Pro is decided in `gates.ts`; how each one is
 * painted lives with the textures in `src/game/designs/`.
 */

export type CosmeticKind = "felt" | "back";

export const FELT_IDS = ["crimson", "back-room", "midnight"] as const;
export type FeltId = (typeof FELT_IDS)[number];

export const BACK_IDS = ["house", "gilded", "marquee"] as const;
export type CardBackId = (typeof BACK_IDS)[number];

export type CosmeticId = FeltId | CardBackId;

export interface Cosmetic<K extends CosmeticKind = CosmeticKind> {
  id: K extends "felt" ? FeltId : CardBackId;
  kind: K;
  name: string;
  /** one line for the picker */
  blurb: string;
}

export const FELTS: readonly Cosmetic<"felt">[] = [
  { id: "crimson", kind: "felt", name: "Crimson", blurb: "Deep red baize printed in antique gold, dark leather rail." },
  { id: "back-room", kind: "felt", name: "Back Room", blurb: "Green baize, oxblood leather, brass trim." },
  { id: "midnight", kind: "felt", name: "Midnight", blurb: "Navy cloth, silver print and a nickel trim." },
];

export const CARD_BACKS: readonly Cosmetic<"back">[] = [
  { id: "house", kind: "back", name: "House", blurb: "Oxblood with a brass lattice and the flame." },
  { id: "gilded", kind: "back", name: "Gilded", blurb: "Black lacquer and gold, stepped like a skyline." },
  { id: "marquee", kind: "back", name: "Marquee", blurb: "A sunburst fan under a ring of bulbs." },
];

export const DEFAULT_FELT: FeltId = "crimson";
export const DEFAULT_BACK: CardBackId = "house";

export const isFeltId = (v: unknown): v is FeltId => (FELT_IDS as readonly unknown[]).includes(v);
export const isBackId = (v: unknown): v is CardBackId => (BACK_IDS as readonly unknown[]).includes(v);

export const DEFAULT_COSMETIC: Record<CosmeticKind, CosmeticId> = { felt: DEFAULT_FELT, back: DEFAULT_BACK };

export function cosmeticById(id: string): Cosmetic | undefined {
  return [...FELTS, ...CARD_BACKS].find((c) => c.id === id);
}

/** Where the choice is kept: a device preference in localStorage, like graphics quality. */
export const FELT_KEY = "inferno:felt";
export const BACK_KEY = "inferno:card-back";
