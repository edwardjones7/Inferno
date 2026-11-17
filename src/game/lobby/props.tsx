"use client";

import * as THREE from "three";
import { CARD } from "@/game/three/canvas-utils";
import { cardBack, cardFace } from "@/game/three/card-textures";
import { CHIP_H, chipGeometry, chipMaterials } from "@/game/three/chip-geometry";
import type { Card } from "@/lib/blackjack/cards";

/* Small static props for the Home room. Geometry and materials are built once per page
   and shared by every instance, so a dozen cards cost a dozen draws and no extra memory. */

let cardGeo: THREE.ShapeGeometry | null = null;
/** Rounded-corner card face lying in the XY plane, UVs spanning the whole card. */
function cardGeometry() {
  if (cardGeo) return cardGeo;
  const w = CARD.w;
  const h = CARD.h;
  const r = 0.045;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const g = new THREE.ShapeGeometry(s, 4);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  cardGeo = g;
  return g;
}

const cardMats = new Map<string, THREE.MeshStandardMaterial>();
function cardMaterial(card: Card | null) {
  const key = card ?? "back";
  let m = cardMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: card ? cardFace(card) : cardBack(), roughness: 0.45, side: THREE.DoubleSide });
    cardMats.set(key, m);
  }
  return m;
}

/** A card lying flat on the felt (face up, or face down when `card` is null). */
export function FlatCard({ card, x, z, rot = 0, y = 0.004 }: { card: Card | null; x: number; z: number; rot?: number; y?: number }) {
  return <mesh geometry={cardGeometry()} material={cardMaterial(card)} position={[x, y, z]} rotation={[-Math.PI / 2, 0, rot]} />;
}

/** A standing card (faces +z); used for the floating cards over the training table. */
export function StandingCard({ card }: { card: Card | null }) {
  return <mesh geometry={cardGeometry()} material={cardMaterial(card)} />;
}

/** A neat stack of chips, top value last. */
export function ChipStack({ values, x, z }: { values: number[]; x: number; z: number }) {
  const geo = chipGeometry();
  return (
    <group position={[x, 0, z]}>
      {values.map((v, i) => (
        <mesh
          key={i}
          geometry={geo}
          material={chipMaterials(v)}
          position={[Math.sin(i * 2.1) * 0.006, CHIP_H / 2 + i * (CHIP_H + 0.002), Math.cos(i * 1.7) * 0.006]}
          rotation-y={i * 0.7}
        />
      ))}
    </group>
  );
}
