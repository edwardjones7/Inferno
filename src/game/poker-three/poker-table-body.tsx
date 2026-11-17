"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { canvas, display, texture } from "@/game/three/canvas-utils";
import { FELT_LOOKS } from "@/game/designs/felt-looks";
import { paintBaize } from "@/game/three/felt-texture";
import { useSceneFx } from "@/game/three/fx-context";
import { railGlowFragment, railGlowUniforms, railGlowVertex, stepRailGlow } from "@/game/three/rail-glow";
import { tableMaterials, useRailMood } from "@/game/three/table-body";
import { feltNormalTexture, leatherNormalTexture } from "@/game/three/table-textures";
import { useSceneLook } from "@/game/three/use-scene-look";
import type { FeltId } from "@/lib/cosmetics";
import { FELT } from "./poker-layout";

const PX = 220;

/** Printed oval baize: a betting line, the board box and the wordmark under the board. */
function pokerFelt(design: FeltId) {
  const ink = FELT_LOOKS[design].print;
  return texture(`poker-felt:${design}`, () => {
    const W = Math.round(FELT.rx * 2 * PX);
    const H = Math.round(FELT.rz * 2 * PX);
    const [c, g] = canvas(W, H);
    const cx = W / 2;
    const cy = H / 2;
    paintBaize(g, W, H, cx, cy, 11, 1, FELT_LOOKS[design]);
    // betting line
    g.strokeStyle = ink.line;
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(cx, cy, (FELT.rx - 1.05) * PX, (FELT.rz - 0.72) * PX, 0, 0, Math.PI * 2);
    g.stroke();
    // board box
    g.strokeStyle = ink.faint;
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(cx - 2.05 * PX, cy + (-0.25 - 0.55) * PX, 4.1 * PX, 1.1 * PX, 24);
    g.stroke();
    // wordmark
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = `${ink.mark}0.22)`;
    g.font = `900 ${Math.round(0.34 * PX)}px ${display()}`;
    g.fillText("I N F E R N O", cx, cy + 0.6 * PX);
    g.font = `700 ${Math.round(0.13 * PX)}px ${display()}`;
    g.fillStyle = `${ink.mark}0.16)`;
    g.fillText("NO-LIMIT HOLD'EM", cx, cy + 0.95 * PX);
    return c;
  });
}

/** Oval baize table in the player's table design: padded leather rail, metal trim and a low warm glow at the rail. */
export function PokerTableBody() {
  const fx = useSceneFx();
  const { felt: design } = useSceneLook();
  const mats = useMemo(() => tableMaterials(design), [design]);
  const { shape, felt, weave, leather } = useMemo(() => {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, FELT.rx, FELT.rz, 0, Math.PI * 2, false);
    const felt = pokerFelt(design);
    felt.repeat.set(1 / (FELT.rx * 2), 1 / (FELT.rz * 2));
    felt.offset.set(0.5, 0.5);
    return { shape, felt, weave: feltNormalTexture(), leather: leatherNormalTexture() };
  }, [design]);
  const geometry = useMemo(
    () => new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 128 }),
    [shape],
  );
  const curves = useMemo(() => {
    const ring = (rx: number, rz: number, y: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 160; i++) {
        const a = (i / 160) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * rx, y, Math.sin(a) * rz));
      }
      return new THREE.CatmullRomCurve3(pts, true);
    };
    return { rail: ring(FELT.rx + 0.08, FELT.rz + 0.08, 0.06), brass: ring(FELT.rx - 0.125, FELT.rz - 0.125, 0.012), glow: ring(FELT.rx - 0.19, FELT.rz - 0.19, 0.003) };
  }, []);
  const glowUniforms = useMemo(() => railGlowUniforms(curves.glow.getLength()), [curves]);
  const railMood = useRailMood(fx);
  const glowMat = useRef<THREE.ShaderMaterial>(null);

  useFrame((_, rawDt) => {
    const m = railMood(Math.min(rawDt, 0.1));
    stepRailGlow(glowMat.current, m.heat, m.flare, m.t, fx.reducedMotion);
  });

  return (
    <group>
      <mesh geometry={geometry} rotation-x={-Math.PI / 2} position-y={-0.34} receiveShadow>
        <meshPhysicalMaterial attach="material-0" map={felt} normalMap={weave} normalScale={[0.35, 0.35]} {...mats.baize} />
        <meshStandardMaterial attach="material-1" color="#140a06" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh castShadow receiveShadow>
        <tubeGeometry args={[curves.rail, 320, 0.2, 20, true]} />
        <meshPhysicalMaterial {...mats.leather} normalMap={leather} normalScale={[0.8, 0.8]} />
      </mesh>
      <mesh receiveShadow>
        <tubeGeometry args={[curves.brass, 320, 0.024, 10, true]} />
        <meshPhysicalMaterial {...mats.trim} />
      </mesh>
      <mesh>
        <tubeGeometry args={[curves.glow, 320, 0.012, 8, true]} />
        <shaderMaterial ref={glowMat} uniforms={glowUniforms} vertexShader={railGlowVertex} fragmentShader={railGlowFragment} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** White dealer button puck with a "D". */
export function DealerButton({ to }: { to: THREE.Vector3 }) {
  const group = useRef<THREE.Group>(null);
  const tex = useMemo(
    () =>
      texture("dealer-button", () => {
        const [c, g] = canvas(128, 128);
        g.fillStyle = "#f6ede3";
        g.beginPath();
        g.arc(64, 64, 62, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#b3200c";
        g.lineWidth = 6;
        g.stroke();
        g.fillStyle = "#17110d";
        g.font = `900 64px ${display()}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("D", 64, 68);
        return c;
      }),
    [],
  );
  useFrame((_, dt) => {
    group.current?.position.lerp(to, 1 - Math.exp(-dt * 6));
  });
  return (
    <group ref={group} position={to}>
      <mesh position-y={0.02} castShadow>
        <cylinderGeometry args={[0.15, 0.15, 0.04, 32]} />
        <meshStandardMaterial attach="material-0" color="#e8dccf" roughness={0.4} />
        <meshStandardMaterial attach="material-1" map={tex} roughness={0.35} />
        <meshStandardMaterial attach="material-2" color="#e8dccf" roughness={0.4} />
      </mesh>
    </group>
  );
}
