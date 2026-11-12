"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { cardLabel } from "@/lib/blackjack/cards";
import type { RoundView } from "@/lib/blackjack/engine";
import { formatUsd } from "@/lib/currency";
import { ResultTag, TotalBadge } from "../parts";
import type { Anchors } from "./table-layout";

/**
 * Projects label anchors to screen space every frame and moves plain DOM nodes that
 * live in an overlay owned by the main React tree (no extra React roots in the canvas).
 */
export function LabelProjector({ anchors, els }: { anchors: Anchors; els: React.RefObject<Map<string, HTMLDivElement>> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame((state) => {
    const { width, height } = state.size;
    for (const [id, el] of els.current) {
      const a = anchors[id];
      if (!a) continue;
      v.set(a[0], a[1], a[2]).project(state.camera);
      el.style.setProperty("transform", `translate3d(${((v.x + 1) / 2) * width}px, ${((1 - v.y) / 2) * height}px, 0) translate(-50%, -50%)`);
      el.style.setProperty("opacity", "1");
    }
  });
  return null;
}

/** Screen-reader description of the table, since the canvas itself is just pixels. */
export function describe(view: RoundView | null) {
  if (!view) return "No hand in play.";
  const dealer = view.dealer.map((c) => (c ? cardLabel(c) : "hidden card")).join(", ");
  const hands = view.hands.map((h, i) => `Hand ${i + 1}: ${h.cards.map(cardLabel).join(", ")} (${h.total})${h.result ? `, ${h.result}` : ""}`);
  return `Dealer: ${dealer}. ${hands.join(". ")}.`;
}

export function Labels({
  view,
  revealed,
  pendingBetUsd,
  toUsd,
  register,
}: {
  view: RoundView | null;
  revealed: boolean;
  pendingBetUsd: number;
  toUsd: (units: number) => number;
  register: (id: string) => (el: HTMLDivElement | null) => void;
}) {
  const settled = view?.phase === "settled";
  const shown = settled && revealed;
  const cls = "absolute left-0 top-0 flex flex-col items-center gap-1 whitespace-nowrap opacity-0 will-change-transform";
  if (!view) {
    return (
      <div ref={register("pending")} className={cls}>
        <span className="tabular rounded-full bg-ash-950/80 px-3 py-1 font-display text-sm font-bold text-ember-200 ring-1 ring-ember-500/40">
          {formatUsd(pendingBetUsd)}
        </span>
      </div>
    );
  }
  return (
    <>
      {/* hidden while the result is held back, so it doesn't sit as a blank pill in the reveal close-up */}
      {view.dealerTotal && (revealed || !settled) && (
        <div ref={register("dealer")} className={cls}>
          <TotalBadge
            total={revealed || !settled ? view.dealerTotal.total : null}
            soft={view.dealerTotal.soft}
            hiddenHole={!view.dealer[1]}
            bust={shown && view.dealerTotal.total > 21}
          />
        </div>
      )}
      {view.hands.map((h, hi) => (
        <div key={hi} ref={register(`hand${hi}`)} className={cls}>
          {shown && h.result && <ResultTag result={h.result} payoutUsd={toUsd(h.payout ?? 0)} betUsd={toUsd(h.bet)} />}
          <TotalBadge total={h.total} soft={h.soft} bust={h.total > 21} active={view.phase === "player" && hi === view.active} />
          <span className="tabular rounded-full bg-ash-950/80 px-2 py-0.5 text-[11px] font-semibold text-ember-200 ring-1 ring-ash-700">
            {formatUsd(toUsd(h.bet))}
            {h.doubled ? " ×2" : ""}
          </span>
        </div>
      ))}
    </>
  );
}
