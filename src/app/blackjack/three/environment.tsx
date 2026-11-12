"use client";

import { Environment as EnvMap, Lightformer } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { memo, useRef } from "react";
import * as THREE from "three";
import { Embers } from "./env-embers";
import { heatColor, LAMP } from "./env-glsl";
import { BeamHaze, LightBeam, PendantLamp } from "./env-lamp";
import { useMood, type MoodRef } from "./env-mood";
import { FlameJet } from "./flame-jet";

const BG = "#0a0705";

const KEY_COLD = new THREE.Color("#c4cee0");
const KEY_NEUTRAL = new THREE.Color("#ffe2c4");
const KEY_HOT = new THREE.Color("#ffd0a0");
const RIM_COLD = new THREE.Color("#8a5a48");
const RIM_NEUTRAL = new THREE.Color("#ff5a1f");
const RIM_HOT = new THREE.Color("#ff4810");
const BACK_COLD = new THREE.Color("#a8a4a6");
const BACK_NEUTRAL = new THREE.Color("#ffb070");
const BACK_HOT = new THREE.Color("#ff9a4a");
const AMB_COLD = new THREE.Color("#b9c2d4");
const AMB_NEUTRAL = new THREE.Color("#ffd8b8");
const AMB_HOT = new THREE.Color("#ffc9a0");

const KEY_INTENSITY = 32;
const ENV_INTENSITY = 0.5;

/**
 * Background, fog, the pendant lamp and its light, reflections, embers/ash and the one-shot
 * moments (win flash, loss chill, blackjack flame jet). Reads useSceneFx() via useMood().
 */
export function Environment() {
  const mood = useMood();
  const narrow = useThree((s) => s.size.width / s.size.height < 1.15);
  const lampY = narrow ? LAMP.yNarrow : LAMP.y;

  return (
    <>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 10, 22]} />
      <ReflectionRig />
      <MoodLights mood={mood} lampY={lampY} />
      <PendantLamp y={lampY} />
      <LightBeam y={lampY} mood={mood} />
      <BeamHaze y={lampY} mood={mood} />
      <Embers mood={mood} />
      <WinFlash mood={mood} />
      <FlameJet mood={mood} />
    </>
  );
}

/**
 * Low-res environment map baked once from lightformers (no network HDR): warm lamp overhead,
 * ember rims at the sides, a warm glow behind the dealer and a faint cool fill from the room.
 * Memoised so its children never change and the cube camera only renders once.
 */
const ReflectionRig = memo(function ReflectionRig() {
  return (
    <EnvMap resolution={256} background={false} frames={1} environmentIntensity={ENV_INTENSITY}>
      <color attach="background" args={["#050302"]} />
      {/* the lamp: a hot disc straight above with a softer halo */}
      <Lightformer form="circle" intensity={6} color="#ffd9a8" position={[0, 6, 0]} scale={2.2} />
      <Lightformer form="ring" intensity={1.5} color="#ffb070" position={[0, 5.5, 0]} scale={4.5} />
      {/* ember rim lights */}
      <Lightformer form="rect" intensity={3} color="#ff5a1f" position={[-7, 1.2, 0.5]} scale={[10, 1.6, 1]} />
      <Lightformer form="rect" intensity={3} color="#ff5a1f" position={[7, 1.2, 0.5]} scale={[10, 1.6, 1]} />
      {/* warm back glow behind the dealer */}
      <Lightformer form="rect" intensity={1.4} color="#ff9a2e" position={[0, 1.8, -8]} scale={[12, 2, 1]} />
      {/* faint cool room fill from behind the player */}
      <Lightformer form="rect" intensity={0.35} color="#7a8aa8" position={[0, 3, 9]} scale={[12, 4, 1]} />
    </EnvMap>
  );
});

/** All scene lights; colour and strength follow the damped heat and the loss chill. */
function MoodLights({ mood, lampY }: { mood: MoodRef; lampY: number }) {
  const key = useRef<THREE.SpotLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const rimL = useRef<THREE.PointLight>(null);
  const rimR = useRef<THREE.PointLight>(null);
  const back = useRef<THREE.PointLight>(null);
  const coldFill = useRef<THREE.HemisphereLight>(null);
  const lampGlow = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    const m = mood.current;
    const { heat, hot, cold, lose } = m;
    const chill = 1 - 0.32 * lose;
    const t = m.time;
    // gentle filament breathing; stronger, livelier flicker when the table is on fire
    const flicker = m.reduced ? 1 : 1 + (0.012 + 0.03 * hot) * Math.sin(t * 13.1) * Math.sin(t * 7.7 + 1.3);

    if (key.current) {
      heatColor(key.current.color, heat, KEY_COLD, KEY_NEUTRAL, KEY_HOT);
      key.current.intensity = KEY_INTENSITY * (1 + 0.08 * hot - 0.25 * cold) * chill * flicker;
    }
    if (ambient.current) {
      heatColor(ambient.current.color, heat, AMB_COLD, AMB_NEUTRAL, AMB_HOT);
      ambient.current.intensity = 0.3 * (1 - 0.2 * cold) * chill;
    }
    const rimI = 5 * (1 + 0.9 * hot - 0.6 * cold) * (1 - 0.5 * lose);
    const rimFlicker = m.reduced ? 0 : 0.08 * hot;
    if (rimL.current) {
      heatColor(rimL.current.color, heat, RIM_COLD, RIM_NEUTRAL, RIM_HOT);
      rimL.current.intensity = rimI * (1 + rimFlicker * Math.sin(t * 9));
    }
    if (rimR.current) {
      rimR.current.color.copy(rimL.current ? rimL.current.color : RIM_NEUTRAL);
      rimR.current.intensity = rimI * (1 + rimFlicker * Math.sin(t * 9 + 2.1));
    }
    if (back.current) {
      heatColor(back.current.color, heat, BACK_COLD, BACK_NEUTRAL, BACK_HOT);
      back.current.intensity = 6 * (1 + 0.3 * hot - 0.35 * cold) * chill;
    }
    if (coldFill.current) coldFill.current.intensity = 0.55 * cold + 0.35 * lose;
    if (lampGlow.current) lampGlow.current.intensity = 1.2 * chill * flicker * (1 - 0.3 * cold);
    state.scene.environmentIntensity = ENV_INTENSITY * (1 + 0.15 * hot - 0.3 * cold) * chill;
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.3} color="#ffd8b8" />
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
      <pointLight ref={rimL} position={[-4.2, 0.7, 1.4]} color="#ff5a1f" intensity={5} distance={6} />
      <pointLight ref={rimR} position={[4.2, 0.7, 1.4]} color="#ff5a1f" intensity={5} distance={6} />
      <pointLight ref={back} position={[0, 2.5, -3.4]} color="#ffb070" intensity={6} distance={8} />
      <hemisphereLight ref={coldFill} args={["#8fa3c4", "#1a1612", 0]} />
    </>
  );
}

/** Warm burst of light on every win (driven by mood.win, which resets to 1 on winKey). */
function WinFlash({ mood }: { mood: MoodRef }) {
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    if (light.current) light.current.intensity = 40 * mood.current.win;
  });
  return <pointLight ref={light} position={[0, 1.6, 0.6]} color="#ffaa44" intensity={0} distance={9} />;
}
