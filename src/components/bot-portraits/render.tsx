"use client";

/**
 * Renders bot portraits: one offscreen WebGL renderer draws each bot's 3D figure (the same
 * `Figure` and look data the tables use) head and shoulders, under a lamp, and hands back an
 * image URL. Loaded on demand by `portraits.ts`, so pages that only show avatars don't pull
 * three.js into their first bundle.
 *
 * The figure is posed at its resting face with motion turned off (no blink, breath or idle
 * drift), body turned a little away, head toward the lens: a booking photo, not an action shot.
 */
import { _roots, advance, createRoot, extend, type ReconcilerRoot } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import * as THREE from "three";
import { Figure } from "@/game/characters/figure";
import type { Look } from "@/game/characters/looks";
import { DEFAULT_FX, SceneFxContext, type SceneFx } from "@/game/three/fx-context";

// <Canvas> registers the THREE namespace itself; a bare root has to
extend(THREE as unknown as Parameters<typeof extend>[0]);

/** Output size in pixels (4:5). Large enough for the 2× detail portrait. */
export const PORTRAIT_W = 320;
export const PORTRAIT_H = 400;

const CAMERA = new THREE.Vector3(0.05, 1.36, 4.6);
const AIM = new THREE.Vector3(0, 1.24, 0);
/** the figure turns its body away; the head follows the camera most of the way back */
const BODY_YAW = -0.5;
const FX: SceneFx = { ...DEFAULT_FX, reducedMotion: true, quality: "high" };

function Sitter({ look, onReady }: { look: Look; onReady: () => void }) {
  // children (and their useFrame subscriptions) are attached before this runs
  useLayoutEffect(onReady, [onReady]);
  return (
    <SceneFxContext.Provider value={FX}>
      {/* lamp overhead and a little to camera-left, warm rim from behind, almost no fill */}
      <ambientLight intensity={0.22} color="#ffd8b0" />
      <hemisphereLight args={["#5a3a22", "#000000", 0.35]} />
      <directionalLight position={[-1.2, 3.4, 3]} intensity={2.7} color="#ffd29a" />
      <directionalLight position={[2.6, 2.2, -2.8]} intensity={3.2} color="#ff8a3a" />
      <directionalLight position={[-2.8, 1.6, -2.2]} intensity={1.4} color="#ffb070" />
      {/* the figure's geometry and INK material are shared with the live tables: never dispose
          them here (this renderer's GPU copies go when it's unmounted) */}
      <group rotation-y={BODY_YAW} dispose={null}>
        <Figure look={look} pose="rest" face={look.temper.rest} stance="standing" lookAt={CAMERA} />
      </group>
    </SceneFxContext.Provider>
  );
}

export interface PortraitRenderer {
  render(look: Look): Promise<string>;
  dispose(): void;
}

/** Throws if WebGL can't be created. */
export async function createPortraitRenderer(): Promise<PortraitRenderer> {
  const canvas = document.createElement("canvas");
  const root: ReconcilerRoot<HTMLCanvasElement> = createRoot(canvas);
  await root.configure({
    gl: { antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "low-power" },
    size: { width: PORTRAIT_W, height: PORTRAIT_H, top: 0, left: 0 },
    dpr: 1,
    frameloop: "never",
    events: undefined,
    camera: { fov: 25, near: 0.1, far: 30, position: CAMERA.toArray() },
  });
  const store = _roots.get(canvas)!.store;
  let n = 0;

  return {
    async render(look) {
      await new Promise<void>((resolve, reject) => {
        // a render error never reaches onReady: give up rather than wait forever
        const timer = setTimeout(() => reject(new Error("portrait render timed out")), 5000);
        const ready = () => {
          clearTimeout(timer);
          resolve();
        };
        root.render(<Sitter key={++n} look={look} onReady={ready} />);
      });
      const state = store.getState();
      state.gl.setClearColor(0x000000, 0);
      state.camera.position.copy(CAMERA);
      state.camera.lookAt(AIM);
      // ease the face and head into place (motion is off, so nothing else moves)
      const t0 = state.clock.elapsedTime;
      for (let i = 1; i <= 32; i++) advance(t0 + i * 0.1, false, state);
      const type = "image/webp";
      const url = canvas.toDataURL(type, 0.9);
      // Safari can't encode WebP and quietly returns PNG, which is fine
      return url;
    },
    dispose() {
      root.unmount();
    },
  };
}
