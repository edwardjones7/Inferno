"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { canvas, display, prng, texture } from "@/app/blackjack/three/canvas-utils";
import { useSceneFx } from "@/app/blackjack/three/fx-context";
import { lavaSeamFragment, lavaSeamUniforms, lavaSeamVertex } from "@/app/blackjack/three/table-lava";
import { feltNormalTexture, leatherNormalTexture } from "@/app/blackjack/three/table-textures";
import { FELT } from "./poker-layout";

const BRASS = { color: "#d9a54c", metalness: 1, roughness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.12 } as const;
const LEATHER = "#22120b";
const PX = 220;

/** Printed oval felt: warm radial glow, fibres, a betting line and the wordmark under the board. */
function pokerFelt() {
  return texture("poker-felt", () => {
    const W = Math.round(FELT.rx * 2 * PX);
    const H = Math.round(FELT.rz * 2 * PX);
    const [c, g] = canvas(W, H);
    const cx = W / 2;
    const cy = H / 2;
    const bg = g.createRadialGradient(cx, cy, 30, cx, cy, W * 0.55);
    bg.addColorStop(0, "#4a1a0e");
    bg.addColorStop(0.5, "#2a100a");
    bg.addColorStop(1, "#120806");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const rand = prng(11);
    for (let i = 0; i < 22000; i++) {
      g.fillStyle = rand() > 0.5 ? "rgba(255,140,80,0.035)" : "rgba(0,0,0,0.08)";
      g.fillRect(rand() * W, rand() * H, 1.5, 1.5);
    }
    // betting line
    g.strokeStyle = "rgba(255,154,46,0.4)";
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(cx, cy, (FELT.rx - 1.05) * PX, (FELT.rz - 0.72) * PX, 0, 0, Math.PI * 2);
    g.stroke();
    // board box
    g.strokeStyle = "rgba(255,194,75,0.22)";
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(cx - 2.05 * PX, cy + (-0.25 - 0.55) * PX, 4.1 * PX, 1.1 * PX, 24);
    g.stroke();
    // wordmark
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "rgba(255,170,70,0.16)";
    g.font = `900 ${Math.round(0.34 * PX)}px ${display()}`;
    g.fillText("I N F E R N O", cx, cy + 0.6 * PX);
    g.font = `700 ${Math.round(0.13 * PX)}px ${display()}`;
    g.fillStyle = "rgba(255,170,70,0.12)";
    g.fillText("NO-LIMIT HOLD'EM", cx, cy + 0.95 * PX);
    return c;
  });
}

export function PokerTableBody() {
  const fx = useSceneFx();
  const { shape, felt, weave, leather } = useMemo(() => {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, FELT.rx, FELT.rz, 0, Math.PI * 2, false);
    const felt = pokerFelt();
    felt.repeat.set(1 / (FELT.rx * 2), 1 / (FELT.rz * 2));
    felt.offset.set(0.5, 0.5);
    return { shape, felt, weave: feltNormalTexture(), leather: leatherNormalTexture() };
  }, []);
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
    return { rail: ring(FELT.rx + 0.08, FELT.rz + 0.08, 0.06), brass: ring(FELT.rx - 0.125, FELT.rz - 0.125, 0.012), glow: ring(FELT.rx - 0.2, FELT.rz - 0.2, 0.004) };
  }, []);
  const seamUniforms = useMemo(() => lavaSeamUniforms(curves.glow.getLength()), [curves]);
  const seamMat = useRef<THREE.ShaderMaterial>(null);
  const heat = useRef(0);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    heat.current += (fx.heat - heat.current) * (1 - Math.exp(-1.2 * dt));
    const seam = seamMat.current;
    if (!seam) return;
    const speed = 0.12 * Math.pow(2, 1.5 * heat.current) * (fx.reducedMotion ? 0.3 : 1);
    seam.uniforms.uFlow.value += speed * dt;
    seam.uniforms.uTime.value = state.clock.elapsedTime;
    seam.uniforms.uHeat.value = heat.current;
    seam.uniforms.uPulse.value = fx.reducedMotion ? 0 : 1;
  });

  return (
    <group>
      <mesh geometry={geometry} rotation-x={-Math.PI / 2} position-y={-0.34} receiveShadow>
        <meshPhysicalMaterial attach="material-0" map={felt} normalMap={weave} normalScale={[0.35, 0.35]} roughness={0.92} sheen={0.6} sheenColor="#7a3f22" sheenRoughness={0.55} />
        <meshStandardMaterial attach="material-1" color="#160c08" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh castShadow receiveShadow>
        <tubeGeometry args={[curves.rail, 320, 0.2, 20, true]} />
        <meshPhysicalMaterial color={LEATHER} roughness={0.48} normalMap={leather} normalScale={[0.8, 0.8]} clearcoat={0.65} clearcoatRoughness={0.28} sheen={0.3} sheenColor="#7a3f22" sheenRoughness={0.4} />
      </mesh>
      <mesh receiveShadow>
        <tubeGeometry args={[curves.brass, 320, 0.024, 10, true]} />
        <meshPhysicalMaterial {...BRASS} />
      </mesh>
      <mesh>
        <tubeGeometry args={[curves.glow, 320, 0.018, 8, true]} />
        <shaderMaterial ref={seamMat} uniforms={seamUniforms} vertexShader={lavaSeamVertex} fragmentShader={lavaSeamFragment} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-1.4} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#0b0705" roughness={1} />
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
