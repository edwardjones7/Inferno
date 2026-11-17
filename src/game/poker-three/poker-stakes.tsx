"use client";

import { CuboidCollider, Physics, RigidBody } from "@react-three/rapier";
import { Suspense, useMemo } from "react";
import { PhysicsChips } from "@/game/three/chips";
import { GRAVITY, STEP, type PileSpec } from "@/game/three/chip-sim";
import { columns } from "@/lib/poker/stake";
import { FELT } from "./poker-layout";

/**
 * Where the chips you're putting in land: open felt to the right of your bet spot, clear of
 * your cards (they sit at z 1.27..2.17) and of the pot.
 */
export const STAKE_POS = { x: 0.85, z: 1.02 } as const;
/** column offsets from STAKE_POS: two in front, two staggered behind */
const COLUMN_AT: [number, number][] = [
  [0, 0],
  [0.36, 0],
  [0.18, -0.32],
  [0.54, -0.32],
];
/** the middle of the cluster, for the amount tag and the camera */
export const STAKE_CENTER = { x: STAKE_POS.x + 0.22, z: STAKE_POS.z - 0.12 } as const;

/**
 * The bet you're building on your turn, as the real chips you pushed: each chip you tap or
 * drag from the rail is tossed onto the felt and settles into short columns, and taking one
 * back lifts it off the top. Same physics as the blackjack table.
 */
export function PokerStakes({ chips, pileKey, onTap }: { chips: readonly number[]; pileKey: string; onTap?: () => void }) {
  const specs = useMemo<PileSpec[]>(() => {
    const cols = columns(chips);
    // always list every column slot, so emptying one slides its chips off the top
    return COLUMN_AT.map(([dx, dz], i) => ({
      key: `${pileKey}:c${i}`,
      kind: "bet" as const,
      x: STAKE_POS.x + dx,
      z: STAKE_POS.z + dz,
      values: cols[i] ?? [],
      from: "player" as const,
    }));
  }, [chips, pileKey]);
  return (
    <>
      <Suspense fallback={null}>
        <Physics gravity={[0, -GRAVITY, 0]} timeStep={STEP} interpolate={false} colliders={false} numSolverIterations={8} maxCcdSubsteps={2}>
          <FeltColliders />
          <PhysicsChips specs={specs} />
        </Physics>
      </Suspense>
      {onTap && (
        <mesh
          position={[STAKE_CENTER.x, 0.02, STAKE_CENTER.z]}
          rotation-x={-Math.PI / 2}
          onClick={(e) => {
            e.stopPropagation();
            onTap();
          }}
          onPointerOver={() => (document.body.style.cursor = "pointer")}
          onPointerOut={() => (document.body.style.cursor = "")}
        >
          <circleGeometry args={[0.5, 24]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}

/** The felt and a ring of low walls along the rail, so a wild toss stays on the table. */
function FeltColliders() {
  const rail = useMemo(() => {
    const rx = FELT.rx - 0.05;
    const rz = FELT.rz - 0.05;
    const N = 40;
    const segs: { pos: [number, number, number]; rot: [number, number, number]; half: number }[] = [];
    for (let i = 0; i < N; i++) {
      const a0 = (Math.PI * 2 * i) / N;
      const a1 = (Math.PI * 2 * (i + 1)) / N;
      const x0 = Math.cos(a0) * rx;
      const z0 = Math.sin(a0) * rz;
      const x1 = Math.cos(a1) * rx;
      const z1 = Math.sin(a1) * rz;
      segs.push({
        pos: [(x0 + x1) / 2, 0.3, (z0 + z1) / 2],
        rot: [0, Math.atan2(-(z1 - z0), x1 - x0), 0],
        half: Math.hypot(x1 - x0, z1 - z0) / 2 + 0.06,
      });
    }
    return segs;
  }, []);
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[FELT.rx + 1, 0.1, FELT.rz + 1]} position={[0, -0.1, 0]} friction={0.9} restitution={0.1} />
      {rail.map((s, i) => (
        <CuboidCollider key={i} args={[s.half, 0.3, 0.06]} position={s.pos} rotation={s.rot} friction={0.4} restitution={0.25} />
      ))}
    </RigidBody>
  );
}
