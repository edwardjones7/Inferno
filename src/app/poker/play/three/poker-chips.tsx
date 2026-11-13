"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { CHIP_H, chipGeometry, chipMaterials } from "@/app/blackjack/three/chip-geometry";
import { chipsFor } from "@/components/chip";

const COLUMN = 8;

/**
 * A pile of chips worth `amount`, split into short columns so big pots look like pots.
 * The pile glides toward `to` (e.g. from a player's bet spot into the pot, or from the
 * pot to the winner) and starts at `from` when first mounted.
 */
export function ChipPile({ amount, to, from }: { amount: number; to: THREE.Vector3; from?: THREE.Vector3 }) {
  const group = useRef<THREE.Group>(null);
  const born = useRef(false);
  const chips = useMemo(() => (amount > 0 ? chipsFor(amount, 24) : []), [amount]);
  const geo = chipGeometry();

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    if (!born.current) {
      born.current = true;
      g.position.copy(from ?? to);
    }
    g.position.lerp(to, 1 - Math.exp(-dt * 7));
  });

  return (
    <group ref={group} position={from ?? to}>
      {chips.map((v, i) => {
        const col = Math.floor(i / COLUMN);
        const row = i % COLUMN;
        const cx = (col % 3) * 0.4 - (Math.min(chips.length / COLUMN, 3) - 1) * 0.2;
        const cz = Math.floor(col / 3) * 0.4;
        return (
          <mesh
            key={i}
            geometry={geo}
            material={chipMaterials(v)}
            position={[cx + Math.sin(i * 2.1) * 0.008, CHIP_H / 2 + row * (CHIP_H + 0.002), cz + Math.cos(i * 1.7) * 0.008]}
            rotation-y={i * 0.7}
            castShadow
            receiveShadow
          />
        );
      })}
    </group>
  );
}
