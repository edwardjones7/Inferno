"use client";

import { Environment as EnvMap, Lightformer } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import { Ashtray, CIGAR_TIP } from "./ashtray";
import { Dust, SmokeWisps, type Wisp } from "./env-air";
import { heatColor, LAMP } from "./env-glsl";
import { BeamHaze, LightBeam, PendantLamp } from "./env-lamp";
import { useMood, type MoodRef } from "./env-mood";
import { BackRoom, type RoomLayout } from "./env-room";
import { useSceneFx } from "./fx-context";
import { MatchFlare } from "./match-flare";
import { HAND_Z } from "./table-layout";

const BG = "#070504";

const KEY_COLD = new THREE.Color("#c4cee0");
const KEY_NEUTRAL = new THREE.Color("#ffe2c4");
const KEY_HOT = new THREE.Color("#ffd0a0");
const BACK_COLD = new THREE.Color("#8a7a76");
const BACK_NEUTRAL = new THREE.Color("#ff8a3a");
const BACK_HOT = new THREE.Color("#ff7a28");
const AMB_COLD = new THREE.Color("#b9c2d4");
const AMB_NEUTRAL = new THREE.Color("#ffd8b8");
const AMB_HOT = new THREE.Color("#ffc9a0");

const KEY_INTENSITY = 32;
const ENV_INTENSITY = 0.45;

export type RoomKind = "blackjack" | "poker";

interface RoomSetup {
  layout: RoomLayout;
  ashtray: { at: [number, number, number]; rot: number };
  /** where the blackjack sparks fly from (blackjack only) */
  flare?: [number, number, number];
  /** smoke drifting through the lamp light, besides the cigar's own plume */
  wisps: Wisp[];
}

const ROOMS: Record<RoomKind, RoomSetup> = {
  blackjack: {
    layout: { back: -6.4, side: 8.5 },
    // left of the dealer, mirroring the shoe on the right
    ashtray: { at: [-3.05, 0, -1.95], rot: 0.5 },
    flare: [0, 0.05, HAND_Z],
    wisps: [
      { at: [-1.0, 0.55, -1.9], h: 2.0, w: 1.5, lean: [0.18, 0.12], fadeIn: 0.25 },
      { at: [1.15, 0.45, -1.2], h: 2.2, w: 1.5, lean: [-0.16, 0.05], fadeIn: 0.3 },
    ],
  },
  poker: {
    layout: { back: -7.4, side: 9.5 },
    ashtray: { at: [1.5, 0, -1.75], rot: -0.6 },
    wisps: [
      { at: [-1.2, 0.55, -1.2], h: 2.0, w: 1.5, lean: [0.2, 0.1], fadeIn: 0.25 },
      { at: [0.9, 0.5, 0.4], h: 1.9, w: 1.4, lean: [-0.12, -0.15], fadeIn: 0.35 },
    ],
  },
};

/** The cigar's plume: starts at its tip and leans in toward the lamp. */
function cigarWisp({ at, rot }: RoomSetup["ashtray"]): Wisp {
  const [tx, ty, tz] = CIGAR_TIP;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const x = at[0] + tx * c + tz * s;
  const z = at[2] - tx * s + tz * c;
  const d = Math.hypot(LAMP.x - x, LAMP.z - z) || 1;
  return { at: [x, at[1] + ty, z], h: 2.6, w: 1.2, lean: [((LAMP.x - x) / d) * 0.32, ((LAMP.z - z) / d) * 0.32], fadeIn: 0, base: 0.35 };
}

/**
 * The speakeasy back room: background, fog, the room itself, the pendant lamp and its
 * light, reflections, dust and smoke in the lamp light, a smouldering cigar, and the
 * one-shot moments (lamp flare on a win, sparks on a blackjack). Reads useSceneFx() via
 * useMood(). The low tier skips the haze and smoke and keeps far fewer dust motes.
 */
export function Environment({ room = "blackjack" }: { room?: RoomKind }) {
  const mood = useMood();
  const { quality } = useSceneFx();
  const narrow = useThree((s) => s.size.width / s.size.height < 1.15);
  const lampY = narrow ? LAMP.yNarrow : LAMP.y;
  const setup = ROOMS[room];
  const high = quality === "high";
  const wisps = useMemo(() => [cigarWisp(setup.ashtray), ...setup.wisps], [setup]);

  return (
    <>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 9, 24]} />
      <ReflectionRig />
      <MoodLights mood={mood} lampY={lampY} />
      <BackRoom layout={setup.layout} mood={mood} quality={quality} />
      <PendantLamp y={lampY} mood={mood} />
      <LightBeam y={lampY} mood={mood} />
      {high && <BeamHaze y={lampY} mood={mood} />}
      {high && <SmokeWisps wisps={wisps} mood={mood} lampY={lampY} />}
      <Dust mood={mood} lampY={lampY} count={high ? 360 : 80} />
      <Ashtray position={setup.ashtray.at} rotation={setup.ashtray.rot} mood={mood} light={high} />
      {setup.flare && <MatchFlare mood={mood} at={setup.flare} quality={quality} />}
    </>
  );
}

/**
 * Low-res environment map baked once from lightformers (no network HDR): the lamp
 * overhead, a warm glow from the bar behind the dealer, dim wood-and-brick sides and a
 * cool hint of the window. Memoised so the cube camera only renders once.
 */
const ReflectionRig = memo(function ReflectionRig() {
  return (
    <EnvMap resolution={256} background={false} frames={1} environmentIntensity={ENV_INTENSITY}>
      <color attach="background" args={["#040302"]} />
      <Lightformer form="circle" intensity={6} color="#ffd9a8" position={[0, 6, 0]} scale={2.2} />
      <Lightformer form="ring" intensity={1.2} color="#ffb070" position={[0, 5.5, 0]} scale={4.5} />
      {/* dim walls either side */}
      <Lightformer form="rect" intensity={0.6} color="#8a4a22" position={[-7, 1.4, 0]} scale={[10, 2, 1]} />
      <Lightformer form="rect" intensity={0.6} color="#8a4a22" position={[7, 1.4, 0]} scale={[10, 2, 1]} />
      {/* the bar sconce behind the dealer */}
      <Lightformer form="rect" intensity={1.2} color="#ff9a4a" position={[3, 2, -8]} scale={[5, 2, 1]} />
      {/* the window, cool */}
      <Lightformer form="rect" intensity={0.5} color="#8094b4" position={[-4, 2, -8]} scale={[2, 3, 1]} />
      <Lightformer form="rect" intensity={0.25} color="#7a8aa8" position={[0, 3, 9]} scale={[12, 4, 1]} />
    </EnvMap>
  );
});

/**
 * All scene lights; colour and strength follow the damped heat and the loss chill. The
 * lamp flares on a win and harder on a blackjack. Nothing sits near the side seats, so
 * the players beside you are lit by the lamp like everyone else.
 */
function MoodLights({ mood, lampY }: { mood: MoodRef; lampY: number }) {
  const key = useRef<THREE.SpotLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const back = useRef<THREE.PointLight>(null);
  const coldFill = useRef<THREE.HemisphereLight>(null);
  const lampGlow = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    const m = mood.current;
    const { heat, hot, cold, lose } = m;
    const chill = 1 - 0.32 * lose;
    const t = m.time;
    // gentle filament breathing; a little livelier when the table is hot
    const flicker = m.reduced ? 1 : 1 + (0.012 + 0.025 * hot) * Math.sin(t * 13.1) * Math.sin(t * 7.7 + 1.3);
    const bj = m.bjAge < 2 ? Math.min(1, m.bjAge / 0.05) * Math.exp(-m.bjAge * 2.2) : 0;
    const flare = 1 + 0.45 * m.win + 1.1 * bj;

    if (key.current) {
      heatColor(key.current.color, heat, KEY_COLD, KEY_NEUTRAL, KEY_HOT);
      key.current.intensity = KEY_INTENSITY * (1 + 0.08 * hot - 0.25 * cold) * chill * flicker * flare;
    }
    if (ambient.current) {
      heatColor(ambient.current.color, heat, AMB_COLD, AMB_NEUTRAL, AMB_HOT);
      ambient.current.intensity = 0.26 * (1 - 0.2 * cold) * chill;
    }
    if (back.current) {
      heatColor(back.current.color, heat, BACK_COLD, BACK_NEUTRAL, BACK_HOT);
      back.current.intensity = 4.5 * (1 + 0.3 * hot - 0.35 * cold) * chill;
    }
    if (coldFill.current) coldFill.current.intensity = 0.5 * cold + 0.35 * lose;
    if (lampGlow.current) lampGlow.current.intensity = 1.2 * chill * flicker * (1 - 0.3 * cold) * flare;
    state.scene.environmentIntensity = ENV_INTENSITY * (1 + 0.15 * hot - 0.3 * cold) * chill;
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.26} color="#ffd8b8" />
      {/* key light: sits on the lamp's axis, high enough for clean card/chip shadows */}
      <spotLight
        ref={key}
        position={[LAMP.x, 5.6, LAMP.z - 0.15]}
        angle={0.85}
        penumbra={0.85}
        intensity={KEY_INTENSITY}
        decay={1.6}
        color="#ffe2c4"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
      />
      {/* soft local glow under the shade (warms the brass rim and the felt centre) */}
      <pointLight ref={lampGlow} position={[LAMP.x, lampY - 0.15, LAMP.z]} color="#ffb46a" intensity={1.2} distance={3} decay={2} />
      {/* ember rim from behind the dealer / far seats */}
      <pointLight ref={back} position={[0, 2.5, -3.6]} color="#ff8a3a" intensity={4.5} distance={8} />
      <hemisphereLight ref={coldFill} args={["#8fa3c4", "#1a1612", 0]} />
    </>
  );
}
