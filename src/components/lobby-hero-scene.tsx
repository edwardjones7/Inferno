"use client";

import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DEFAULT_FX, SceneFxContext } from "@/game/three/fx-context";
import { FOV, LobbyRoom, type LobbyRoomProps } from "@/game/lobby/lobby-room";

/* The Home room: one on-demand Canvas with the three stations. Pauses entirely when the
   tab is hidden or the room is scrolled out of view. */

function onVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}
const pageVisible = () => document.visibilityState === "visible";

export type LobbySceneProps = Omit<LobbyRoomProps, "animate">;

export default function LobbyHeroScene(props: LobbySceneProps) {
  const { quality, reduced } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const tabVisible = useSyncExternalStore(onVisibility, pageVisible, () => true);
  const fx = useMemo(() => ({ ...DEFAULT_FX, reducedMotion: reduced, quality }), [reduced, quality]);

  useEffect(() => {
    let live = true;
    // the felt and chart textures print text; wait for the webfonts so they don't bake in a fallback
    document.fonts.ready.then(() => live && setFontsReady(true));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { rootMargin: "40px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const visible = onScreen && tabVisible;

  return (
    <div ref={wrap} className="h-full w-full">
      {fontsReady && (
        <Canvas
          frameloop={visible ? "demand" : "never"}
          dpr={quality === "low" ? [1, 1.25] : [1, 1.75]}
          camera={{ fov: FOV, near: 0.5, far: 40, position: [0, 4, 12] }}
          gl={{ antialias: quality === "low", powerPreference: quality === "low" ? "low-power" : "high-performance" }}
          onCreated={({ gl }) => {
            gl.debug.checkShaderErrors = process.env.NODE_ENV !== "production";
          }}
        >
          <SceneFxContext.Provider value={fx}>
            <LobbyRoom {...props} animate={visible && !reduced} />
          </SceneFxContext.Provider>
          {quality === "high" && (
            <EffectComposer multisampling={4}>
              <Bloom mipmapBlur intensity={0.9} luminanceThreshold={1} luminanceSmoothing={0.3} />
              <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
            </EffectComposer>
          )}
        </Canvas>
      )}
    </div>
  );
}
