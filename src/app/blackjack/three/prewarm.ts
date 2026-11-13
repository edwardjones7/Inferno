"use client";

import { buildShoe } from "@/lib/blackjack/cards";
import { cardBack, cardFace, cardFoilMask, isFoil, paperGrain } from "./card-textures";
import { chipSide, chipTop } from "./chip-textures";
import { crackMaskTexture } from "./felt-cracks";
import { feltTexture } from "./felt-texture";
import { feltNormalTexture, leatherNormalTexture } from "./table-textures";

let started = false;

/**
 * Paints every procedural texture the table needs (felt, crack mask, fabric/leather
 * normals, chips, all 52 card faces) in small idle-time slices. They're cached by the
 * painters, so when the table later mounts nothing has to be painted on the main thread.
 */
export function prewarmTableAssets() {
  if (started || typeof window === "undefined") return;
  started = true;
  const jobs: (() => unknown)[] = [
    feltTexture,
    crackMaskTexture,
    feltNormalTexture,
    leatherNormalTexture,
    cardBack,
    paperGrain,
    ...[1, 5, 25, 100, 500, 1000].flatMap((v) => [() => chipTop(v), () => chipSide(v)]),
    ...buildShoe(1).flatMap((c) => (isFoil(c) ? [() => cardFace(c), () => cardFoilMask(c)] : [() => cardFace(c)])),
  ];
  const idle = (cb: (d?: IdleDeadline) => void) =>
    typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 32);
  const step = (deadline?: IdleDeadline) => {
    const until = performance.now() + Math.max(4, Math.min(12, deadline?.timeRemaining() ?? 8));
    while (jobs.length && performance.now() < until) jobs.shift()!();
    if (jobs.length) idle(step);
  };
  // painters read CSS font variables, so wait for the web fonts first
  void document.fonts.ready.then(() => idle(step));
}
