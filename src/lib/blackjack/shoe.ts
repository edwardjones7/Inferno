import { buildShoe, type Card } from "./cards";

export const SHOE_DECKS = 6;

/** Uniform float in [0, 1) from the platform CSPRNG (falls back to Math.random). */
function cryptoRandom(): number {
  const c = globalThis.crypto;
  if (!c?.getRandomValues) return Math.random();
  const buf = new Uint32Array(1);
  c.getRandomValues(buf);
  return buf[0] / 4294967296;
}

/** A freshly shuffled six-deck shoe (Fisher–Yates). */
export function shuffledShoe(decks = SHOE_DECKS, rand: () => number = cryptoRandom): Card[] {
  const shoe = buildShoe(decks);
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}
