"use client";

import { Sparkles } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { chipsFor } from "@/components/chip";
import { cardLabel, type Card } from "@/lib/blackjack/cards";
import type { RoundView } from "@/lib/blackjack/engine";
import { formatUsd } from "@/lib/currency";
import { ResultTag, TotalBadge } from "../parts";
import { playerKey, type Timing } from "../timing";
import { CARD, CHIP_STYLE, cardBack, cardFace, chipSide, chipTop, feltTexture, TABLE } from "./textures";

export interface Table3DProps {
  view: RoundView | null;
  roundId: string | null;
  timing: Timing;
  /** bumps every time a new server response is applied; card delays are relative to it */
  epoch: number;
  revealed: boolean;
  pendingBetUsd: number;
  toUsd: (units: number) => number;
  burstKey: number;
}

/* ------------------------------------------------------------------ layout */

const DEALER_Z = -1.4;
const HAND_Z = 1.15;
const BET_Z = 2.02;
const SHOE_MOUTH = new THREE.Vector3(2.9, 0.38, -1.45);
const TRAY = new THREE.Vector3(0, 0.15, -2.25);
const PLAYER_SIDE = new THREE.Vector3(0, 0.9, 3.4);
const FLIGHT = 0.5;

const handSpread = (n: number) => (n > 2 ? 1.85 : 2.2);
const handX = (h: number, n: number) => (h - (n - 1) / 2) * handSpread(n);

interface CardSlot {
  key: string;
  delayKey: string;
  card: Card | null;
  pos: [number, number, number];
  hole: boolean;
}

function layoutCards(view: RoundView, roundId: string): CardSlot[] {
  const slots: CardSlot[] = [];
  const n = view.dealer.length;
  view.dealer.forEach((c, i) => {
    slots.push({
      key: `${roundId}:d${i}`,
      delayKey: `d${i}`,
      card: c,
      pos: [(i - (n - 1) / 2) * 0.5, 0.004 + i * 0.004, DEALER_Z],
      hole: i === 1,
    });
  });
  // Player cards keep their identity through a split (keyed by card + occurrence),
  // so the split card glides to its new hand instead of being dealt again.
  const seen = new Map<string, number>();
  view.hands.forEach((h, hi) => {
    const ax = handX(hi, view.hands.length);
    h.cards.forEach((c, i) => {
      const k = seen.get(c) ?? 0;
      seen.set(c, k + 1);
      slots.push({
        key: `${roundId}:${c}#${k}`,
        delayKey: playerKey(hi, i, c),
        card: c,
        pos: [ax + (i - (h.cards.length - 1) / 2) * 0.26, 0.004 + i * 0.004, HAND_Z - i * 0.1],
        hole: false,
      });
    });
  });
  return slots;
}

/* ------------------------------------------------------------------ cards */

const cardGeometry = (() => {
  let geo: THREE.ShapeGeometry | null = null;
  return () => {
    if (geo) return geo;
    const { w, h } = CARD;
    const r = 0.05;
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
    geo = new THREE.ShapeGeometry(s, 6);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
    return geo;
  };
})();

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function Card3D({ slot, delay, flipDelay, epoch, dim }: { slot: CardSlot; delay: number; flipDelay: number; epoch: number; dim: boolean }) {
  const group = useRef<THREE.Group>(null);
  const flipper = useRef<THREE.Group>(null);
  const geo = cardGeometry();
  const front = useRef<THREE.MeshStandardMaterial>(null);
  const shade = useMemo(() => new THREE.Color(), []);
  const st = useRef({ born: -1, epochAt: -1, pendingEpoch: true, angle: Math.PI, target: new THREE.Vector3() });

  useEffect(() => {
    st.current.pendingEpoch = true;
  }, [epoch]);

  useFrame((state, dt) => {
    const g = group.current;
    const f = flipper.current;
    if (!g || !f) return;
    const s = st.current;
    const now = state.clock.elapsedTime;
    if (s.pendingEpoch) {
      s.epochAt = now;
      s.pendingEpoch = false;
    }
    if (s.born < 0) {
      s.born = now + delay;
      g.position.copy(SHOE_MOUTH);
    }
    s.target.set(...slot.pos);

    const t = (now - s.born) / FLIGHT;
    if (t < 0) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const faceUpTarget = slot.card ? 0 : Math.PI;

    if (t < 1) {
      const e = easeOut(t);
      g.position.lerpVectors(SHOE_MOUTH, s.target, e);
      g.position.y += Math.sin(Math.PI * t) * 0.45;
      g.rotation.y = (1 - e) * 0.8;
      // open cards turn over in the air; the hole card stays down
      s.angle = slot.hole ? Math.PI : Math.PI * (1 - e) + faceUpTarget * e;
    } else {
      const k = 1 - Math.exp(-dt * 9);
      g.position.lerp(s.target, k);
      g.rotation.y += (0 - g.rotation.y) * k;
      if (s.angle > faceUpTarget + 1e-3 && now >= Math.max(s.born + FLIGHT, s.epochAt + flipDelay)) {
        s.angle = Math.max(faceUpTarget, s.angle - (dt * Math.PI) / 0.42);
        g.position.y = s.target.y + Math.sin(s.angle) * 0.22;
      }
    }
    f.rotation.z = s.angle;

    const v = dim ? 0.42 : 1;
    front.current?.color.lerp(shade.setRGB(v, v, v), 1 - Math.exp(-dt * 4));
  });

  return (
    <group ref={group} visible={false}>
      <group ref={flipper}>
        <mesh geometry={geo} rotation-x={-Math.PI / 2} position-y={0.0012} castShadow receiveShadow>
          <meshStandardMaterial ref={front} map={slot.card ? cardFace(slot.card) : cardBack()} roughness={0.5} />
        </mesh>
        <mesh geometry={geo} rotation-x={Math.PI / 2} position-y={-0.0012} castShadow>
          <meshStandardMaterial map={cardBack()} roughness={0.45} />
        </mesh>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ chips */

const CHIP_R = 0.19;
const CHIP_H = 0.045;
const chipGeo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 40);
const chipMats = new Map<number, THREE.Material[]>();
function chipMaterials(value: number) {
  let m = chipMats.get(value);
  if (!m) {
    const side = new THREE.MeshStandardMaterial({ map: chipSide(value), roughness: 0.4 });
    const top = new THREE.MeshStandardMaterial({ map: chipTop(value), roughness: 0.35 });
    m = [side, top, top];
    chipMats.set(value, m);
  }
  return m;
}

function ChipStack({
  values,
  at,
  from,
  exitTo,
  delay = 0,
}: {
  values: number[];
  at: [number, number];
  from?: THREE.Vector3;
  exitTo?: THREE.Vector3 | null;
  delay?: number;
}) {
  const group = useRef<THREE.Group>(null);
  const st = useRef({ born: -1, exitAt: -1 });
  const target = useMemo(() => new THREE.Vector3(at[0], 0, at[1]), [at]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const s = st.current;
    const now = state.clock.elapsedTime;
    if (s.born < 0) {
      s.born = now + delay;
      g.position.copy(from ?? target);
    }
    const t = (now - s.born) / 0.55;
    if (t < 0) {
      g.visible = false;
      return;
    }
    g.visible = true;
    if (exitTo) {
      if (s.exitAt < 0) s.exitAt = now;
      g.position.lerp(exitTo, 1 - Math.exp(-dt * 5));
      const sc = Math.max(0, 1 - (now - s.exitAt) / 0.7);
      g.scale.setScalar(sc);
      return;
    }
    if (t < 1 && from) {
      const e = easeOut(t);
      g.position.lerpVectors(from, target, e);
      g.position.y += Math.sin(Math.PI * t) * 0.6;
    } else {
      g.position.lerp(target, 1 - Math.exp(-dt * 8));
    }
  });

  return (
    <group ref={group} visible={false}>
      {values.map((v, i) => (
        <mesh
          key={i}
          geometry={chipGeo}
          material={chipMaterials(v)}
          position={[Math.sin(i * 2.1) * 0.01, CHIP_H / 2 + i * (CHIP_H + 0.002), Math.cos(i * 1.7) * 0.01]}
          rotation-y={i * 0.7}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ table */

function TableBody() {
  const { felt, shape } = useMemo(() => {
    const { halfWidth: W, halfDepth: D } = TABLE;
    const shape = new THREE.Shape();
    shape.moveTo(-W, D);
    shape.lineTo(W, D);
    shape.absellipse(0, D, W, D * 2, 0, Math.PI, true);
    const felt = feltTexture();
    felt.repeat.set(1 / (W * 2), 1 / (D * 2));
    felt.offset.set(0.5, 0.5);
    return { felt, shape };
  }, []);

  const geometry = useMemo(
    () => new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 96 }),
    [shape],
  );

  const railCurves = useMemo(() => {
    const { halfWidth: W, halfDepth: D } = TABLE;
    const arc = (rx: number, rz: number, y: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 120; i++) {
        const a = Math.PI * (i / 120);
        pts.push(new THREE.Vector3(Math.cos(a) * rx, y, -D + Math.sin(a) * rz));
      }
      return new THREE.CatmullRomCurve3(pts);
    };
    return { rail: arc(W + 0.08, D * 2 + 0.08, 0.06), glow: arc(W - 0.2, D * 2 - 0.2, 0.004) };
  }, []);

  return (
    <group>
      <mesh geometry={geometry} rotation-x={-Math.PI / 2} position-y={-0.34} receiveShadow>
        <meshStandardMaterial attach="material-0" map={felt} roughness={0.95} />
        <meshStandardMaterial attach="material-1" color="#160c08" roughness={0.6} metalness={0.2} />
      </mesh>
      {/* padded leather rail */}
      <mesh castShadow receiveShadow>
        <tubeGeometry args={[railCurves.rail, 240, 0.2, 20, false]} />
        <meshPhysicalMaterial color="#1c100b" roughness={0.5} clearcoat={0.5} clearcoatRoughness={0.4} />
      </mesh>
      {/* the lava seam that gives the table its glow */}
      <mesh>
        <tubeGeometry args={[railCurves.glow, 240, 0.018, 8, false]} />
        <meshBasicMaterial color={new THREE.Color(5, 1.5, 0.35)} toneMapped={false} />
      </mesh>
      {/* dealer-side lip */}
      <mesh position={[0, 0.02, -TABLE.halfDepth - 0.04]} receiveShadow>
        <boxGeometry args={[TABLE.halfWidth * 2 + 0.3, 0.08, 0.1]} />
        <meshStandardMaterial color="#1c100b" roughness={0.5} />
      </mesh>
      {/* floor */}
      <mesh rotation-x={-Math.PI / 2} position-y={-1.4} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#0b0705" roughness={1} />
      </mesh>
    </group>
  );
}

function Shoe() {
  const back = cardBack();
  return (
    <group position={[3.25, 0, -1.8]} rotation-y={-0.55}>
      <mesh position-y={0.21} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.42, 1.15]} />
        <meshStandardMaterial color="#2b2019" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.43, -0.05]} rotation-x={-Math.PI / 2 + 0.25}>
        <planeGeometry args={[0.66, 0.92]} />
        <meshStandardMaterial map={back} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.3, 0.58]}>
        <boxGeometry args={[0.6, 0.03, 0.01]} />
        <meshBasicMaterial color={new THREE.Color(4, 1.2, 0.3)} toneMapped={false} />
      </mesh>
    </group>
  );
}

function ChipTray() {
  const values = [1000, 500, 100, 25, 5, 1, 5, 25];
  return (
    <group position={[TRAY.x, 0, TRAY.z]}>
      <mesh position-y={0.04} receiveShadow castShadow>
        <boxGeometry args={[3.4, 0.08, 0.5]} />
        <meshStandardMaterial color="#120a07" metalness={0.4} roughness={0.4} />
      </mesh>
      {values.map((v, i) => (
        <mesh key={i} position={[-1.4 + i * 0.4, 0.17, 0]} rotation-x={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.17, 0.17, 0.42, 32]} />
          <meshStandardMaterial color={CHIP_STYLE[v].base} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function ActiveRing({ x }: { x: number }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((state, dt) => {
    if (mat.current) mat.current.opacity = 0.55 + Math.sin(state.clock.elapsedTime * 4) * 0.25;
    if (mesh.current) mesh.current.position.x += (x - mesh.current.position.x) * (1 - Math.exp(-dt * 8));
  });
  return (
    <mesh ref={mesh} position={[x, 0.003, HAND_Z - 0.1]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.62, 0.68, 64]} />
      <meshBasicMaterial ref={mat} color={new THREE.Color(4, 1.3, 0.3)} toneMapped={false} transparent />
    </mesh>
  );
}

function WinFlash({ burstKey }: { burstKey: number }) {
  const light = useRef<THREE.PointLight>(null);
  useEffect(() => {
    if (burstKey && light.current) light.current.intensity = 40;
  }, [burstKey]);
  useFrame((_, dt) => {
    if (light.current) light.current.intensity *= Math.exp(-dt * 2.5);
  });
  return <pointLight ref={light} position={[0, 1.6, 0.6]} color="#ffaa44" intensity={0} distance={9} />;
}

function CameraRig() {
  const reduce = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  useFrame((state, dt) => {
    const { size, pointer } = state;
    const cam = state.camera as THREE.PerspectiveCamera;
    const narrow = size.width / size.height < 1.15;
    const fov = narrow ? 50 : 36;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const px = reduce ? 0 : pointer.x * 0.35;
    const py = reduce ? 0 : pointer.y * 0.2;
    const base = narrow ? new THREE.Vector3(px * 0.5, 4.7 + py, 3.9) : new THREE.Vector3(px, 5.0 + py, 5.25);
    cam.position.lerp(base, 1 - Math.exp(-dt * 3));
    cam.lookAt(0, 0, narrow ? 0.15 : 0.25);
  });
  return null;
}

/* ------------------------------------------------------------------ labels */

type Anchors = Record<string, [number, number, number]>;

/** Where each HTML label sits on the table, in world space. */
function labelAnchors(view: RoundView | null): Anchors {
  const out: Anchors = {};
  if (!view) {
    out.pending = [0, 0.02, BET_Z + 0.62];
    return out;
  }
  out.dealer = [0, 0.02, DEALER_Z + 0.78];
  view.hands.forEach((h, hi) => {
    const x = handX(hi, view.hands.length);
    out[`hand${hi}`] = [x - ((h.cards.length - 1) / 2) * 0.26 - 0.62, 0.02, HAND_Z];
  });
  return out;
}

/**
 * Projects label anchors to screen space every frame and moves plain DOM nodes that
 * live in an overlay owned by the main React tree (no extra React roots in the canvas).
 */
function LabelProjector({ anchors, els }: { anchors: Anchors; els: React.RefObject<Map<string, HTMLDivElement>> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame((state) => {
    const { width, height } = state.size;
    for (const [id, el] of els.current) {
      const a = anchors[id];
      if (!a) continue;
      v.set(a[0], a[1], a[2]).project(state.camera);
      el.style.setProperty("transform", `translate3d(${((v.x + 1) / 2) * width}px, ${((1 - v.y) / 2) * height}px, 0) translate(-50%, -50%)`);
      el.style.setProperty("opacity", "1");
    }
  });
  return null;
}

/* ------------------------------------------------------------------ scene */

function Scene(props: Table3DProps & { labelEls: React.RefObject<Map<string, HTMLDivElement>> }) {
  const { view, roundId, timing, epoch, revealed, pendingBetUsd, toUsd, burstKey, labelEls } = props;
  const slots = view && roundId ? layoutCards(view, roundId) : [];
  const settled = view?.phase === "settled";
  const shown = settled && revealed;

  return (
    <>
      <color attach="background" args={["#0a0705"]} />
      <fog attach="fog" args={["#0a0705", 10, 22]} />
      <ambientLight intensity={0.45} color="#ffd8b8" />
      <spotLight
        position={[0, 8, 3]}
        angle={0.62}
        penumbra={0.9}
        intensity={70}
        decay={1.6}
        color="#ffe2c4"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
      />
      <pointLight position={[-4.2, 0.7, 1.4]} color="#ff5a1f" intensity={5} distance={6} />
      <pointLight position={[4.2, 0.7, 1.4]} color="#ff5a1f" intensity={5} distance={6} />
      <pointLight position={[0, 2.5, -3.4]} color="#ffb070" intensity={6} distance={8} />
      <WinFlash burstKey={burstKey} />

      <TableBody />
      <Shoe />
      <ChipTray />
      <Sparkles count={45} scale={[10, 2.4, 6]} position={[0, 1.3, 0]} size={2.6} speed={0.35} color="#ff8a3d" opacity={0.85} />

      {slots.map((s) => (
        <Card3D
          key={s.key}
          slot={s}
          epoch={epoch}
          delay={timing.delays[s.delayKey] ?? 0}
          flipDelay={s.hole ? timing.flip : 0}
          dim={!!(shown && !s.delayKey.startsWith("d") && isLosingCard(view!, s))}
        />
      ))}

      {/* stakes */}
      {view && roundId ? (
        view.hands.map((h, hi) => {
          const x = handX(hi, view.hands.length);
          const betUsd = toUsd(h.bet);
          const profitUsd = toUsd((h.payout ?? 0) - h.bet);
          const lost = shown && (h.result === "lose" || h.result === "surrender");
          return (
            <group key={`${roundId}:stake${hi}`}>
              <ChipStack values={chipsFor(betUsd, 10)} at={[x, BET_Z]} from={hi === 0 ? PLAYER_SIDE : undefined} exitTo={lost ? TRAY : null} />
              {shown && profitUsd > 0 && <ChipStack values={chipsFor(profitUsd, 10)} at={[x + 0.44, BET_Z]} from={TRAY} />}
            </group>
          );
        })
      ) : (
        <ChipStack key={`pending:${chipsFor(pendingBetUsd, 10).join(",")}`} values={chipsFor(pendingBetUsd, 10)} at={[0, BET_Z]} />
      )}
      {view && view.hands.length > 1 && view.phase === "player" && <ActiveRing x={handX(view.active, view.hands.length)} />}

      <LabelProjector anchors={labelAnchors(view)} els={labelEls} />
      <CameraRig />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur intensity={0.85} luminanceThreshold={1.05} luminanceSmoothing={0.25} />
        <Vignette offset={0.25} darkness={0.7} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  );
}

function isLosingCard(view: RoundView, slot: CardSlot) {
  const h = view.hands.find((hand, hi) => hand.cards.some((c, i) => playerKey(hi, i, c) === slot.delayKey));
  return !!h && (h.result === "lose" || h.result === "surrender");
}

/** Screen-reader description of the table, since the canvas itself is just pixels. */
function describe(view: RoundView | null) {
  if (!view) return "No hand in play.";
  const dealer = view.dealer.map((c) => (c ? cardLabel(c) : "hidden card")).join(", ");
  const hands = view.hands.map((h, i) => `Hand ${i + 1}: ${h.cards.map(cardLabel).join(", ")} (${h.total})${h.result ? `, ${h.result}` : ""}`);
  return `Dealer: ${dealer}. ${hands.join(". ")}.`;
}

function Labels({ view, revealed, pendingBetUsd, toUsd, register }: Table3DProps & { register: (id: string) => (el: HTMLDivElement | null) => void }) {
  const settled = view?.phase === "settled";
  const shown = settled && revealed;
  const cls = "absolute left-0 top-0 flex flex-col items-center gap-1 whitespace-nowrap opacity-0 will-change-transform";
  if (!view) {
    return (
      <div ref={register("pending")} className={cls}>
        <span className="tabular rounded-full bg-ash-950/80 px-3 py-1 font-display text-sm font-bold text-ember-200 ring-1 ring-ember-500/40">
          {formatUsd(pendingBetUsd)}
        </span>
      </div>
    );
  }
  return (
    <>
      {view.dealerTotal && (
        <div ref={register("dealer")} className={cls}>
          <TotalBadge
            total={revealed || !settled ? view.dealerTotal.total : null}
            soft={view.dealerTotal.soft}
            hiddenHole={!view.dealer[1]}
            bust={shown && view.dealerTotal.total > 21}
          />
        </div>
      )}
      {view.hands.map((h, hi) => (
        <div key={hi} ref={register(`hand${hi}`)} className={cls}>
          {shown && h.result && <ResultTag result={h.result} payoutUsd={toUsd(h.payout ?? 0)} betUsd={toUsd(h.bet)} />}
          <TotalBadge total={h.total} soft={h.soft} bust={h.total > 21} active={view.phase === "player" && hi === view.active} />
          <span className="tabular rounded-full bg-ash-950/80 px-2 py-0.5 text-[11px] font-semibold text-ember-200 ring-1 ring-ash-700">
            {formatUsd(toUsd(h.bet))}
            {h.doubled ? " ×2" : ""}
          </span>
        </div>
      ))}
    </>
  );
}

export default function Table3D(props: Table3DProps) {
  const labelEls = useRef(new Map<string, HTMLDivElement>());
  const register = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) labelEls.current.set(id, el);
      else labelEls.current.delete(id);
    },
    [],
  );
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let live = true;
    document.fonts.ready.then(() => live && setFontsReady(true));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="relative h-[420px] overflow-hidden rounded-[28px] ring-1 ring-ember-500/25 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9),0_0_60px_-20px_rgba(255,90,31,0.35)] sm:h-[540px] sm:rounded-[44px]">
      {fontsReady ? (
        <Canvas
          shadows="percentage"
          dpr={[1, 1.75]}
          camera={{ position: [0, 5.0, 5.25], fov: 36, near: 0.1, far: 60 }}
          gl={{ antialias: false, powerPreference: "high-performance" }}
          aria-label="3D blackjack table"
        >
          <Scene {...props} labelEls={labelEls} />
        </Canvas>
      ) : (
        <div className="felt h-full w-full animate-pulse" />
      )}
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        <Labels {...props} register={register} />
      </div>
      <p className="sr-only" aria-live="polite">
        {describe(props.view)}
      </p>
    </div>
  );
}
