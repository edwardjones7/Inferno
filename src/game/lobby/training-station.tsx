"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { canvas, display, prng, sans, texture } from "@/game/three/canvas-utils";
import { leatherNormalTexture } from "@/game/three/table-textures";
import { lavaSeamFragment, lavaSeamUniforms, lavaSeamVertex } from "@/game/three/table-lava";
import { ChipStack, StandingCard } from "./props";

/* The training corner: a round drill table with the spot of the moment floating over it
   (16 against a dealer ten) and, behind it, a lit basic-strategy chart on an easel with
   that same cell ringed. One look tells you what this corner is for. */

const BRASS = { color: "#d9a54c", metalness: 1, roughness: 0.2 } as const;

/** Hard totals, 8..17 down, dealer 2..A across. H hit, S stand, D double. */
const HARD: Record<number, string> = {
  8: "HHHHHHHHHH",
  9: "HDDDDHHHHH",
  10: "DDDDDDDDHH",
  11: "DDDDDDDDDD",
  12: "HHSSSHHHHH",
  13: "SSSSSHHHHH",
  14: "SSSSSHHHHH",
  15: "SSSSSHHHHH",
  16: "SSSSSHHHHH",
  17: "SSSSSSSSSS",
};
const UPS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "A"];
const CELL: Record<string, [string, string]> = {
  H: ["#b3200c", "#ffd9c8"],
  S: ["#2b2019", "#ddd0c3"],
  D: ["#ffc24b", "#3d0805"],
};
/** the cell the floating cards are asking about */
const SPOT = { total: 16, up: 8 };

function chartTexture() {
  return texture("lobby:chart", () => {
    const W = 1024;
    const H = 704;
    const [c, g] = canvas(W, H);
    g.fillStyle = "#120a07";
    g.fillRect(0, 0, W, H);
    const rand = prng(5);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = rand() > 0.5 ? "rgba(255,150,90,0.03)" : "rgba(0,0,0,0.12)";
      g.fillRect(rand() * W, rand() * H, 2, 2);
    }
    g.fillStyle = "#ffc24b";
    g.font = `900 40px ${display()}`;
    g.textBaseline = "middle";
    g.fillText("BASIC STRATEGY", 48, 52);
    g.fillStyle = "rgba(221,208,195,0.7)";
    g.font = `700 22px ${sans()}`;
    g.textAlign = "right";
    g.fillText("HARD TOTALS  ·  DEALER SHOWS →", W - 48, 54);

    const x0 = 132;
    const y0 = 116;
    const cw = (W - x0 - 40) / 10;
    const ch = (H - y0 - 30) / 11;
    g.textAlign = "center";
    g.font = `800 28px ${display()}`;
    UPS.forEach((u, i) => {
      g.fillStyle = "#ff9a2e";
      g.fillText(u === "T" ? "10" : u, x0 + cw * (i + 0.5), y0 + ch * 0.5);
    });
    for (let r = 8; r <= 17; r++) {
      const y = y0 + ch * (r - 7);
      g.fillStyle = "#ff9a2e";
      g.font = `800 28px ${display()}`;
      g.fillText(r === 17 ? "17+" : String(r), x0 / 2 + 20, y + ch / 2);
      HARD[r].split("").forEach((m, i) => {
        const [bg, fg] = CELL[m];
        g.fillStyle = bg;
        g.beginPath();
        g.roundRect(x0 + cw * i + 4, y + 4, cw - 8, ch - 8, 8);
        g.fill();
        g.fillStyle = fg;
        g.font = `800 26px ${sans()}`;
        g.fillText(m, x0 + cw * (i + 0.5), y + ch / 2 + 1);
      });
    }
    // ring the spot being drilled
    const sx = x0 + cw * SPOT.up;
    const sy = y0 + ch * (SPOT.total - 7);
    g.strokeStyle = "#fff3df";
    g.lineWidth = 6;
    g.shadowColor = "#ff5a1f";
    g.shadowBlur = 24;
    g.beginPath();
    g.roundRect(sx - 2, sy - 2, cw + 4, ch + 4, 10);
    g.stroke();
    return c;
  });
}

/** Easel with the chart, framed in brass, its own small light on top. */
function ChartBoard() {
  const map = chartTexture();
  const w = 3.9;
  const h = w * (704 / 1024);
  const mid = 1.3 + h / 2;
  return (
    <group position={[0, 0, -2]} rotation-x={-0.1}>
      {/* legs */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 2 - 0.2), (mid - 1.4) / 2, 0.1]}>
          <cylinderGeometry args={[0.04, 0.04, mid + 1.4, 8]} />
          <meshStandardMaterial color="#21160f" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <group position-y={mid}>
        <mesh position-z={-0.03}>
          <boxGeometry args={[w + 0.16, h + 0.16, 0.05]} />
          <meshStandardMaterial {...BRASS} />
        </mesh>
        <mesh>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial map={map} roughness={0.7} emissive="#ffffff" emissiveMap={map} emissiveIntensity={0.35} />
        </mesh>
        {/* picture light */}
        <mesh position={[0, h / 2 + 0.16, 0.18]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.05, 0.05, w * 0.7, 12]} />
          <meshStandardMaterial {...BRASS} />
        </mesh>
        <mesh position={[0, h / 2 + 0.12, 0.2]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.018, 0.018, w * 0.66, 8]} />
          <meshBasicMaterial color={new THREE.Color(5, 3, 1.4)} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** The three cards of the spot, floating and turning gently over the drill table. */
function FloatingSpot({ animate }: { animate: boolean }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const cards = useMemo(
    () =>
      [
        // dealer's ten on the left, your 16 on the right
        { card: "TD", x: -0.8, y: 0.95, z: 0.1, tilt: 0.08 },
        { card: "TS", x: 0.32, y: 0.85, z: 0.35, tilt: 0.12 },
        { card: "6H", x: 1.02, y: 0.9, z: 0.35, tilt: -0.1 },
      ] as const,
    [],
  );
  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    refs.current.forEach((g, i) => {
      if (!g) return;
      const c = cards[i];
      g.position.y = c.y + Math.sin(t * 0.9 + i * 1.7) * 0.06;
      g.rotation.y = Math.sin(t * 0.45 + i * 2.1) * 0.35;
    });
  });
  return (
    <>
      {cards.map((c, i) => (
        <group
          key={c.card}
          ref={(g) => {
            refs.current[i] = g;
          }}
          position={[c.x, c.y, c.z]}
          rotation-z={c.tilt}
          scale={1.2}
        >
          <StandingCard card={c.card} />
        </group>
      ))}
    </>
  );
}

export function TrainingStation({ animate }: { animate: boolean }) {
  const leather = leatherNormalTexture();
  const ring = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 1.42, 0.005, Math.sin(a) * 1.42));
    }
    return new THREE.CatmullRomCurve3(pts, true);
  }, []);
  const uniforms = useMemo(() => lavaSeamUniforms(ring.getLength()), [ring]);
  const seam = useRef<THREE.ShaderMaterial>(null);
  useFrame((state, dt) => {
    const u = seam.current?.uniforms;
    if (!u) return;
    u.uFlow.value += 0.12 * Math.min(dt, 0.1) * (animate ? 1 : 0);
    u.uTime.value = animate ? state.clock.elapsedTime : 0;
    u.uPulse.value = animate ? 1 : 0;
  });

  return (
    <group>
      {/* drill table: leather top, brass edge, lava ring, dark pedestal */}
      <mesh position-y={-0.08}>
        <cylinderGeometry args={[1.62, 1.62, 0.16, 64]} />
        <meshPhysicalMaterial color="#2a120a" roughness={0.5} normalMap={leather} normalScale={[0.6, 0.6]} clearcoat={0.5} clearcoatRoughness={0.3} />
      </mesh>
      <mesh position-y={-0.005} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.5, 64]} />
        <meshStandardMaterial color="#3a150b" roughness={0.95} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position-y={0.002}>
        <torusGeometry args={[1.6, 0.035, 10, 96]} />
        <meshStandardMaterial {...BRASS} />
      </mesh>
      <mesh>
        <tubeGeometry args={[ring, 160, 0.02, 8, true]} />
        <shaderMaterial ref={seam} uniforms={uniforms} vertexShader={lavaSeamVertex} fragmentShader={lavaSeamFragment} toneMapped={false} />
      </mesh>
      <mesh position-y={-0.8}>
        <cylinderGeometry args={[0.22, 0.5, 1.3, 24]} />
        <meshStandardMaterial color="#17100c" metalness={0.7} roughness={0.35} />
      </mesh>
      <ChipStack values={[25, 25, 100, 100, 100]} x={0.75} z={0.75} />
      <ChipStack values={[5, 5, 5, 25]} x={-0.85} z={0.6} />
      <FloatingSpot animate={animate} />
      <ChartBoard />
    </group>
  );
}
