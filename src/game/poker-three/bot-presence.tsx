"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useSceneFx } from "@/game/three/fx-context";
import type { BotProfile } from "@/lib/poker/roster";
import { avatarSvg } from "@/lib/poker/sigils";
import { seatAngle } from "./poker-layout";

/**
 * A bot sitting at the table: its coin portrait standing upright behind its seat, turned
 * toward the camera. It shows what the bot is doing without reading any text:
 * idle bob, a warm pulse while thinking, sinking and dimming after a fold, a lean forward on
 * a bet or raise, and a hop on a win.
 */

export type BotMood = "idle" | "thinking" | "folded" | "aggressive" | "won";

const textures = new Map<string, THREE.Texture>();

function useAvatarTexture(bot: BotProfile) {
  const [tex, setTex] = useState<THREE.Texture | null>(() => textures.get(bot.id) ?? null);
  useEffect(() => {
    if (textures.has(bot.id)) return;
    let live = true;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const t = new THREE.Texture(img);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      t.needsUpdate = true;
      textures.set(bot.id, t);
      if (live) setTex(t);
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(bot, 512))}`;
    return () => {
      live = false;
    };
  }, [bot]);
  return tex;
}

const R = 0.42; // medallion radius
const RING = 5.05; // distance from the table centre (outside the rail)

export function BotPresence({ bot, place, mood, actKey }: { bot: BotProfile; place: number; mood: BotMood; actKey: number }) {
  const fx = useSceneFx();
  const tex = useAvatarTexture(bot);
  const group = useRef<THREE.Group>(null);
  const disc = useRef<THREE.Group>(null);
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  const face = useRef<THREE.MeshStandardMaterial>(null);
  const rimMat = useRef<THREE.MeshBasicMaterial>(null);
  const kick = useRef({ key: actKey, t: 10 });
  const state = useRef({ sink: 0, dim: 0, hop: 0, lean: 0 });
  const rim = useMemo(() => new THREE.Color(bot.colors[1]).multiplyScalar(2.2), [bot.colors]);

  const base = useMemo(() => {
    const a = (seatAngle(place) * Math.PI) / 180;
    // lifted a little so the coin sits above the seat's name tag rather than behind it
    return new THREE.Vector3(Math.cos(a) * RING, 0.8, Math.sin(a) * (RING * 0.66));
  }, [place]);
  const phase = useMemo(() => place * 1.7, [place]);

  useFrame((s, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const g = group.current;
    const d = disc.current;
    if (!g || !d) return;
    const t = s.clock.elapsedTime;
    const still = fx.reducedMotion;
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    const st = state.current;
    st.sink += ((mood === "folded" ? 1 : 0) - st.sink) * k(4);
    st.dim += ((mood === "folded" ? 1 : 0) - st.dim) * k(4);
    st.hop += ((mood === "won" ? 1 : 0) - st.hop) * k(5);
    if (kick.current.key !== actKey) {
      kick.current = { key: actKey, t: 0 };
    }
    kick.current.t += dt;
    const punch = mood === "aggressive" && !still ? Math.exp(-kick.current.t * 3.2) * Math.sin(Math.min(kick.current.t * 9, Math.PI)) : 0;
    st.lean += (punch - st.lean) * k(14);

    const bob = still ? 0 : Math.sin(t * 1.3 + phase) * 0.04;
    const hop = still ? 0 : st.hop * Math.abs(Math.sin(t * 6)) * 0.18;
    g.position.set(base.x, base.y + bob + hop - st.sink * 0.45, base.z);
    // turn the coin to face the camera (a high phone camera would otherwise see it edge-on)
    g.lookAt(s.camera.position);
    // lean toward the table centre on a bet / raise
    d.rotation.x = st.lean * 0.45 - st.sink * 0.35;
    d.position.z = st.lean * 0.25;
    if (mood === "won" && !still) d.rotation.y += dt * 4;
    else d.rotation.y += (0 - d.rotation.y) * k(6);

    if (glow.current) {
      const thinking = mood === "thinking" ? 0.55 + Math.sin(t * 5) * 0.35 : 0;
      const target = mood === "won" ? 1 : thinking + st.lean * 0.6;
      glow.current.opacity += (target * (1 - st.dim) - glow.current.opacity) * k(8);
    }
    const lit = 1 - st.dim * 0.7;
    if (face.current && tex) {
      face.current.color.setRGB(lit, lit, lit);
      face.current.emissiveIntensity = 0.35 * lit;
    }
    rimMat.current?.color.copy(rim).multiplyScalar(lit);
  });

  return (
    <group ref={group}>
      <group ref={disc}>
        {/* coin body */}
        <mesh rotation-x={Math.PI / 2} castShadow>
          <cylinderGeometry args={[R, R, 0.06, 48]} />
          <meshStandardMaterial color="#1a0f0a" metalness={0.8} roughness={0.35} />
        </mesh>
        {/* portrait */}
        <mesh position-z={0.032}>
          <circleGeometry args={[R * 0.97, 48]} />
          <meshStandardMaterial
            key={tex ? "ready" : "loading"}
            ref={face}
            map={tex}
            color={tex ? "#ffffff" : "#3a2116"}
            roughness={0.45}
            metalness={0.15}
            emissive={tex ? "#ffffff" : "#000000"}
            emissiveMap={tex}
            emissiveIntensity={0.35}
          />
        </mesh>
        {/* rim light */}
        <mesh position-z={0.03}>
          <ringGeometry args={[R * 0.97, R * 1.05, 64]} />
          <meshBasicMaterial ref={rimMat} color={rim} toneMapped={false} />
        </mesh>
        {/* halo while thinking / acting / winning */}
        <mesh position-z={-0.02}>
          <ringGeometry args={[R * 1.05, R * 1.6, 64]} />
          <meshBasicMaterial ref={glow} color={rim} transparent opacity={0} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
    </group>
  );
}
