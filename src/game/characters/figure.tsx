"use client";

/**
 * A stylized character built from simple shapes: big head, expressive brows and mouth,
 * blinking eyes that follow the camera, arms on a two-joint rig, and an inked outline so it
 * reads against the dark room. Everything animates procedurally from a `Pose` + `Face`
 * target that the caller changes; the figure eases toward it every frame.
 *
 * Local space: the figure's origin is at table height directly below its chest, +z faces
 * the table. Seated figures rest their forearms on the rail; standing ones (dealers) rest
 * their hands on the table edge. 1 unit ≈ the size of the head's radius × 2.4.
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useSceneFx } from "@/game/three/fx-context";
import type { Accessory, Face, Look, Outfit } from "./looks";

/* ------------------------------------------------------------------ poses */

/** Arm angles: shoulder [x (swing forward is negative), y (twist), z (out/in)], elbow x (bend, negative). */
export interface ArmPose {
  sx: number;
  sy: number;
  sz: number;
  ex: number;
}
export interface Pose {
  left: ArmPose;
  right: ArmPose;
  /** torso lean toward the table (+) or back (−), radians */
  lean: number;
  /** vertical offset (slump −, rise +) */
  lift: number;
  /** head pitch offset (+ looks down) */
  nod: number;
}

const arm = (sx: number, sz: number, ex: number, sy = 0): ArmPose => ({ sx, sy, sz, ex });
const mirror = (a: ArmPose): ArmPose => ({ sx: a.sx, sy: -a.sy, sz: -a.sz, ex: a.ex });

export const POSES = {
  /** forearms resting on the rail */
  rest: { left: arm(-0.55, 0.18, -1.05), right: mirror(arm(-0.55, 0.18, -1.05)), lean: 0.05, lift: 0, nod: 0.05 },
  /** right hand under the chin */
  think: { left: arm(-0.55, 0.18, -1.05), right: arm(-1.2, -0.45, -1.75), lean: 0.14, lift: 0, nod: 0.02 },
  /** right arm pushing chips forward */
  push: { left: arm(-0.55, 0.18, -1.05), right: arm(-1.35, -0.12, -0.25), lean: 0.3, lift: 0.04, nod: 0.12 },
  /** arms crossed, leaning back */
  fold: { left: arm(-0.35, 0.1, -1.95, 0.95), right: mirror(arm(-0.35, 0.1, -1.95, 0.95)), lean: -0.18, lift: -0.08, nod: 0.18 },
  /** both arms up */
  // (z flips meaning once the arm is raised: negative here swings the left arm outward)
  cheer: { left: arm(-2.55, -0.8, -0.3), right: mirror(arm(-2.55, -0.8, -0.3)), lean: -0.05, lift: 0.1, nod: -0.15 },
  /** dealer: hands on the table edge */
  stand: { left: arm(-0.4, 0.15, -0.95), right: mirror(arm(-0.4, 0.15, -0.95)), lean: 0.08, lift: 0, nod: 0.1 },
  /** dealer: right arm sweeping a card out */
  deal: { left: arm(-0.4, 0.15, -0.95), right: arm(-1.15, -0.35, -0.55, -0.3), lean: 0.18, lift: 0, nod: 0.2 },
  /** dealer: both palms open (a shrug, a push) */
  shrug: { left: arm(-0.75, 0.55, -1.2, -0.4), right: mirror(arm(-0.75, 0.55, -1.2, -0.4)), lean: 0, lift: 0.03, nod: -0.05 },
  /** dealer: applauding the player */
  clap: { left: arm(-1.0, 0.0, -1.45, -0.7), right: mirror(arm(-1.0, 0.0, -1.45, -0.7)), lean: 0.06, lift: 0.02, nod: 0 },
} satisfies Record<string, Pose>;

export type PoseName = keyof typeof POSES;

/* ------------------------------------------------------------------ shared geometry */

type Geo = ReturnType<typeof makeGeo>;
const geoCache = new Map<string, Geo>();

function makeGeo(seg: number) {
  const s = seg;
  const half = (r: number) => new THREE.SphereGeometry(r, s, Math.ceil(s / 2), 0, Math.PI * 2, 0, Math.PI / 2);
  // smile: a ∪-shaped arc (torus upper half flipped by the mesh)
  return {
    sphere: new THREE.SphereGeometry(1, s, Math.ceil(s * 0.75)),
    hemi: half(1),
    capsule: new THREE.CapsuleGeometry(1, 1, 4, Math.max(8, s / 2)),
    cyl: new THREE.CylinderGeometry(1, 1, 1, s, 1),
    cone: new THREE.ConeGeometry(1, 1, Math.max(6, s / 2)),
    torus: new THREE.TorusGeometry(1, 0.12, 8, s),
    arc: new THREE.TorusGeometry(0.11, 0.024, 6, 18, Math.PI),
    band: new THREE.TorusGeometry(1, 0.06, 8, s, Math.PI),
    box: new THREE.BoxGeometry(1, 1, 1),
    /** a hat crown: narrower at the top */
    crown: new THREE.CylinderGeometry(0.86, 1, 1, s, 1),
    torso: torsoGeometry(s),
  };
}

/** A tapered, rounded torso (wider at the shoulders) as a lathe. */
function torsoGeometry(seg: number) {
  const pts: THREE.Vector2[] = [];
  const prof: [number, number][] = [
    [0.0, -0.7],
    [0.44, -0.7],
    [0.47, -0.35],
    [0.5, 0.05],
    [0.58, 0.4],
    [0.58, 0.56],
    [0.47, 0.7],
    [0.24, 0.79],
    [0.0, 0.8],
  ];
  for (const [x, y] of prof) pts.push(new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, seg);
  g.scale(1, 1, 0.62); // flatter front to back
  return g;
}

function useGeo(quality: "high" | "low") {
  const key = quality;
  let g = geoCache.get(key);
  if (!g) {
    g = makeGeo(quality === "low" ? 12 : 24);
    geoCache.set(key, g);
  }
  return g;
}

/* ------------------------------------------------------------------ materials */

const INK = new THREE.MeshBasicMaterial({ color: "#0a0503", side: THREE.BackSide });

/**
 * Pinstripes as a tiny tiling texture: a mid-grey cloth with one light thread, multiplied over
 * the suit colour (which is brightened to compensate). Shared by every pinstriped figure.
 */
let pinstripeTex: THREE.CanvasTexture | null = null;
const PINSTRIPE_GAIN = 1.3;
function pinstripe() {
  if (pinstripeTex || typeof document === "undefined") return pinstripeTex;
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 2;
  const g = c.getContext("2d")!;
  g.fillStyle = "#b4b4b4";
  g.fillRect(0, 0, 16, 2);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(22, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  pinstripeTex = t;
  return t;
}

function useMats(look: Look) {
  return useMemo(() => {
    const std = (color: string, rough = 0.7, metal = 0, emissive?: string, ei = 0) =>
      new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: emissive ?? "#000000", emissiveIntensity: ei });
    const skin = std(look.skin, 0.62);
    // a little self-light so faces don't sink into the dark room
    skin.emissive = new THREE.Color(look.skin).multiplyScalar(0.18);
    const stripes = look.outfit.pinstripe ? pinstripe() : null;
    const main = std(look.outfit.main, 0.75);
    const mainBase = new THREE.Color(look.outfit.main);
    if (stripes) {
      main.map = stripes;
      mainBase.multiplyScalar(PINSTRIPE_GAIN);
    }
    const hatColor = look.hat?.main ?? "#1a1210";
    return {
      skin,
      hair: std(look.hair.color, 0.55),
      main,
      accent: std(look.outfit.accent, 0.6),
      shirt: std(look.outfit.shirt, 0.65),
      hat: std(hatColor, 0.8),
      band: std(look.hat?.band ?? "#000000", 0.55),
      /** the lit end of a cigar; pulses in the frame loop */
      ember: new THREE.MeshBasicMaterial({ color: "#ff5a14", toneMapped: false }),
      cigar: std("#5a3520", 0.8),
      ash: std("#8c8580", 0.9),
      wood: std("#d8b880", 0.7),
      carnation: std("#b3121a", 0.6, 0, "#5a0508", 0.3),
      scar: new THREE.MeshBasicMaterial({ color: new THREE.Color(look.skin).multiplyScalar(0.62) }),
      stubble: new THREE.MeshBasicMaterial({ color: "#1a0e08", transparent: true, opacity: 0.2, depthWrite: false }),
      white: new THREE.MeshStandardMaterial({ color: "#fbf4ea", roughness: 0.3, emissive: "#fbf4ea", emissiveIntensity: 0.25 }),
      pupil: new THREE.MeshStandardMaterial({ color: look.eyes, roughness: 0.2, emissive: look.eyes, emissiveIntensity: 0.15 }),
      dark: new THREE.MeshBasicMaterial({ color: "#1a0806" }),
      mouth: new THREE.MeshStandardMaterial({ color: "#3a0d0a", roughness: 0.6 }),
      lip: new THREE.MeshBasicMaterial({ color: "#2a0a07" }),
      glint: new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }),
      gold: std("#e7b453", 0.3, 0.9, "#7a4a10", 0.35),
      lens: new THREE.MeshStandardMaterial({ color: "#0b0b10", roughness: 0.08, metalness: 0.6 }),
      frame: std("#20140e", 0.4, 0.4),
      blush: new THREE.MeshBasicMaterial({ color: "#ff6a5a", transparent: true, opacity: 0, depthWrite: false }),
      visor: new THREE.MeshStandardMaterial({ color: "#1f7a4a", roughness: 0.4, transparent: true, opacity: 0.85, emissive: "#0f3a22", emissiveIntensity: 0.4 }),
      leather: std("#1b0d08", 0.5, 0.1),
      /** undimmed colors, for fading a folded figure */
      base: {
        main: mainBase,
        accent: new THREE.Color(look.outfit.accent),
        shirt: new THREE.Color(look.outfit.shirt),
        hat: new THREE.Color(hatColor),
        hair: new THREE.Color(look.hair.color),
      },
    };
  }, [look]);
}

/* ------------------------------------------------------------------ figure */

export interface FigureProps {
  look: Look;
  pose: PoseName;
  face: Face;
  /** standing (dealer) or seated (player) */
  stance?: "seated" | "standing";
  /** dim and desaturate (folded) 0..1 */
  dim?: number;
  /** world-space point the eyes and head follow (default: the camera) */
  lookAt?: THREE.Vector3 | null;
  /** phase offset so a table of figures doesn't breathe in sync */
  phase?: number;
  /** bumps to replay a quick gesture (bet, deal) */
  kick?: number;
  /** extra bounce (celebration) 0..1 */
  bounce?: number;
}

const HEAD_R = 0.42;
const tmpV = new THREE.Vector3();

export function Figure({ look, pose, face, stance = "seated", dim = 0, lookAt = null, phase = 0, kick = 0, bounce = 0 }: FigureProps) {
  const fx = useSceneFx();
  const geo = useGeo(fx.quality);
  const m = useMats(look);
  const ink = fx.quality === "high";
  // the frame loop dims materials in place; reach them through a ref, not the memo
  const mats = useRef(m);
  useEffect(() => {
    mats.current = m;
  }, [m]);

  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group[]>([]);
  const pupils = useRef<THREE.Group[]>([]);
  const brows = useRef<THREE.Mesh[]>([]);
  const mouthArc = useRef<THREE.Mesh>(null);
  const mouthOpen = useRef<THREE.Mesh>(null);
  const shoulders = useRef<THREE.Group[]>([]);
  const elbows = useRef<THREE.Group[]>([]);

  // eased state
  const cur = useRef({
    face: { ...face },
    pose: structuredClone(POSES[pose]) as Pose,
    blink: 0,
    nextBlink: 1 + (Math.abs(phase * 7.3) % 3),
    kickKey: kick,
    kickT: 9,
    dim,
    yaw: 0,
    pitch: 0,
  });

  const W = look.build.width;
  const H = look.build.height;
  const hs = look.build.head;
  const standing = stance === "standing";
  const shoulderY = 0.74;
  const headY = shoulderY + 0.3 + HEAD_R * hs * 0.95;
  const upper = 0.42;
  const fore = 0.42;

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const c = cur.current;
    const still = fx.reducedMotion;
    const t = state.clock.elapsedTime + phase;
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    const energy = look.temper.energy;

    // ease toward the target face and pose
    const tf = face;
    const fk = k(7);
    c.face.smile += (tf.smile - c.face.smile) * fk;
    c.face.open += (tf.open - c.face.open) * fk;
    c.face.brow += (tf.brow - c.face.brow) * fk;
    c.face.lid += (tf.lid - c.face.lid) * fk;
    c.dim += (dim - c.dim) * k(4);

    const tp = POSES[pose];
    const pk = k(still ? 20 : 5 + energy * 4);
    for (const side of ["left", "right"] as const) {
      const a = c.pose[side];
      const b = tp[side];
      a.sx += (b.sx - a.sx) * pk;
      a.sy += (b.sy - a.sy) * pk;
      a.sz += (b.sz - a.sz) * pk;
      a.ex += (b.ex - a.ex) * pk;
    }
    c.pose.lean += (tp.lean - c.pose.lean) * pk;
    c.pose.lift += (tp.lift - c.pose.lift) * pk;
    c.pose.nod += (tp.nod - c.pose.nod) * pk;

    // a quick gesture on each kick (a bet lands, a card is dealt)
    if (c.kickKey !== kick) {
      c.kickKey = kick;
      c.kickT = 0;
    }
    c.kickT += dt;
    const punch = still ? 0 : Math.exp(-c.kickT * 4) * Math.sin(Math.min(c.kickT * 10, Math.PI));

    // body: breathing, bounce, lean
    const breathe = still ? 0 : Math.sin(t * 1.6) * 0.012;
    const hop = still ? 0 : bounce * Math.abs(Math.sin(t * (5 + energy * 3))) * 0.16 * (0.5 + energy);
    if (root.current) root.current.position.y = c.pose.lift + hop - c.dim * 0.12;
    if (torso.current) {
      torso.current.rotation.x = c.pose.lean + punch * 0.18;
      torso.current.scale.set(1 + breathe, 1 + breathe * 1.5, 1 + breathe);
      // fidgety characters sway a little
      torso.current.rotation.z = still ? 0 : Math.sin(t * 0.7) * 0.025 * energy;
    }

    // arms
    for (let i = 0; i < 2; i++) {
      const a = i === 0 ? c.pose.left : c.pose.right;
      const sh = shoulders.current[i];
      const el = elbows.current[i];
      if (!sh || !el) continue;
      const extra = i === 1 ? punch * -0.35 : 0;
      sh.rotation.set(a.sx + extra, a.sy, a.sz, "XYZ");
      el.rotation.x = a.ex + (i === 1 ? punch * 0.3 : 0);
    }

    // head: follow the target with limited yaw/pitch, plus idle drift
    const h = head.current;
    if (h && root.current) {
      const target = lookAt ?? state.camera.position;
      h.updateWorldMatrix(true, false);
      const parent = h.parent!;
      tmpV.copy(target);
      parent.worldToLocal(tmpV);
      tmpV.sub(h.position);
      const yaw = THREE.MathUtils.clamp(Math.atan2(tmpV.x, tmpV.z), -0.7, 0.7);
      const pitch = THREE.MathUtils.clamp(-Math.atan2(tmpV.y, Math.hypot(tmpV.x, tmpV.z)), -0.35, 0.45);
      const drift = still ? 0 : Math.sin(t * 0.43) * 0.12 * (0.3 + energy);
      c.yaw += (yaw * 0.7 + drift - c.yaw) * k(3);
      c.pitch += (pitch * 0.6 + c.pose.nod - c.pitch) * k(3);
      h.rotation.set(c.pitch, c.yaw, look.temper.smirk * 0.05 + (still ? 0 : Math.sin(t * 0.9) * 0.03 * energy), "YXZ");
      // eyes travel further than the head
      const ex = THREE.MathUtils.clamp((yaw - c.yaw) * 0.08, -0.035, 0.035);
      const ey = THREE.MathUtils.clamp(-(pitch - c.pitch) * 0.06, -0.025, 0.025);
      for (const p of pupils.current) if (p) p.position.set(ex, ey, 0);
    }

    // blinking
    c.nextBlink -= dt;
    if (c.nextBlink <= 0 && !still) {
      c.blink = 1;
      c.nextBlink = 2 + Math.random() * 4;
    }
    c.blink = Math.max(0, c.blink - dt * 9);
    const openEye = Math.max(0.08, 1 - c.face.lid * 0.55 - (c.blink > 0.5 ? (1 - c.blink) * 2 : c.blink * 2) * 0.9);
    for (const e of eyes.current) if (e) e.scale.y = openEye;

    // brows: negative = angled down toward the nose (focus/anger), positive = raised (worry/joy)
    const bh = c.face.brow;
    brows.current.forEach((b, i) => {
      if (!b) return;
      const sign = i === 0 ? 1 : -1;
      b.rotation.z = sign * -bh * 0.45;
      b.position.y = 0.16 * hs + Math.max(0, bh) * 0.045 - c.face.lid * 0.02;
    });

    // mouth
    if (mouthArc.current) {
      const s = c.face.smile;
      const sy = Math.sign(s || 1) * Math.max(0.18, Math.abs(s));
      mouthArc.current.scale.set(1 + Math.abs(s) * 0.25, sy, 1);
      mouthArc.current.rotation.z = Math.PI + look.temper.smirk * 0.25;
      mouthArc.current.visible = c.face.open < 0.12;
    }
    if (mouthOpen.current) {
      // smiling + open = a laughing "D" (flat top, round bottom); otherwise an "o"
      const o = c.face.open;
      const laugh = c.face.smile > 0.2;
      mouthOpen.current.visible = o >= 0.12;
      mouthOpen.current.geometry = laugh ? geo.hemi : geo.sphere;
      mouthOpen.current.rotation.z = laugh ? Math.PI : 0;
      mouthOpen.current.scale.set(laugh ? 0.11 + o * 0.04 : 0.06 + o * 0.03, laugh ? 0.05 + o * 0.08 : 0.03 + o * 0.06, 0.035);
      mouthOpen.current.position.y = laugh ? -0.135 : -0.17;
    }

    // dim when folded
    const lit = 1 - c.dim * 0.55;
    const mm = mats.current;
    mm.skin.emissiveIntensity = lit;
    mm.main.color.copy(mm.base.main).multiplyScalar(lit);
    mm.accent.color.copy(mm.base.accent).multiplyScalar(lit);
    mm.shirt.color.copy(mm.base.shirt).multiplyScalar(lit);
    mm.hat.color.copy(mm.base.hat).multiplyScalar(lit);
    mm.hair.color.copy(mm.base.hair).multiplyScalar(lit);
    // the cigar's lit end breathes, brighter on each slow draw
    const draw = still ? 0.5 : Math.pow(Math.max(0, Math.sin(t * 0.8)), 6);
    mm.ember.color.setRGB(1, 0.3 + draw * 0.25, 0.06).multiplyScalar((1.1 + draw * 1.2) * lit);
  });

  const acc = new Set<Accessory>(look.accessories);
  const outfit = look.outfit.style;

  // shoulders
  const sw = 0.5 * W;

  return (
    <group ref={root} scale={[1, H, 1]}>
      {/* chair back for seated figures */}
      {!standing && (
        <mesh geometry={geo.box} material={m.leather} position={[0, 0.25, -0.5]} scale={[1.25 * W, 1.6, 0.22]} />
      )}

      <group ref={torso} position={[0, -0.2, 0]}>
        {/* torso */}
        <mesh geometry={geo.torso} material={m.main} position={[0, 0.2, 0]} scale={[W, 1, W]} castShadow={ink} />
        {ink && <mesh geometry={geo.torso} material={INK} position={[0, 0.2, 0]} scale={[W * 1.04, 1.02, W * 1.06]} />}

        <group scale={[1, 0.86, 1]}>
          <OutfitDetails outfit={outfit} geo={geo} m={m} W={W} acc={acc} />
        </group>

        {/* neck (a turtleneck covers it) */}
        {acc.has("turtleneck") ? (
          <mesh geometry={geo.cyl} material={m.accent} position={[0, shoulderY + 0.1, 0]} scale={[0.19, 0.3, 0.19]} />
        ) : (
          <mesh geometry={geo.cyl} material={m.skin} position={[0, shoulderY + 0.08, 0]} scale={[0.14, 0.24, 0.14]} />
        )}

        {/* arms: jacket sleeves with a shirt cuff, bare shirt sleeves under a waistcoat, or
            sleeves rolled to the elbow */}
        {[0, 1].map((i) => {
          const side = i === 0 ? -1 : 1;
          const sleeve = outfit === "vest" ? m.shirt : m.main;
          const jacket = outfit === "suit" || outfit === "doublebreast" || outfit === "overcoat";
          return (
            <group key={i} ref={(g) => void (shoulders.current[i] = g!)} position={[side * sw, shoulderY - 0.02, 0]}>
              <mesh geometry={geo.sphere} material={sleeve} scale={0.16} />
              <mesh geometry={geo.capsule} material={sleeve} position={[0, -upper / 2, 0]} scale={[0.15, upper / 2.2, 0.15]} />
              {acc.has("garters") && <mesh geometry={geo.cyl} material={m.accent} position={[0, -upper * 0.42, 0]} scale={[0.158, 0.04, 0.158]} />}
              <group ref={(g) => void (elbows.current[i] = g!)} position={[0, -upper, 0]}>
                <mesh geometry={geo.capsule} material={outfit === "shirt" ? m.skin : sleeve} position={[0, -fore / 2, 0]} scale={[0.115, fore / 2.2, 0.115]} />
                {outfit === "shirt" && <mesh geometry={geo.cyl} material={m.shirt} position={[0, -0.05, 0]} scale={[0.135, 0.08, 0.135]} />}
                {jacket && <mesh geometry={geo.cyl} material={m.shirt} position={[0, -fore + 0.03, 0]} scale={[0.122, 0.05, 0.122]} />}
                <mesh geometry={geo.sphere} material={m.skin} position={[0, -fore - 0.06, 0]} scale={[0.12, 0.13, 0.1]} />
                {/* pinky ring on the right hand */}
                {i === 1 && acc.has("ring") && <mesh geometry={geo.sphere} material={m.gold} position={[0.07, -fore - 0.13, 0.03]} scale={[0.03, 0.026, 0.03]} />}
              </group>
            </group>
          );
        })}

        {/* head */}
        <group ref={head} position={[0, headY, 0]}>
          <group scale={hs}>
            <mesh geometry={geo.sphere} material={m.skin} scale={[HEAD_R, HEAD_R * 1.04, HEAD_R * 0.96]} castShadow={ink} />
            {ink && <mesh geometry={geo.sphere} material={INK} scale={[HEAD_R * 1.045, HEAD_R * 1.085, HEAD_R * 1.0]} />}
            {/* ears */}
            <mesh geometry={geo.sphere} material={m.skin} position={[-HEAD_R * 0.97, -0.02, 0]} scale={[0.06, 0.1, 0.07]} />
            <mesh geometry={geo.sphere} material={m.skin} position={[HEAD_R * 0.97, -0.02, 0]} scale={[0.06, 0.1, 0.07]} />

            {/* eyes */}
            {[-1, 1].map((side, i) => (
              <group key={side} position={[side * 0.15, 0.04, HEAD_R * 0.86]}>
                <group ref={(g) => void (eyes.current[i] = g!)}>
                  <mesh geometry={geo.sphere} material={m.white} scale={[0.085, 0.1, 0.05]} />
                  <group ref={(g) => void (pupils.current[i] = g!)}>
                    <mesh geometry={geo.sphere} material={m.pupil} position={[0, -0.005, 0.038]} scale={[0.05, 0.06, 0.02]} />
                    <mesh geometry={geo.sphere} material={m.dark} position={[0, -0.005, 0.05]} scale={[0.025, 0.03, 0.01]} />
                    <mesh geometry={geo.sphere} material={m.glint} position={[0.018, 0.02, 0.058]} scale={0.012} />
                  </group>
                </group>
              </group>
            ))}

            {/* brows */}
            {[-1, 1].map((side, i) => (
              <mesh
                key={side}
                ref={(b) => void (brows.current[i] = b!)}
                geometry={geo.capsule}
                material={m.hair}
                position={[side * 0.15, 0.16, HEAD_R * 0.9]}
                rotation={[0, 0, Math.PI / 2]}
                scale={[0.022, 0.06, 0.02]}
              />
            ))}

            {/* nose */}
            <mesh geometry={geo.sphere} material={m.skin} position={[0, -0.06, HEAD_R * 0.97]} scale={[0.05, 0.055, 0.05]} />

            {/* mouth */}
            <mesh ref={mouthArc} geometry={geo.arc} material={m.lip} position={[0, -0.17, HEAD_R * 0.9]} rotation={[0, 0, Math.PI]} />
            <mesh ref={mouthOpen} geometry={geo.sphere} material={m.mouth} position={[0, -0.17, HEAD_R * 0.9]} visible={false} />

            {acc.has("freckles") &&
              [-1, 1].flatMap((side) =>
                [0, 1, 2].map((j) => (
                  <mesh
                    key={`${side}${j}`}
                    geometry={geo.sphere}
                    material={m.hair}
                    position={[side * (0.17 + j * 0.035), -0.07 + (j % 2) * 0.025, HEAD_R * 0.87]}
                    scale={0.009}
                  />
                )),
              )}

            <Hair look={look} geo={geo} m={m} />
            <HeadAccessories acc={acc} geo={geo} m={m} />
            {look.hat && <Hat hat={look.hat} geo={geo} m={m} ink={ink} />}
          </group>
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ parts */

type Mats = ReturnType<typeof useMats>;

function OutfitDetails({ outfit, geo, m, W, acc }: { outfit: Outfit; geo: Geo; m: Mats; W: number; acc: Set<Accessory> }) {
  const front = 0.38 * W;
  // the wearer's left chest (+x: the figure faces +z)
  const chest = 0.22 * W;
  return (
    <group>
      {outfit === "suit" && (
        <>
          {/* shirt V, notched lapels, two buttons */}
          <mesh geometry={geo.cone} material={m.shirt} position={[0, 0.78, front - 0.02]} rotation={[Math.PI, 0, 0]} scale={[0.17, 0.4, 0.05]} />
          <mesh geometry={geo.box} material={m.main} position={[-0.13, 0.7, front + 0.01]} rotation={[0, 0, -0.35]} scale={[0.1, 0.42, 0.03]} />
          <mesh geometry={geo.box} material={m.main} position={[0.13, 0.7, front + 0.01]} rotation={[0, 0, 0.35]} scale={[0.1, 0.42, 0.03]} />
          {[0.3, 0.12].map((y) => (
            <mesh key={y} geometry={geo.sphere} material={m.dark} position={[0, y, front + 0.03]} scale={0.026} />
          ))}
        </>
      )}
      {outfit === "doublebreast" && (
        <>
          {/* narrow V, wide peaked lapels, two columns of buttons */}
          <mesh geometry={geo.cone} material={m.shirt} position={[0, 0.8, front - 0.02]} rotation={[Math.PI, 0, 0]} scale={[0.14, 0.34, 0.05]} />
          <mesh geometry={geo.box} material={m.main} position={[-0.15, 0.68, front + 0.015]} rotation={[0, 0, -0.5]} scale={[0.15, 0.44, 0.03]} />
          <mesh geometry={geo.box} material={m.main} position={[0.15, 0.68, front + 0.015]} rotation={[0, 0, 0.5]} scale={[0.15, 0.44, 0.03]} />
          {[-0.1, 0.1].flatMap((x) =>
            [0.36, 0.16].map((y) => <mesh key={`${x}${y}`} geometry={geo.sphere} material={m.dark} position={[x, y, front + 0.03]} scale={0.027} />),
          )}
        </>
      )}
      {outfit === "vest" && (
        <>
          {/* waistcoat V over the shirt, brass buttons */}
          <mesh geometry={geo.cone} material={m.shirt} position={[0, 0.74, front - 0.02]} rotation={[Math.PI, 0, 0]} scale={[0.2, 0.5, 0.05]} />
          {[0.38, 0.2, 0.02].map((y) => (
            <mesh key={y} geometry={geo.sphere} material={m.gold} position={[0, y, front + 0.04]} scale={0.03} />
          ))}
        </>
      )}
      {outfit === "shirt" && (
        <>
          {/* collar points, button placket, suspenders */}
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={geo.cone} material={m.shirt} position={[s * 0.07, 0.9, front - 0.06]} rotation={[0.2, 0, s * 2.6]} scale={[0.06, 0.12, 0.03]} />
          ))}
          {[0.62, 0.42, 0.22, 0.02].map((y) => (
            <mesh key={y} geometry={geo.sphere} material={m.frame} position={[0, y, front + 0.02]} scale={0.018} />
          ))}
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={geo.box} material={m.accent} position={[s * 0.17 * W, 0.42, front * 0.95]} rotation={[0, s * 0.35, 0]} scale={[0.05, 1.0, 0.03]} />
          ))}
        </>
      )}
      {outfit === "overcoat" && (
        <>
          {/* collar turned up around the neck, broad lapels, two buttons */}
          <mesh geometry={geo.torus} material={m.main} position={[0, 1.0, -0.03]} rotation={[Math.PI / 2 - 0.35, 0, 0]} scale={[0.36, 0.33, 1.1]} />
          <mesh geometry={geo.cone} material={m.shirt} position={[0, 0.76, front - 0.02]} rotation={[Math.PI, 0, 0]} scale={[0.16, 0.36, 0.05]} />
          <mesh geometry={geo.box} material={m.main} position={[-0.16, 0.62, front + 0.015]} rotation={[0, 0, -0.4]} scale={[0.16, 0.5, 0.035]} />
          <mesh geometry={geo.box} material={m.main} position={[0.16, 0.62, front + 0.015]} rotation={[0, 0, 0.4]} scale={[0.16, 0.5, 0.035]} />
          {[0.3, 0.08].map((y) => (
            <mesh key={y} geometry={geo.sphere} material={m.dark} position={[0.12, y, front + 0.03]} scale={0.03} />
          ))}
        </>
      )}
      {acc.has("tie") &&
        (outfit === "shirt" ? (
          // pulled loose at the collar
          <group position={[0.015, -0.05, 0]} rotation={[0, 0, 0.08]}>
            <mesh geometry={geo.box} material={m.accent} position={[0, 0.86, front + 0.02]} rotation={[0, 0, Math.PI / 4 + 0.25]} scale={[0.06, 0.06, 0.04]} />
            <mesh geometry={geo.cone} material={m.accent} position={[0, 0.6, front + 0.03]} rotation={[Math.PI, 0, 0]} scale={[0.07, 0.42, 0.02]} />
          </group>
        ) : (
          <>
            <mesh geometry={geo.box} material={m.accent} position={[0, 0.88, front + 0.02]} rotation={[0, 0, Math.PI / 4]} scale={[0.06, 0.06, 0.04]} />
            <mesh geometry={geo.cone} material={m.accent} position={[0, 0.62, front + 0.03]} rotation={[Math.PI, 0, 0]} scale={[0.07, 0.42, 0.02]} />
          </>
        ))}
      {acc.has("bowtie") && (
        <group position={[0, 0.9, front + 0.03]}>
          <mesh geometry={geo.cone} material={m.dark} position={[-0.06, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.05, 0.1, 0.03]} />
          <mesh geometry={geo.cone} material={m.dark} position={[0.06, 0, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[0.05, 0.1, 0.03]} />
          <mesh geometry={geo.sphere} material={m.dark} scale={0.03} />
        </group>
      )}
      {acc.has("pocketsquare") && (
        <group position={[chest, 0.56, front * 0.9]} rotation={[0, 0.35, 0]}>
          <mesh geometry={geo.box} material={m.shirt} scale={[0.11, 0.03, 0.03]} />
          {[-0.028, 0.028].map((x) => (
            <mesh key={x} geometry={geo.cone} material={m.shirt} position={[x, 0.035, 0]} scale={[0.026, 0.05, 0.014]} />
          ))}
        </group>
      )}
      {acc.has("carnation") && (
        <group position={[0.15 * W, 0.76, front + 0.03]}>
          {[
            [0, 0],
            [-0.025, -0.015],
            [0.025, -0.015],
            [0, 0.022],
          ].map(([x, y]) => (
            <mesh key={`${x}${y}`} geometry={geo.sphere} material={m.carnation} position={[x, y, 0]} scale={0.03} />
          ))}
        </group>
      )}
      {acc.has("watchchain") && (
        <mesh geometry={geo.band} material={m.gold} position={[0.09, 0.24, front + 0.04]} rotation={[0, 0, Math.PI]} scale={[0.11, 0.08, 0.1]} />
      )}
    </group>
  );
}

/** Hair as it shows under a hat: the back and sides only (the crown hides the rest). */
function HatHair({ look, geo, m }: { look: Look; geo: Geo; m: Mats }) {
  const r = HEAD_R;
  if (look.hair.style === "bald") return <BaldFringe geo={geo} m={m} />;
  return <mesh geometry={geo.hemi} material={m.hair} position={[0, 0.02, -0.05]} scale={[r * 1.05, r * 1.0, r * 1.05]} />;
}

function BaldFringe({ geo, m }: { geo: Geo; m: Mats }) {
  const r = HEAD_R;
  return <mesh geometry={geo.torus} material={m.hair} position={[0, -0.02, -0.06]} rotation={[Math.PI / 2 + 0.2, 0, 0]} scale={[r * 0.98, r * 0.92, r * 0.6]} />;
}

function Hair({ look, geo, m }: { look: Look; geo: Geo; m: Mats }) {
  const r = HEAD_R;
  if (look.hat) return <HatHair look={look} geo={geo} m={m} />;
  switch (look.hair.style) {
    case "bald":
      return <BaldFringe geo={geo} m={m} />;
    case "slick":
      // combed straight back with a side part and a little lift at the front
      return (
        <group>
          <mesh geometry={geo.hemi} material={m.hair} position={[0, 0.06, -0.06]} rotation={[-0.25, 0, 0]} scale={[r * 1.05, r * 1.0, r * 1.06]} />
          <mesh geometry={geo.sphere} material={m.hair} position={[0.03, r * 0.72, r * 0.3]} scale={[r * 0.88, 0.12, 0.28]} rotation={[-0.4, 0, -0.06]} />
          <mesh geometry={geo.box} material={m.dark} position={[-0.13, r * 0.86, r * 0.18]} rotation={[-0.5, 0, 0.12]} scale={[0.012, 0.012, 0.24]} />
        </group>
      );
    case "bun":
      return (
        <group>
          <mesh geometry={geo.hemi} material={m.hair} position={[0, 0.04, -0.02]} scale={[r * 1.06, r * 1.05, r * 1.05]} />
          <mesh geometry={geo.sphere} material={m.hair} position={[0, r * 1.05, -r * 0.35]} scale={0.17} />
        </group>
      );
    case "curly":
      return (
        <group>
          {Array.from({ length: 14 }, (_, i) => {
            const a = (i / 14) * Math.PI * 2;
            const up = i % 3 === 0 ? 0.9 : 0.7;
            return <mesh key={i} geometry={geo.sphere} material={m.hair} position={[Math.cos(a) * r * 0.72, r * up, Math.sin(a) * r * 0.72 - 0.06]} scale={0.15} />;
          })}
          <mesh geometry={geo.sphere} material={m.hair} position={[0, r * 0.95, -0.05]} scale={0.2} />
        </group>
      );
    case "messy":
    default:
      return (
        <group>
          <mesh geometry={geo.hemi} material={m.hair} position={[0, 0.04, -0.03]} scale={[r * 1.07, r * 1.05, r * 1.07]} />
          {[-0.2, 0, 0.2].map((x, i) => (
            <mesh key={i} geometry={geo.sphere} material={m.hair} position={[x, r * 0.75, r * 0.5]} scale={[0.13, 0.08, 0.1]} />
          ))}
        </group>
      );
  }
}

function Hat({ hat, geo, m, ink }: { hat: NonNullable<Look["hat"]>; geo: Geo; m: Mats; ink: boolean }) {
  const r = HEAD_R;
  const tilt = hat.tilt ?? 0;
  switch (hat.style) {
    case "fedora":
      // wide snap brim, tapered crown with a centre crease, ribbon band
      return (
        <group position={[0, r * 0.55, 0.01]} rotation={[tilt, 0, 0.05]}>
          <mesh geometry={geo.cyl} material={m.hat} scale={[r * 1.6, 0.022, r * 1.5]} castShadow={ink} />
          {ink && <mesh geometry={geo.cyl} material={INK} scale={[r * 1.64, 0.036, r * 1.54]} />}
          <mesh geometry={geo.crown} material={m.hat} position={[0, 0.15, -0.01]} scale={[r * 0.98, 0.3, r * 0.92]} />
          {ink && <mesh geometry={geo.crown} material={INK} position={[0, 0.15, -0.01]} scale={[r * 1.02, 0.32, r * 0.96]} />}
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={geo.sphere} material={m.hat} position={[s * 0.09, 0.3, -0.01]} scale={[r * 0.45, 0.06, r * 0.74]} />
          ))}
          <mesh geometry={geo.cyl} material={m.band} position={[0, 0.05, -0.01]} scale={[r * 0.995, 0.075, r * 0.935]} />
        </group>
      );
    case "flatcap":
      // a soft, flat newsboy cap sloping onto a short peak
      return (
        <group position={[0, r * 0.5, 0.02]} rotation={[tilt, 0, 0]}>
          <mesh geometry={geo.hemi} material={m.hat} position={[0, 0, -0.02]} scale={[r * 1.1, r * 0.62, r * 1.16]} />
          {ink && <mesh geometry={geo.hemi} material={INK} position={[0, 0, -0.02]} scale={[r * 1.14, r * 0.66, r * 1.2]} />}
          <mesh geometry={geo.sphere} material={m.hat} position={[0, 0.12, r * 0.5]} rotation={[0.3, 0, 0]} scale={[r * 0.98, 0.09, r * 0.62]} />
          <mesh geometry={geo.sphere} material={m.band} position={[0, 0.0, r * 1.0]} rotation={[0.12, 0, 0]} scale={[r * 0.8, 0.025, r * 0.42]} />
          <mesh geometry={geo.sphere} material={m.band} position={[0, r * 0.62, -0.02]} scale={0.04} />
        </group>
      );
    case "porkpie":
      // short flat-topped crown, narrow brim
      return (
        <group position={[0, r * 0.62, 0]} rotation={[tilt, 0, -0.06]}>
          <mesh geometry={geo.cyl} material={m.hat} scale={[r * 1.34, 0.022, r * 1.28]} castShadow={ink} />
          {ink && <mesh geometry={geo.cyl} material={INK} scale={[r * 1.38, 0.036, r * 1.32]} />}
          <mesh geometry={geo.cyl} material={m.hat} position={[0, 0.1, 0]} scale={[r * 0.94, 0.2, r * 0.88]} />
          {ink && <mesh geometry={geo.cyl} material={INK} position={[0, 0.1, 0]} scale={[r * 0.98, 0.22, r * 0.92]} />}
          <mesh geometry={geo.cyl} material={m.band} position={[0, 0.04, 0]} scale={[r * 0.96, 0.07, r * 0.9]} />
        </group>
      );
  }
}

function HeadAccessories({ acc, geo, m }: { acc: Set<Accessory>; geo: Geo; m: Mats }) {
  const r = HEAD_R;
  return (
    <group>
      {acc.has("glasses") && (
        <group position={[0, 0.04, r * 0.95]}>
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={geo.torus} material={m.frame} position={[s * 0.15, 0, 0]} scale={[0.1, 0.09, 0.08]} />
          ))}
          <mesh geometry={geo.box} material={m.frame} scale={[0.1, 0.012, 0.012]} />
        </group>
      )}
      {acc.has("shades") && (
        <group position={[0, 0.05, r * 0.95]}>
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={geo.sphere} material={m.lens} position={[s * 0.15, 0, 0.01]} scale={[0.12, 0.08, 0.035]} />
          ))}
          <mesh geometry={geo.box} material={m.frame} position={[0, 0.03, 0]} scale={[0.5, 0.025, 0.02]} />
        </group>
      )}
      {acc.has("visor") && (
        <group position={[0, r * 0.5, 0]}>
          <mesh geometry={geo.cyl} material={m.frame} scale={[r * 1.04, 0.05, r * 1.04]} />
          <mesh geometry={geo.cyl} material={m.visor} position={[0, 0.0, r * 0.75]} rotation={[0.25, 0, 0]} scale={[r * 0.9, 0.02, r * 0.6]} />
        </group>
      )}
      {acc.has("stubble") && (
        <mesh geometry={geo.sphere} material={m.stubble} position={[0, -r * 0.45, r * 0.22]} scale={[r * 0.93, r * 0.62, r * 0.8]} />
      )}
      {acc.has("beard") && (
        <mesh geometry={geo.sphere} material={m.hair} position={[0, -r * 0.45, r * 0.42]} scale={[r * 0.75, r * 0.52, r * 0.55]} />
      )}
      {acc.has("mustache") && (
        <group position={[0, -0.115, r * 0.95]}>
          <mesh geometry={geo.capsule} material={m.hair} position={[-0.06, 0, 0]} rotation={[0, 0, Math.PI / 2 + 0.3]} scale={[0.028, 0.045, 0.03]} />
          <mesh geometry={geo.capsule} material={m.hair} position={[0.06, 0, 0]} rotation={[0, 0, Math.PI / 2 - 0.3]} scale={[0.028, 0.045, 0.03]} />
        </group>
      )}
      {acc.has("scar") && (
        // an old cut across the cheek, with two stitch marks
        <group position={[0.2, 0.0, r * 0.89]} rotation={[0, 0.5, 0.55]}>
          <mesh geometry={geo.box} material={m.scar} scale={[0.014, 0.14, 0.01]} />
          {[-0.03, 0.03].map((y) => (
            <mesh key={y} geometry={geo.box} material={m.scar} position={[0, y, 0]} scale={[0.04, 0.008, 0.01]} />
          ))}
        </group>
      )}
      {acc.has("cigar") && (
        // clamped in the corner of the mouth, angled out and a little down, lit end glowing
        <group position={[-0.09, -0.165, r * 0.9]} rotation={[0.22, -0.4, 0]}>
          <mesh geometry={geo.capsule} material={m.cigar} position={[0, 0, 0.08]} rotation={[Math.PI / 2, 0, 0]} scale={[0.026, 0.075, 0.026]} />
          <mesh geometry={geo.cyl} material={m.gold} position={[0, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]} scale={[0.029, 0.018, 0.029]} />
          <mesh geometry={geo.cyl} material={m.ash} position={[0, 0, 0.148]} rotation={[Math.PI / 2, 0, 0]} scale={[0.026, 0.014, 0.026]} />
          <mesh geometry={geo.sphere} material={m.ember} position={[0, 0, 0.157]} scale={[0.022, 0.022, 0.01]} />
        </group>
      )}
      {acc.has("toothpick") && (
        <group position={[0.08, -0.17, r * 0.9]} rotation={[0.1, 0.45, 0]}>
          <mesh geometry={geo.cyl} material={m.wood} position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]} scale={[0.006, 0.13, 0.006]} />
        </group>
      )}
      {acc.has("earring") && <mesh geometry={geo.torus} material={m.gold} position={[r * 0.98, -0.12, 0.02]} rotation={[0, Math.PI / 2, 0]} scale={0.035} />}
    </group>
  );
}

/* ------------------------------------------------------------------ helpers */

/** Rotation that turns a figure at `pos` to face `target` on the floor plane. */
export function faceToward(pos: THREE.Vector3, target: THREE.Vector3): number {
  return Math.atan2(target.x - pos.x, target.z - pos.z);
}

/** Blend two faces (for layering a mood over a temperament). */
export function mixFace(a: Face, b: Face, t: number): Face {
  return { smile: a.smile + (b.smile - a.smile) * t, open: a.open + (b.open - a.open) * t, brow: a.brow + (b.brow - a.brow) * t, lid: a.lid + (b.lid - a.lid) * t };
}
