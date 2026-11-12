"use client";

import { CuboidCollider, Physics, RigidBody, useAfterPhysicsStep, useBeforePhysicsStep, useRapier } from "@react-three/rapier";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { chipsFor } from "@/components/chip";
import type { RoundView } from "@/lib/blackjack/engine";
import { prng, TABLE } from "./canvas-utils";
import { CHIP_DENOMS, CHIP_H, CHIP_R, chipGeometry, chipMaterials } from "./chip-geometry";
import { ChipSim, GRAVITY, INSTANCE_CAP, STEP, type PileSpec } from "./chip-sim";
import { useSceneFx } from "./fx-context";
import { BET_Z, handX, TRAY } from "./table-layout";

/* ------------------------------------------------------------------ tray */

const TRAY_W = 3.5;
const TRAY_D = 0.56;
const TUBES = [1000, 500, 100, 25, 5, 1, 5, 25];
const TUBE_FILL = [7, 9, 10, 10, 8, 10, 6, 9];
const TUBE_PITCH = 0.405;

/** Dealer's float: rows of chips standing on edge in a dark tray with dividers. */
export function ChipTray() {
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const perDenom = useMemo(() => {
    const rnd = prng(77);
    const out = new Map<number, THREE.Matrix4[]>();
    const e = new THREE.Euler();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    TUBES.forEach((v, ti) => {
      const x = (ti - (TUBES.length - 1) / 2) * TUBE_PITCH;
      const n = TUBE_FILL[ti];
      for (let j = 0; j < n; j++) {
        // chips lie face-forward in the trough; the last one leans back a touch
        const lean = j === n - 1 ? -0.12 : (rnd() - 0.5) * 0.03;
        e.set(Math.PI / 2 + lean, rnd() * Math.PI * 2, 0, "XYZ");
        q.setFromEuler(e);
        p.set(x + (rnd() - 0.5) * 0.006, 0.07 + CHIP_R * 0.86, -TRAY_D / 2 + 0.04 + j * (CHIP_H + 0.002));
        const list = out.get(v) ?? [];
        list.push(new THREE.Matrix4().compose(p, q, one));
        out.set(v, list);
      }
    });
    return out;
  }, []);

  useLayoutEffect(() => {
    CHIP_DENOMS.forEach((v, i) => {
      const m = refs.current[i];
      const list = perDenom.get(v);
      if (!m || !list) return;
      list.forEach((mat, k) => m.setMatrixAt(k, mat));
      m.count = list.length;
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    });
  }, [perDenom]);

  const geo = chipGeometry();
  return (
    <group position={[TRAY.x, 0, TRAY.z]}>
      {/* base */}
      <mesh position-y={0.035} receiveShadow castShadow>
        <boxGeometry args={[TRAY_W, 0.07, TRAY_D]} />
        <meshStandardMaterial color="#100907" metalness={0.55} roughness={0.38} />
      </mesh>
      {/* front / back lips */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0.1, s * (TRAY_D / 2 - 0.015)]} castShadow receiveShadow>
          <boxGeometry args={[TRAY_W, 0.13, 0.03]} />
          <meshStandardMaterial color="#1a0f0a" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      {/* dividers between the tubes */}
      {Array.from({ length: TUBES.length + 1 }, (_, i) => (
        <mesh key={i} position={[(i - TUBES.length / 2) * TUBE_PITCH, 0.12, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.018, 0.17, TRAY_D - 0.03]} />
          <meshStandardMaterial color="#2a160c" metalness={0.8} roughness={0.28} emissive="#ff5a1f" emissiveIntensity={0.05} />
        </mesh>
      ))}
      {CHIP_DENOMS.map((v, i) =>
        perDenom.has(v) ? (
          <instancedMesh
            key={v}
            ref={(m) => {
              refs.current[i] = m;
            }}
            args={[geo, chipMaterials(v), perDenom.get(v)!.length]}
            castShadow
            receiveShadow
          />
        ) : null,
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ stakes */

export interface StakesProps {
  view: RoundView | null;
  roundId: string | null;
  /** true once the result of a settled round is being shown */
  revealed: boolean;
  /** bet the player has set up for the next hand, in USD */
  pendingBetUsd: number;
  toUsd: (units: number) => number;
}

/** Every chip on the felt: the pending bet, each hand's stake, payouts and lost stakes. */
export function Stakes(props: StakesProps) {
  return (
    <Suspense fallback={null}>
      <Physics
        gravity={[0, -GRAVITY, 0]}
        timeStep={STEP}
        interpolate={false}
        colliders={false}
        numSolverIterations={8}
        maxCcdSubsteps={2}
      >
        <TableColliders />
        <ChipLayer {...props} />
      </Physics>
    </Suspense>
  );
}

/** Felt, an elliptical barrier along the rail, the dealer's back edge and the tray. */
function TableColliders() {
  const rail = useMemo(() => {
    const { halfWidth: W, halfDepth: D } = TABLE;
    const rx = W - 0.05;
    const rz = D * 2 - 0.05;
    const N = 28;
    const segs: { pos: [number, number, number]; rot: [number, number, number]; half: number }[] = [];
    for (let i = 0; i < N; i++) {
      const a0 = Math.PI * (i / N);
      const a1 = Math.PI * ((i + 1) / N);
      const x0 = Math.cos(a0) * rx;
      const z0 = -D + Math.sin(a0) * rz;
      const x1 = Math.cos(a1) * rx;
      const z1 = -D + Math.sin(a1) * rz;
      const dx = x1 - x0;
      const dz = z1 - z0;
      segs.push({
        pos: [(x0 + x1) / 2, 0.3, (z0 + z1) / 2],
        rot: [0, Math.atan2(-dz, dx), 0],
        half: Math.hypot(dx, dz) / 2 + 0.06,
      });
    }
    return segs;
  }, []);

  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[TABLE.halfWidth + 1, 0.1, TABLE.halfDepth + 1.5]} position={[0, -0.1, 0]} friction={0.9} restitution={0.1} />
      {rail.map((s, i) => (
        <CuboidCollider key={i} args={[s.half, 0.3, 0.06]} position={s.pos} rotation={s.rot} friction={0.4} restitution={0.25} />
      ))}
      <CuboidCollider args={[TABLE.halfWidth + 0.2, 0.3, 0.06]} position={[0, 0.3, -TABLE.halfDepth - 0.04]} friction={0.4} />
      <CuboidCollider args={[TRAY_W / 2, 0.09, TRAY_D / 2]} position={[TRAY.x, 0.09, TRAY.z]} friction={0.7} />
    </RigidBody>
  );
}

function buildSpecs(view: RoundView | null, roundId: string | null, revealed: boolean, pendingBetUsd: number, toUsd: (u: number) => number) {
  if (!view || !roundId) {
    const values = pendingBetUsd > 0 ? chipsFor(pendingBetUsd, 10) : [];
    return [{ key: "pending", kind: "bet", x: 0, z: BET_Z, values, from: "player" } satisfies PileSpec];
  }
  const shown = view.phase === "settled" && revealed;
  const specs: PileSpec[] = [];
  view.hands.forEach((h, hi) => {
    const x = handX(hi, view.hands.length);
    const betUsd = toUsd(h.bet);
    const lost = shown && (h.result === "lose" || h.result === "surrender");
    specs.push({
      key: `${roundId}:s${hi}`,
      kind: "bet",
      x,
      z: BET_Z,
      values: chipsFor(betUsd, 10),
      from: "player",
      adopt: hi === 0 ? "pending" : undefined,
      lost,
    });
    const profitUsd = toUsd((h.payout ?? 0) - h.bet);
    if (!shown || profitUsd <= 0) return;
    const payout = chipsFor(profitUsd, 10);
    specs.push({ key: `${roundId}:p${hi}`, kind: "payout", x: x + 0.44, z: BET_Z, values: payout, from: "tray", delay: 0.35 + hi * 0.25 });
    const many = chipsFor(profitUsd, 40);
    const big = h.result === "blackjack" || (h.payout ?? 0) >= 5 * h.bet || many.length >= 10;
    if (big) {
      const n = h.result === "blackjack" ? 14 : 10;
      // scatter mostly the smaller denominations of the win
      const pool = many.slice(-Math.max(3, Math.min(many.length, 8)));
      const values = Array.from({ length: n }, (_, i) => pool[(i * 5 + 3) % pool.length]);
      specs.push({ key: `${roundId}:x${hi}`, kind: "spill", x, z: BET_Z, values, from: "tray", delay: 0.55 + payout.length * 0.09 + hi * 0.25 });
    }
  });
  return specs;
}

function ChipLayer({ view, roundId, revealed, pendingBetUsd, toUsd }: StakesProps) {
  const { world, rapier } = useRapier();
  const { reducedMotion } = useSceneFx();
  const sim = useRef<ChipSim | null>(null);
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);

  useEffect(
    () => () => {
      sim.current?.dispose();
      sim.current = null;
    },
    [],
  );

  useEffect(() => {
    sim.current ??= new ChipSim(world, rapier);
    sim.current.sync(buildSpecs(view, roundId, revealed, pendingBetUsd, toUsd), reducedMotion);
  }, [world, rapier, view, roundId, revealed, pendingBetUsd, toUsd, reducedMotion]);

  useBeforePhysicsStep(() => sim.current?.beforeStep());
  useAfterPhysicsStep(() => sim.current?.afterStep(meshes.current));

  const geo = chipGeometry();
  return (
    <>
      {CHIP_DENOMS.map((v, i) => (
        <instancedMesh
          key={v}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          args={[geo, chipMaterials(v), INSTANCE_CAP]}
          count={0}
          frustumCulled={false}
          castShadow
          receiveShadow
        />
      ))}
    </>
  );
}
