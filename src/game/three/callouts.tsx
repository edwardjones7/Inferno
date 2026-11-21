"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { CARD } from "./canvas-utils";
import { placeCallout, rect, union, type Rect, type Side } from "./callout-layout";
import type { Anchors, CardSlot } from "./table-layout";

export interface CalloutSpec {
  id: string;
  /** the cards it talks about: a player hand index, or -1 for the dealer */
  near: number;
  /** sides to try around those cards, best first */
  sides: readonly Side[];
}

/** Elements outside the canvas that callouts must keep clear of (the result banner). */
export const AVOID_ATTR = "data-callout-avoid";

const MARGIN = 8;
// cards cast a shadow and bow a little; keep callouts this far off the flat footprint
const CARD_PAD = 5;
// camera movement (world units per frame) below which the view counts as at rest
const STILL = 1e-3;

/**
 * Moves each callout element to a clear spot next to its cards every frame. Obstacles are
 * the cards at their final resting spots (so an incoming card never lands under a callout),
 * the plain labels (totals, bets), callouts placed earlier in the list and any element
 * marked with `data-callout-avoid`. The band between the HUD and the controls is the limit.
 */
export function CalloutProjector({
  callouts,
  slots,
  labelAnchors,
  els,
  insets,
}: {
  callouts: readonly CalloutSpec[];
  slots: readonly CardSlot[];
  labelAnchors: Anchors;
  els: React.RefObject<Map<string, HTMLDivElement>>;
  insets: { top: number; bottom: number };
}) {
  const v = useMemo(() => new THREE.Vector3(), []);
  const state = useRef(new Map<string, { side: Side; tight: boolean; overlap: number }>());
  const lastCam = useRef({ pos: new THREE.Vector3(Infinity, 0, 0), look: new THREE.Vector3() });
  const look = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera, size, gl }) => {
    // a moving camera passes over clutter it's about to leave; only judge "no room" at rest
    camera.getWorldDirection(look);
    const still = lastCam.current.pos.distanceTo(camera.position) < STILL && lastCam.current.look.distanceTo(look) < STILL;
    lastCam.current.pos.copy(camera.position);
    lastCam.current.look.copy(look);
    if (!callouts.length) {
      state.current.clear();
      return;
    }
    const { width, height } = size;
    const project = (x: number, y: number, z: number) => {
      v.set(x, y, z).project(camera);
      return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height] as const;
    };

    // every card's footprint on screen, grouped by hand (-1 = dealer)
    const cards = new Map<number, Rect[]>();
    for (const s of slots) {
      const [x, y, z] = s.pos;
      const pts = [
        project(x - CARD.w / 2, y, z - CARD.h / 2),
        project(x + CARD.w / 2, y, z - CARD.h / 2),
        project(x - CARD.w / 2, y, z + CARD.h / 2),
        project(x + CARD.w / 2, y, z + CARD.h / 2),
      ];
      const r = rect(
        Math.min(...pts.map((p) => p[0])) - CARD_PAD,
        Math.min(...pts.map((p) => p[1])) - CARD_PAD,
        Math.max(...pts.map((p) => p[0])) + CARD_PAD,
        Math.max(...pts.map((p) => p[1])) + CARD_PAD,
      );
      if (!cards.has(s.hand)) cards.set(s.hand, []);
      cards.get(s.hand)!.push(r);
    }
    const obstacles: Rect[] = [...cards.values()].flat();

    // plain labels are centred on their anchors (see LabelProjector)
    for (const [id, el] of els.current) {
      const a = labelAnchors[id];
      if (!a || id.startsWith("co:")) continue;
      const [x, y] = project(a[0], a[1], a[2]);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      obstacles.push(rect(x - w / 2, y - h / 2, x + w / 2, y + h / 2));
    }

    // DOM elements laid over the table from outside (the outcome banner)
    const canvas = gl.domElement.getBoundingClientRect();
    for (const el of document.querySelectorAll(`[${AVOID_ATTR}]`)) {
      const b = el.getBoundingClientRect();
      if (b.width && b.height) obstacles.push(rect(b.left - canvas.left, b.top - canvas.top, b.right - canvas.left, b.bottom - canvas.top));
    }

    const bounds = rect(MARGIN, insets.top + MARGIN, width - MARGIN, height - insets.bottom - MARGIN);
    const seen = new Set<string>();
    for (const c of callouts) {
      const el = els.current.get(`co:${c.id}`);
      if (!el) continue;
      const target = union(cards.get(c.near) ?? []);
      if (!target) {
        el.style.setProperty("opacity", "0");
        continue;
      }
      seen.add(c.id);
      const prev = state.current.get(c.id);
      const p = placeCallout(target, { w: el.offsetWidth, h: el.offsetHeight }, c.sides, bounds, obstacles, { prev: prev?.side });
      obstacles.push(p.rect);
      // Nowhere clear with the view at rest (a small phone, the result banner up): switch the
      // callout to its compact form, which drops the long explanation, and keep it that way
      // so it doesn't flick between the two sizes.
      const tight = !!prev?.tight || (still && p.overlap > 0);
      state.current.set(c.id, { side: p.side, tight, overlap: p.overlap });
      if (tight) el.dataset.fit = "tight";
      else delete el.dataset.fit;
      // no easing between frames: any lag would drag the box over the cards while the camera moves
      el.dataset.side = p.side;
      el.style.setProperty("transform", `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%)`);
      el.style.setProperty("opacity", "1");
    }
    for (const id of state.current.keys()) if (!seen.has(id)) state.current.delete(id);
    // dev builds expose what the layout saw, for the overlap check in scripts/check-callouts.py
    if (process.env.NODE_ENV !== "production") {
      const w = window as unknown as { __callouts?: unknown };
      w.__callouts = { cards: [...cards.values()].flat(), bounds, placed: Object.fromEntries(state.current), still };
    }
  });
  return null;
}
