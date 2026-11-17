"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { BotMood } from "@/game/poker-three/bot-presence";
import { seatAngle } from "@/game/poker-three/poker-layout";
import type { BotProfile } from "@/lib/poker/roster";
import { faceToward, Figure, type PoseName } from "./figure";
import { lookForBot, type Face } from "./looks";

/**
 * A poker bot seated behind its place at the table, acting out what it's doing: chin in hand
 * while thinking, leaning in and pushing chips on a bet, arms crossed and slumped after a fold,
 * celebrating a win. Drop-in replacement for `BotPresence` (same props).
 */

const RING = { x: 5.25, z: 3.5 };
const CENTRE = new THREE.Vector3(0, 0, 0);

export function BotFigure({ bot, place, mood, actKey }: { bot: BotProfile; place: number; mood: BotMood; actKey: number }) {
  const look = useMemo(() => lookForBot(bot.id, bot.colors), [bot.id, bot.colors]);
  const { pos, yaw } = useMemo(() => {
    const a = (seatAngle(place) * Math.PI) / 180;
    const pos = new THREE.Vector3(Math.cos(a) * RING.x, -0.15, Math.sin(a) * RING.z);
    // the two seats beside you are close to the camera: sit them a little further back so
    // they don't loom over the table
    if (pos.z > 0) pos.z -= 0.75;
    return { pos, yaw: faceToward(pos, CENTRE) };
  }, [place]);

  const t = look.temper;
  const calm = t.energy < 0.4;
  let pose: PoseName = "rest";
  let face: Face = t.rest;
  let dim = 0;
  let bounce = 0;
  switch (mood) {
    case "thinking":
      pose = "think";
      face = { smile: t.rest.smile * 0.3, open: 0, brow: -0.35, lid: Math.max(0.1, t.rest.lid * 0.7) };
      break;
    case "aggressive":
      pose = "push";
      face = t.push;
      break;
    case "folded":
      pose = "fold";
      face = { smile: calm ? -0.15 : -0.5, open: 0, brow: calm ? 0 : 0.4, lid: 0.4 };
      dim = 1;
      break;
    case "won":
      // a quiet pro just smiles; an excitable one throws its arms up
      pose = calm ? "rest" : "cheer";
      face = calm ? { smile: 0.75, open: 0, brow: -0.1, lid: t.rest.lid } : { smile: 1, open: 0.75, brow: 0.55, lid: 0 };
      bounce = calm ? 0 : 1;
      break;
  }

  return (
    <group position={pos} rotation-y={yaw}>
      <Figure look={look} pose={pose} face={face} dim={dim} bounce={bounce} kick={actKey} phase={place * 1.7} />
    </group>
  );
}
