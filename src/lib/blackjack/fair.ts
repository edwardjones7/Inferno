/**
 * Provably fair shuffling.
 *
 * Before a round the player can see sha256(serverSeed). The shoe for the round is a
 * Fisher-Yates shuffle driven by floats derived from
 *   HMAC_SHA256(key = serverSeed, msg = `${clientSeed}:${nonce}:${block}`)
 * Each 32-byte HMAC yields 8 floats (4 bytes each). Once the server seed is rotated it
 * is revealed, and anyone can rebuild every shoe it produced with this exact file.
 *
 * Runs identically in Node and the browser (pure JS hashing), so the verifier page
 * uses the same code as the server.
 */
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { buildShoe, type Card } from "./cards";

export const SHOE_DECKS = 6;

export function sha256Hex(input: string): string {
  return bytesToHex(sha256(utf8ToBytes(input)));
}

export function randomSeed(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

/** Deterministic floats in [0, 1) for a seed pair + nonce. */
export function fairFloats(serverSeed: string, clientSeed: string, nonce: number, count: number): number[] {
  const key = utf8ToBytes(serverSeed);
  const out: number[] = [];
  for (let block = 0; out.length < count; block++) {
    const bytes = hmac(sha256, key, utf8ToBytes(`${clientSeed}:${nonce}:${block}`));
    for (let i = 0; i < 32 && out.length < count; i += 4) {
      out.push(bytes[i] / 256 + bytes[i + 1] / 256 ** 2 + bytes[i + 2] / 256 ** 3 + bytes[i + 3] / 256 ** 4);
    }
  }
  return out;
}

/** The full shuffled shoe for a round. Cards are dealt from index 0 upward. */
export function fairShoe(serverSeed: string, clientSeed: string, nonce: number, decks = SHOE_DECKS): Card[] {
  const shoe = buildShoe(decks);
  const floats = fairFloats(serverSeed, clientSeed, nonce, shoe.length - 1);
  for (let i = shoe.length - 1, k = 0; i > 0; i--, k++) {
    const j = Math.floor(floats[k] * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}
