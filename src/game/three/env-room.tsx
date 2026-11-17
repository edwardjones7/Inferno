"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { prng } from "./canvas-utils";
import type { MoodRef } from "./env-mood";
import { blindsShaftTexture, blindsTexture, floorMap, glowTexture, wallTexture, WALL_H } from "./room-textures";

/** Floor level of the room (the felt is at y = 0). */
export const FLOOR_Y = -1.4;

export interface RoomLayout {
  /** z of the back wall (behind the dealer / far seats) */
  back: number;
  /** half-width of the room (x of the side walls) */
  side: number;
}

const WOOD = "#1c0f08";
const BRASS = { color: "#b8873a", metalness: 1, roughness: 0.3 } as const;
const BOTTLE_COLORS = ["#5a2a0c", "#7a3a10", "#2d3a1c", "#3a1a0c", "#8a5a1c", "#1e2a20", "#6a1c10"];
const SCONCE_LIGHT = "#ffa060";

/**
 * The speakeasy back room around the table: plank floor, brick over dark panelling, a
 * bar shelf of bottles under a sconce and a window with the blinds drawn. Everything is
 * low-poly with small canvas textures, and falls off into the scene fog.
 */
export function BackRoom({ layout, mood, quality }: { layout: RoomLayout; mood: MoodRef; quality: "high" | "low" }) {
  const { back, side } = layout;
  const depth = 6 - back;

  const maps = useMemo(() => {
    const wall = wallTexture();
    const backMap = wall.clone();
    backMap.wrapS = THREE.RepeatWrapping;
    backMap.needsUpdate = true;
    backMap.repeat.set((side * 2) / 4, 1);
    const sideMap = wall.clone();
    sideMap.wrapS = THREE.RepeatWrapping;
    sideMap.needsUpdate = true;
    sideMap.repeat.set(depth / 4, 1);
    return { backMap, sideMap };
  }, [side, depth]);

  const wallY = FLOOR_Y + WALL_H / 2;
  const windowX = -side * 0.5;
  const barX = side * 0.48;

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={FLOOR_Y} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial map={floorMap()} color="#b8a090" roughness={0.72} metalness={0} />
      </mesh>
      {/* back wall and the two side walls */}
      <mesh position={[0, wallY, back]}>
        <planeGeometry args={[side * 2, WALL_H]} />
        <meshStandardMaterial map={maps.backMap} roughness={0.92} />
      </mesh>
      <mesh position={[-side, wallY, back + depth / 2]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[depth, WALL_H]} />
        <meshStandardMaterial map={maps.sideMap} roughness={0.92} />
      </mesh>
      <mesh position={[side, wallY, back + depth / 2]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[depth, WALL_H]} />
        <meshStandardMaterial map={maps.sideMap} roughness={0.92} />
      </mesh>

      <BlindWindow x={windowX} z={back} shaft={quality === "high"} />
      <BarShelf x={barX} z={back} />
      <Sconce x={barX} y={2.15} z={back} mood={mood} />
      <Sconce x={windowX + 2.1} y={1.9} z={back} mood={mood} dim />
    </group>
  );
}

/** A window with the blinds drawn, cool night light leaking between the slats. */
function BlindWindow({ x, z, shaft }: { x: number; z: number; shaft: boolean }) {
  const w = 1.5;
  const h = 2.1;
  const y = 1.75;
  const bar = 0.08;
  return (
    <group position={[x, y, z + 0.02]}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={blindsTexture()} color="#8a96a8" />
      </mesh>
      {/* frame */}
      {[
        [0, h / 2 + bar / 2, w + bar * 2, bar],
        [0, -h / 2 - bar / 2, w + bar * 2, bar * 1.6],
        [-w / 2 - bar / 2, 0, bar, h],
        [w / 2 + bar / 2, 0, bar, h],
        [0, 0, 0.04, h],
      ].map(([px, py, sw, sh], i) => (
        <mesh key={i} position={[px, py, 0.04]}>
          <boxGeometry args={[sw, sh, 0.08]} />
          <meshStandardMaterial color={WOOD} roughness={0.6} />
        </mesh>
      ))}
      {/* the light falling into the room through the slats */}
      {shaft && (
        <mesh position={[0.35, -1.2, 1.3]} rotation={[-0.95, 0.15, 0]} renderOrder={1}>
          <planeGeometry args={[1.6, 3.4]} />
          <meshBasicMaterial map={blindsShaftTexture()} transparent opacity={0.05} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
        </mesh>
      )}
    </group>
  );
}

function bottleGeometry() {
  const pts = [
    [0, 0],
    [0.07, 0],
    [0.075, 0.02],
    [0.075, 0.26],
    [0.06, 0.32],
    [0.024, 0.37],
    [0.022, 0.46],
    [0.027, 0.47],
    [0, 0.47],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 10);
}

/** Two shelves of liquor bottles on the back wall (one instanced draw for the bottles). */
function BarShelf({ x, z }: { x: number; z: number }) {
  const bottles = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => bottleGeometry(), []);
  const SHELVES = [0.7, 1.5];
  const PER = 9;
  const W = 2.6;

  useLayoutEffect(() => {
    const m = bottles.current;
    if (!m) return;
    const rand = prng(0xba5);
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    let i = 0;
    for (const sy of SHELVES) {
      for (let k = 0; k < PER; k++) {
        const s = 0.8 + rand() * 0.45;
        o.position.set(-W / 2 + 0.15 + (k + rand() * 0.4) * ((W - 0.3) / PER), sy + 0.03, 0.17 + (rand() - 0.5) * 0.06);
        o.scale.set(s * (0.85 + rand() * 0.3), s, s * (0.85 + rand() * 0.3));
        o.rotation.y = rand() * Math.PI;
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
        m.setColorAt(i, c.set(BOTTLE_COLORS[Math.floor(rand() * BOTTLE_COLORS.length)]));
        i++;
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <group position={[x, 0, z]}>
      {/* back board */}
      <mesh position={[0, 1.3, 0.02]}>
        <boxGeometry args={[W + 0.2, 1.8, 0.04]} />
        <meshStandardMaterial color="#120905" roughness={0.7} />
      </mesh>
      {SHELVES.map((sy) => (
        <group key={sy}>
          <mesh position={[0, sy, 0.17]}>
            <boxGeometry args={[W + 0.2, 0.05, 0.34]} />
            <meshStandardMaterial color={WOOD} roughness={0.55} />
          </mesh>
          <mesh position={[0, sy + 0.005, 0.345]}>
            <boxGeometry args={[W + 0.2, 0.025, 0.012]} />
            <meshStandardMaterial {...BRASS} />
          </mesh>
        </group>
      ))}
      <instancedMesh ref={bottles} args={[geometry, undefined, SHELVES.length * PER]}>
        <meshStandardMaterial roughness={0.12} metalness={0.2} transparent opacity={0.92} />
      </instancedMesh>
    </group>
  );
}

/**
 * Brass wall lamp with a fabric shade: a warm pool on the wall and, with `mood`, a little
 * real light that follows the table's heat. Faces +z; place it on a wall facing the room.
 */
export function Sconce({ x, y, z, mood, dim = false, rotation = 0 }: { x: number; y: number; z: number; mood?: MoodRef; dim?: boolean; rotation?: number }) {
  const light = useRef<THREE.PointLight>(null);
  const base = dim ? 4 : 6;
  useFrame(() => {
    if (!mood) return;
    const m = mood.current;
    if (light.current) light.current.intensity = base * (1 + 0.15 * m.hot - 0.3 * m.cold) * (1 - 0.25 * m.lose);
  });
  return (
    <group position={[x, y, z]} rotation-y={rotation}>
      <mesh position={[0, 0, 0.03]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.07, 0.07, 0.04, 16]} />
        <meshStandardMaterial {...BRASS} />
      </mesh>
      <mesh position={[0, 0.02, 0.14]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.015, 0.015, 0.22, 6]} />
        <meshStandardMaterial {...BRASS} />
      </mesh>
      {/* shade, glowing through the fabric */}
      <mesh position={[0, 0.1, 0.24]}>
        <cylinderGeometry args={[0.09, 0.15, 0.18, 16, 1, true]} />
        <meshBasicMaterial color={new THREE.Color(1.15, 0.58, 0.24)} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {/* halo of light on the wall */}
      <mesh position={[0, 0.15, 0.015]} renderOrder={1}>
        <planeGeometry args={[2.2, 2.6]} />
        <meshBasicMaterial map={glowTexture()} color={dim ? "#5a2c12" : "#7a3e18"} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {mood && <pointLight ref={light} position={[0, 0.1, 0.5]} color={SCONCE_LIGHT} intensity={base} distance={6.5} decay={1.6} />}
    </group>
  );
}
