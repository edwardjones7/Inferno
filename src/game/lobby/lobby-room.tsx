"use client";

import { Environment as EnvMap, Lightformer } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import { stepSpring, type Spring } from "@/game/three/camera-spring";
import { Embers } from "@/game/three/env-embers";
import { LightBeam, PendantLamp } from "@/game/three/env-lamp";
import { useMood } from "@/game/three/env-mood";
import { Shoe, TableBody } from "@/game/three/table-body";
import { DEALER_Z, HAND_Z, BET_Z } from "@/game/three/table-layout";
import { boardPos, buttonPos, holePos, POT_POS } from "@/game/poker-three/poker-layout";
import { DealerButton, PokerTableBody } from "@/game/poker-three/poker-table-body";
import { ChipStack, FlatCard } from "./props";
import { angleOf, MINI, onArc, ROOM_R, STATIONS } from "./stations";
import { TrainingStation } from "./training-station";

const BG = "#0a0705";

/**
 * Shared between the HTML gesture layer and the camera rig. The overlay writes it while
 * you drag (in station units) and the rig reads it every frame, so dragging never goes
 * through React.
 */
export interface LobbyNav {
  /** focused station index */
  target: number;
  /** live drag offset in stations (positive = dragged toward the next station) */
  drag: number;
  dragging: boolean;
}

/* ------------------------------------------------------------ camera */

const FOV = 36;
/** how high the camera looks down at the tables */
const PITCH = THREE.MathUtils.degToRad(24);

/** Camera distance that fits a ~5-unit-wide miniature table across the view. */
function distanceFor(aspect: number) {
  const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * aspect);
  const fit = (aspect < 1 ? 2.5 : 2.75) / Math.tan(hHalf);
  return THREE.MathUtils.clamp(fit, 8.6, 16);
}

/** per station: where the camera aims (height) and how far back it stands (training has a tall chart) */
const LOOK_Y = [0.15, 0.15, 0.62];
const BACK = [1, 1, 1.1];
const along = (v: number[], s: number) => {
  const i = Math.max(0, Math.min(v.length - 1.001, s));
  const k = Math.floor(i);
  return v[k] + (v[k + 1] - v[k]) * (i - k);
};

function CameraRig({ nav, reduced }: { nav: RefObject<LobbyNav>; reduced: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const spring = useRef<Spring>({ x: nav.current.target, v: 0 });
  const look = useMemo(() => new THREE.Vector3(), []);

  // Portrait: the station card covers the lower part of the view, so shift the picture
  // up (a view offset keeps perspective centred on the table instead of tilting).
  useEffect(() => {
    const portrait = size.width / size.height < 1;
    const shift = portrait ? 0.12 : 0.04;
    camera.setViewOffset(size.width, size.height, 0, size.height * shift, size.width, size.height);
    camera.updateProjectionMatrix();
    return () => camera.clearViewOffset();
  }, [camera, size]);

  useFrame((state, rawDt) => {
    // the spring step is exact for any dt; only guard against a long stall (tab switch)
    const dt = Math.min(rawDt, 0.25);
    const n = nav.current;
    const s = spring.current;
    const last = STATIONS.length - 1;
    if (n.dragging) {
      let x = n.target + n.drag;
      // rubber band past the ends
      if (x < 0) x = -0.35 * (1 - Math.exp(x / 0.35));
      if (x > last) x = last + 0.35 * (1 - Math.exp(-(x - last) / 0.35));
      s.v = dt > 0 ? (x - s.x) / dt : 0;
      s.x = x;
    } else if (reduced) {
      s.x = n.target;
      s.v = 0;
    } else {
      stepSpring(s, n.target, 7, dt);
    }

    const a = angleOf(s.x);
    const d = distanceFor(size.width / size.height) * along(BACK, s.x);
    const [cx, cz] = onArc(a, ROOM_R - Math.cos(PITCH) * d);
    camera.position.set(cx, Math.sin(PITCH) * d, cz);
    const [lx, lz] = onArc(a, ROOM_R - 0.2);
    look.set(lx, along(LOOK_Y, s.x), lz);
    camera.lookAt(look);

    if (n.dragging || s.x !== n.target) state.invalidate();
  });
  return null;
}

/* ------------------------------------------------------------ frame driver */

/**
 * The Canvas runs on demand. While the room should animate (visible, motion allowed)
 * this asks for frames at the quality's frame rate; otherwise it only draws when the
 * camera moves or something invalidates it.
 */
function Driver({ active, fps }: { active: boolean; fps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    if (!active) return;
    let raf = 0;
    let last = 0;
    const gap = 1000 / fps - 2;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last >= gap) {
        last = t;
        invalidate();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, fps, invalidate]);
  return null;
}

/* ------------------------------------------------------------ stations */

function StationLights() {
  const target = useMemo(() => new THREE.Object3D(), []);
  return (
    <>
      <primitive object={target} position={[0, 0, 0.2]} />
      <spotLight
        position={[0, 4.4, 0.5]}
        angle={0.75}
        penumbra={0.9}
        intensity={30}
        decay={1.6}
        distance={12}
        color="#ffe2c4"
        target={target}
      />
      <pointLight position={[0, 0.7, 2.2]} color="#ff5a1f" intensity={4} distance={4.5} />
    </>
  );
}

function BlackjackMini() {
  return (
    <>
      <TableBody />
      <Shoe />
      {/* the coach's favourite question: 16 against a ten */}
      <FlatCard card="TC" x={-0.36} z={DEALER_Z} rot={0.04} />
      <FlatCard card={null} x={0.36} z={DEALER_Z} rot={-0.03} />
      <FlatCard card="TH" x={-0.22} z={HAND_Z} rot={-0.08} />
      <FlatCard card="6S" x={0.22} z={HAND_Z + 0.06} rot={0.1} y={0.007} />
      <ChipStack values={[100, 100, 25, 25, 5]} x={0} z={BET_Z} />
      <ChipStack values={[500, 100, 100, 25]} x={-2.2} z={BET_Z - 0.2} />
      <ChipStack values={[25, 25, 25]} x={2.2} z={BET_Z - 0.2} />
    </>
  );
}

const BUTTON = buttonPos(0);
function PokerMini() {
  const hero = holePos(0);
  const pot = POT_POS;
  return (
    <>
      <PokerTableBody />
      <FlatCard card="AS" x={boardPos(0)[0]} z={boardPos(0)[2]} />
      <FlatCard card="KD" x={boardPos(1)[0]} z={boardPos(1)[2]} />
      <FlatCard card="7H" x={boardPos(2)[0]} z={boardPos(2)[2]} />
      <FlatCard card="AH" x={hero.x - 0.24} z={hero.z} rot={0.08} />
      <FlatCard card="QS" x={hero.x + 0.24} z={hero.z + 0.04} rot={-0.06} y={0.007} />
      {[1, 2, 3, 4, 5].map((seat) => {
        const p = holePos(seat);
        return (
          <group key={seat}>
            <FlatCard card={null} x={p.x - 0.12} z={p.z} rot={0.2} />
            <FlatCard card={null} x={p.x + 0.12} z={p.z} rot={-0.15} y={0.007} />
          </group>
        );
      })}
      <ChipStack values={[500, 100, 100, 100, 25, 25]} x={pot.x - 0.22} z={pot.z} />
      <ChipStack values={[100, 100, 25, 25]} x={pot.x + 0.22} z={pot.z + 0.05} />
      <DealerButton to={BUTTON} />
    </>
  );
}

function StationMini({ index, animate }: { index: number; animate: boolean }) {
  const id = STATIONS[index].id;
  if (id === "blackjack") return <BlackjackMini />;
  if (id === "poker") return <PokerMini />;
  return <TrainingStation animate={animate} />;
}

let glowTex: THREE.Texture | null = null;
/** Warm pool of light on the floor under each station, so the room reads as a room. */
function FloorGlow() {
  glowTex ??= (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(255,110,40,0.3)");
    r.addColorStop(0.45, "rgba(255,80,20,0.09)");
    r.addColorStop(1, "rgba(255,60,10,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-1.4 * MINI + 0.01} renderOrder={1}>
      <planeGeometry args={[9, 7]} />
      <meshBasicMaterial map={glowTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

/** Invisible hit box over a station, for tap-to-focus / tap-to-open. */
function HitArea({ onTap }: { onTap: (e: ThreeEvent<MouseEvent>) => void }) {
  const cursor = (e: ThreeEvent<PointerEvent>, c: string) => {
    const el = e.nativeEvent.target;
    if (el instanceof HTMLElement) el.style.cursor = c;
  };
  return (
    <mesh
      position={[0, 0.6, 0]}
      onClick={onTap}
      onPointerOver={(e) => cursor(e, "pointer")}
      onPointerOut={(e) => cursor(e, "")}
    >
      <boxGeometry args={[5, 2.2, 3.2]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  );
}

function Station({ index, children, onTap }: { index: number; children: ReactNode; onTap: (i: number) => void }) {
  const a = angleOf(index);
  const [x, z] = onArc(a, ROOM_R);
  return (
    <group position={[x, 0, z]} rotation-y={-a}>
      <group scale={MINI}>{children}</group>
      <StationLights />
      <FloorGlow />
      <HitArea
        onTap={(e) => {
          e.stopPropagation();
          onTap(index);
        }}
      />
    </group>
  );
}

/* ------------------------------------------------------------ room */

const ReflectionRig = memo(function ReflectionRig() {
  return (
    <EnvMap resolution={128} background={false} frames={1} environmentIntensity={0.5}>
      <color attach="background" args={["#050302"]} />
      <Lightformer form="circle" intensity={6} color="#ffd9a8" position={[0, 6, 0]} scale={2.2} />
      <Lightformer form="rect" intensity={3} color="#ff5a1f" position={[-7, 1.2, 0.5]} scale={[10, 1.6, 1]} />
      <Lightformer form="rect" intensity={3} color="#ff5a1f" position={[7, 1.2, 0.5]} scale={[10, 1.6, 1]} />
      <Lightformer form="rect" intensity={1.4} color="#ff9a2e" position={[0, 1.8, -8]} scale={[12, 2, 1]} />
      <Lightformer form="rect" intensity={0.35} color="#7a8aa8" position={[0, 3, 9]} scale={[12, 4, 1]} />
    </EnvMap>
  );
});

function FirstFrame({ onReady }: { onReady: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    onReady();
  });
  return null;
}

export interface LobbyRoomProps {
  nav: RefObject<LobbyNav>;
  /** idle animation (lava, embers, floating cards); off for reduced motion and when hidden */
  animate: boolean;
  reduced: boolean;
  quality: "high" | "low";
  onTap: (index: number) => void;
  onReady: () => void;
}

export function LobbyRoom({ nav, animate, reduced, quality, onTap, onReady }: LobbyRoomProps) {
  const mood = useMood();
  return (
    <>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 11, 26]} />
      <ReflectionRig />
      <ambientLight intensity={0.28} color="#ffd8b8" />
      <hemisphereLight args={["#ffb070", "#1a0d08", 0.25]} />
      {STATIONS.map((st, i) => (
        <Station key={st.id} index={i} onTap={onTap}>
          <StationMini index={i} animate={animate} />
          {st.id !== "training" && (
            <>
              <PendantLamp y={3.4} />
              <LightBeam y={3.4} mood={mood} />
            </>
          )}
          <Embers mood={mood} />
        </Station>
      ))}
      <CameraRig nav={nav} reduced={reduced} />
      <Driver active={animate} fps={quality === "low" ? 30 : 60} />
      <FirstFrame onReady={onReady} />
    </>
  );
}

export { FOV };
