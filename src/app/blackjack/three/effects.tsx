"use client";

import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { useFrame, useThree } from "@react-three/fiber";
import { BlendFunction, ChromaticAberrationEffect, ToneMappingMode, type BloomEffect, type VignetteEffect } from "postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { stepSpring, type Spring } from "./camera-spring";
import { useSceneFx } from "./fx-context";
import { DEALER_Z } from "./table-layout";
import { CinematicDof, GradeEffect, SanitizeEffect } from "./post-effects";

const BLOOM_BASE = 0.85;
const VIGNETTE_BASE = 0.7;
const VIGNETTE_DRAMA = 0.88;
/** focus a touch toward the hole card and just above the felt */
const FOCUS = new THREE.Vector3(0.12, 0.03, DEALER_Z);
const FOCUS_RANGE = 1.5;
const MAX_BOKEH = 2.4;

/** Luminance-normalised tints so heat shifts hue without changing brightness. */
const LUMA = new THREE.Vector3(0.2126, 0.7152, 0.0722);
const norm = (v: THREE.Vector3) => v.divideScalar(v.dot(LUMA));
const TINT_HOT = norm(new THREE.Vector3(1.07, 1.0, 0.88));
const TINT_COLD = norm(new THREE.Vector3(0.9, 0.97, 1.1));
const TINT_NEUTRAL = new THREE.Vector3(1, 1, 1);
const tint = new THREE.Vector3();

/** Fast attack (~60ms), exponential decay to ~3% by 0.8s. 0 before/without an event. */
function envelope(since: number) {
  if (since < 0 || since > 1.2) return 0;
  if (since < 0.06) return since / 0.06;
  return Math.exp(-(since - 0.06) * 4.6);
}

interface Punches {
  win: number;
  blackjack: number;
  lose: number;
  winAt: number;
  blackjackAt: number;
  loseAt: number;
}

/**
 * Post-processing stack. Must stay the last child of the scene.
 * DoF (drama only) -> Bloom -> chromatic aberration (blackjack pulse) -> heat grade ->
 * Vignette -> ACES tone mapping. Animated parameters are driven imperatively in useFrame.
 */
export function Effects() {
  const fx = useSceneFx();
  const camera = useThree((s) => s.camera);

  const dof = useMemo(() => new CinematicDof(camera, FOCUS, FOCUS_RANGE), [camera]);
  const grade = useMemo(() => new GradeEffect(), []);
  const sanitize = useMemo(() => new SanitizeEffect(), []);
  useEffect(() => () => sanitize.dispose(), [sanitize]);
  const chroma = useMemo(
    () =>
      new ChromaticAberrationEffect({
        blendFunction: BlendFunction.NORMAL,
        offset: new THREE.Vector2(0, 0),
        radialModulation: true,
        modulationOffset: 0.2,
      }),
    [],
  );
  useEffect(() => () => dof.dispose(), [dof]);
  useEffect(() => () => grade.dispose(), [grade]);
  useEffect(() => () => chroma.dispose(), [chroma]);

  const dofRef = useRef<CinematicDof>(null);
  const gradeRef = useRef<GradeEffect>(null);
  const chromaRef = useRef<ChromaticAberrationEffect>(null);
  const bloomRef = useRef<BloomEffect>(null);
  const vignetteRef = useRef<VignetteEffect>(null);

  const heat = useRef(fx.heat);
  const drama = useRef<Spring>({ x: 0, v: 0 });
  const keys = useRef({ win: fx.winKey, blackjack: fx.blackjackKey, lose: fx.loseKey });
  const punch = useRef<Punches>({ win: 0, blackjack: 0, lose: 0, winAt: -1, blackjackAt: -1, loseAt: -1 });

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const now = state.clock.elapsedTime;

    // --- event punches
    const k = keys.current;
    const p = punch.current;
    if (fx.winKey !== k.win) {
      k.win = fx.winKey;
      p.winAt = now;
    }
    if (fx.blackjackKey !== k.blackjack) {
      k.blackjack = fx.blackjackKey;
      p.blackjackAt = now;
    }
    if (fx.loseKey !== k.lose) {
      k.lose = fx.loseKey;
      p.loseAt = now;
    }
    const calm = fx.reducedMotion ? 0.5 : 1;
    const win = p.winAt < 0 ? 0 : envelope(now - p.winAt) * calm;
    const bj = p.blackjackAt < 0 ? 0 : envelope(now - p.blackjackAt) * calm;
    const lose = p.loseAt < 0 ? 0 : envelope(now - p.loseAt);

    // --- heat (smoothed; ~1s to settle)
    heat.current = THREE.MathUtils.damp(heat.current, THREE.MathUtils.clamp(fx.heat, -1, 1), 2.5, dt);
    const h = heat.current;
    const hot = Math.max(h, 0);
    const cold = Math.max(-h, 0);

    // --- drama ramps (critically damped, ~0.8s)
    const dr = stepSpring(drama.current, fx.drama ? 1 : 0, 8, dt);

    dofRef.current?.setAmount(dr, MAX_BOKEH);

    const bloom = bloomRef.current;
    if (bloom) bloom.intensity = BLOOM_BASE + 0.1 * hot - 0.12 * cold + 0.35 * win + 1.1 * bj;

    const ca = chromaRef.current;
    if (ca) {
      const o = fx.reducedMotion ? 0 : 0.0045 * bj;
      ca.offset.set(o, o * 0.6);
    }

    const g = gradeRef.current;
    if (g) {
      if (h >= 0) tint.lerpVectors(TINT_NEUTRAL, TINT_HOT, hot);
      else tint.lerpVectors(TINT_NEUTRAL, TINT_COLD, cold);
      const saturation = (1 + 0.14 * hot - 0.32 * cold) * (1 - 0.6 * lose);
      const contrast = 1 + 0.07 * hot - 0.08 * cold + 0.03 * dr;
      const exposure = 1 - 0.08 * lose + 0.05 * bj;
      g.setGrade(tint, saturation, contrast, exposure);
    }

    const vig = vignetteRef.current;
    if (vig) vig.darkness = VIGNETTE_BASE + (VIGNETTE_DRAMA - VIGNETTE_BASE) * dr + 0.06 * cold;
  });

  return (
    <EffectComposer multisampling={4}>
      <primitive object={sanitize} dispose={null} />
      <primitive ref={dofRef} object={dof} dispose={null} />
      <Bloom ref={bloomRef} mipmapBlur intensity={BLOOM_BASE} luminanceThreshold={1.05} luminanceSmoothing={0.25} />
      <primitive ref={chromaRef} object={chroma} dispose={null} />
      <primitive ref={gradeRef} object={grade} dispose={null} />
      <Vignette ref={vignetteRef} offset={0.25} darkness={VIGNETTE_BASE} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
