"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import { cardBack, cardFace } from "@/app/blackjack/three/card-textures";
import { chipSide, chipTop } from "@/app/blackjack/three/chip-textures";
import type { Card } from "@/lib/blackjack/cards";

/* Live lobby hero: two cards turning in mid-air with a smouldering corner,
   chips drifting round them, embers rising, bloom on everything hot.
   The camera is fixed on purpose (no pointer sway). */

const CARD_W = 1.28;
const CARD_H = 1.8;
const CARD_T = 0.012;

/* ------------------------------------------------------------ shared GLSL */

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

/* ------------------------------------------------------------ geometry */

function cardShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Rounded-rect face with UVs spanning 0..1 across the card. */
function faceGeometry() {
  const g = new THREE.ShapeGeometry(cardShape(CARD_W, CARD_H, 0.09), 6);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / CARD_W + 0.5, pos.getY(i) / CARD_H + 0.5);
  }
  return g;
}

/* ------------------------------------------------------------ the burn */

const BURN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BURN_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uMirror;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 uv = vUv;
    if (uMirror > 0.5) uv.x = 1.0 - uv.x;
    // 1.0 at the bottom-right corner: that edge is the one smouldering
    float s = uv.x * 0.5 + (1.0 - uv.y) * 0.5;
    float n = fbm(uv * vec2(5.0, 7.0) + vec2(uSeed, uTime * 0.04));
    float front = 0.79 + (n - 0.5) * 0.18 + sin(uTime * 0.35 + uSeed) * 0.012;
    float d = s - front;

    float charA = smoothstep(-0.07, 0.015, d);
    vec3 charCol = mix(vec3(0.20, 0.09, 0.04), vec3(0.025, 0.012, 0.008), smoothstep(-0.02, 0.1, d));
    float flick = 0.7 + 0.3 * noise(vec2(uTime * 2.6, uSeed * 3.1));
    float line = exp(-pow(d / 0.011, 2.0));
    float specks = smoothstep(0.6, 0.85, fbm(uv * 22.0 + vec2(0.0, uTime * 0.12))) * step(0.01, d);
    vec3 hot = mix(vec3(1.0, 0.22, 0.04), vec3(1.0, 0.72, 0.28), line);
    float heat = clamp(line + specks * 0.7, 0.0, 1.0);
    vec3 col = mix(charCol, hot * 5.0 * flick, heat);
    gl_FragColor = vec4(col, max(charA * 0.94, line));
  }
`;

function Burn({ seed, mirror, z }: { seed: number; mirror: boolean; z: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uSeed: { value: seed }, uMirror: { value: mirror ? 1 : 0 } }), [seed, mirror]);
  useFrame((state) => {
    if (mat.current) mat.current.uniforms.uTime.value = state.clock.elapsedTime;
  });
  const geo = useMemo(() => faceGeometry(), []);
  return (
    <mesh geometry={geo} position-z={z} rotation-y={mirror ? Math.PI : 0} renderOrder={2}>
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={BURN_VERT}
        fragmentShader={BURN_FRAG}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------ cards */

function FloatingCard({
  card,
  position,
  tilt,
  phase,
  seed,
}: {
  card: Card;
  position: [number, number, number];
  tilt: number;
  phase: number;
  seed: number;
}) {
  const spin = useRef<THREE.Group>(null);
  const glow = useRef<THREE.PointLight>(null);
  const face = useMemo(() => faceGeometry(), []);
  const body = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(cardShape(CARD_W, CARD_H, 0.09), { depth: CARD_T, bevelEnabled: false, curveSegments: 6 });
    g.translate(0, 0, -CARD_T / 2);
    return g;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (spin.current) {
      spin.current.rotation.y = Math.sin(t * 0.32 + phase) * 1.05 + Math.sin(t * 0.11 + phase * 2) * 0.35;
      spin.current.rotation.x = Math.sin(t * 0.27 + phase) * 0.09;
      spin.current.position.y = Math.sin(t * 0.6 + phase) * 0.07;
    }
    if (glow.current) glow.current.intensity = 1.4 + Math.sin(t * 7.1 + seed) * 0.25 + Math.sin(t * 13.3 + seed * 2) * 0.2;
  });

  return (
    <group position={position} rotation-z={tilt}>
      <group ref={spin}>
        <mesh geometry={body}>
          <meshStandardMaterial color="#e3cdb5" roughness={0.7} />
        </mesh>
        <mesh geometry={face} position-z={CARD_T / 2 + 0.0008}>
          <meshStandardMaterial map={cardFace(card)} roughness={0.42} metalness={0.02} />
        </mesh>
        <mesh geometry={face} position-z={-CARD_T / 2 - 0.0008} rotation-y={Math.PI}>
          <meshStandardMaterial map={cardBack()} roughness={0.5} metalness={0.05} />
        </mesh>
        <Burn seed={seed} mirror={false} z={CARD_T / 2 + 0.002} />
        <Burn seed={seed} mirror z={-CARD_T / 2 - 0.002} />
        <pointLight ref={glow} position={[CARD_W * 0.42, -CARD_H * 0.42, 0.25]} color="#ff6a1f" distance={2.2} decay={2} />
      </group>
    </group>
  );
}

/* ------------------------------------------------------------ chips */

const CHIPS = [
  { value: 1000, phase: 0 },
  { value: 500, phase: 2.1 },
  { value: 100, phase: 4.2 },
];

function OrbitingChip({ value, phase }: { value: number; phase: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const materials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ map: chipSide(value), roughness: 0.45 }),
      new THREE.MeshStandardMaterial({ map: chipTop(value), roughness: 0.35 }),
      new THREE.MeshStandardMaterial({ map: chipTop(value), roughness: 0.35 }),
    ],
    [value],
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const a = state.clock.elapsedTime * 0.22 + phase;
    m.position.set(Math.cos(a) * 1.5, -0.55 + Math.sin(a) * 0.32 + Math.sin(a * 2.3) * 0.06, Math.sin(a) * 0.95);
    m.rotation.set(1.15 + Math.sin(a * 1.7) * 0.25, a * 1.4, 0.3 + Math.cos(a) * 0.2);
  });

  return (
    <mesh ref={ref} material={materials}>
      <cylinderGeometry args={[0.27, 0.27, 0.065, 48]} />
    </mesh>
  );
}

/* ------------------------------------------------------------ embers */

const EMBER_COUNT = 140;
const EMBER_RISE = 4.4;

const EMBER_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  attribute float aSeed;
  attribute float aSpeed;
  attribute float aSize;
  varying float vLife;
  varying float vSeed;
  void main() {
    vec3 p = position;
    float y = mod(p.y + uTime * aSpeed, ${EMBER_RISE.toFixed(1)});
    vLife = y / ${EMBER_RISE.toFixed(1)};
    vSeed = aSeed;
    p.y = y - ${(EMBER_RISE / 2).toFixed(1)};
    p.x += sin(uTime * 0.9 + aSeed * 6.283) * 0.18 * vLife;
    p.z += cos(uTime * 0.7 + aSeed * 4.0) * 0.12 * vLife;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const EMBER_FRAG = /* glsl */ `
  uniform float uTime;
  varying float vLife;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.0, d);
    float fade = sin(vLife * 3.14159) * (0.75 + 0.25 * sin(uTime * 9.0 + vSeed * 40.0));
    vec3 col = mix(vec3(1.0, 0.28, 0.05), vec3(1.0, 0.8, 0.45), core * core) * 3.2;
    gl_FragColor = vec4(col * core * fade, core * fade);
  }
`;

/** Deterministic hash noise so the ember layout is stable and render stays pure. */
const rand = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function Embers() {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(EMBER_COUNT * 3);
    const seed = new Float32Array(EMBER_COUNT);
    const speed = new Float32Array(EMBER_COUNT);
    const size = new Float32Array(EMBER_COUNT);
    for (let i = 0; i < EMBER_COUNT; i++) {
      pos[i * 3] = (rand(i, 1) - 0.5) * 4.4;
      pos[i * 3 + 1] = rand(i, 2) * EMBER_RISE;
      pos[i * 3 + 2] = (rand(i, 3) - 0.5) * 2.4;
      seed[i] = rand(i, 4);
      speed[i] = 0.18 + rand(i, 5) * 0.32;
      size[i] = 0.025 + rand(i, 6) * rand(i, 7) * 0.06;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    return g;
  }, []);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uScale: { value: 400 } }), []);

  useFrame((state) => {
    const m = mat.current;
    if (!m) return;
    m.uniforms.uTime.value = state.clock.elapsedTime;
    const cam = state.camera as THREE.PerspectiveCamera;
    m.uniforms.uScale.value = (state.size.height * state.viewport.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
  });

  return (
    <points geometry={geo}>
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={EMBER_VERT}
        fragmentShader={EMBER_FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ------------------------------------------------------------ scene */

function FirstFrame({ onReady }: { onReady: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    onReady();
  });
  return null;
}

function Scene({ onReady }: { onReady: () => void }) {
  return (
    <>
      <color attach="background" args={["#0a0705"]} />
      <ambientLight intensity={0.22} color="#ffd9b8" />
      {/* warm key from the front, ember rim lights from behind */}
      <directionalLight position={[2.5, 3.5, 5]} intensity={1.5} color="#ffe0bd" />
      <directionalLight position={[-3.5, 2, -4]} intensity={5} color="#ff5a1f" />
      <directionalLight position={[3.5, -1, -3.5]} intensity={3} color="#ff9a2e" />
      <pointLight position={[0, -1.8, 0.8]} intensity={7} distance={6} decay={2} color="#ff4a12" />

      <FloatingCard card="AH" position={[-0.5, 0.12, 0]} tilt={0.2} phase={0} seed={1.3} />
      <FloatingCard card="KS" position={[0.55, 0.3, -0.45]} tilt={-0.12} phase={1.9} seed={4.7} />
      {CHIPS.map((c) => (
        <OrbitingChip key={c.value} {...c} />
      ))}
      <Embers />
      <FirstFrame onReady={onReady} />

      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur intensity={1.1} luminanceThreshold={1} luminanceSmoothing={0.3} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  );
}

/* ------------------------------------------------------------ visibility */

function onVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}
const pageVisible = () => document.visibilityState === "visible";

export default function LobbyHeroScene({ onReady }: { onReady: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const tabVisible = useSyncExternalStore(onVisibility, pageVisible, () => true);

  useEffect(() => {
    let live = true;
    document.fonts.ready.then(() => live && setFontsReady(true));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { rootMargin: "80px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={wrap}
      className="h-full w-full"
      style={{
        maskImage: "radial-gradient(closest-side, #000 62%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(closest-side, #000 62%, transparent 100%)",
      }}
    >
      {fontsReady && (
        <Canvas
          frameloop={onScreen && tabVisible ? "always" : "never"}
          dpr={[1, 1.5]}
          camera={{ position: [0, 0.05, 6.4], fov: 32, near: 0.1, far: 30 }}
          gl={{ antialias: false, powerPreference: "low-power" }}
        >
          <Scene onReady={onReady} />
        </Canvas>
      )}
    </div>
  );
}
