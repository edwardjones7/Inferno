"use client";

/**
 * Imperative chip simulation on top of a Rapier world.
 *
 * Chips are raw Rapier bodies (no React component per chip) drawn through one
 * InstancedMesh per denomination. A chip is tossed in as a dynamic body; once it comes
 * to rest it is switched to a kinematic body and eased into a tidy slot in its pile,
 * so stacks never jitter or creep. Leaving chips (lost stakes, collected winnings,
 * removed bet chips) drop their body and are animated as plain eased slides.
 *
 * Owned by ChipLayer (chips.tsx): `sync` from effects, `beforeStep`/`afterStep` from
 * Rapier's step hooks.
 */
import type { useRapier } from "@react-three/rapier";
import * as THREE from "three";
import { play } from "@/lib/sound";
import { CHIP_H, CHIP_R, denomIndex } from "./chip-geometry";
import { PLAYER_SIDE, TRAY } from "./table-layout";

// Types come from @react-three/rapier's own copy of rapier3d-compat (it bundles a nested one).
type RapierCtx = ReturnType<typeof useRapier>;
type RapierApi = RapierCtx["rapier"];
type World = RapierCtx["world"];
type RigidBody = ReturnType<World["createRigidBody"]>;

export const STEP = 1 / 120;
export const GRAVITY = 18;
export const INSTANCE_CAP = 96;
const MAX_DYNAMIC = 60;
const MAX_SPILL = 28;
const GAP = 0.0009;
const BORDER = 0.004;
/**
 * Collision groups ((membership << 16) | filter). Chips still in flight don't collide with
 * each other (a quick toss of several chips would otherwise clip in mid-air and tumble);
 * they touch the felt, colliders and any chip that has already landed.
 */
const GROUP_AIR = (0x0002 << 16) | 0xfffd;
const GROUP_DOWN = (0x0004 << 16) | 0xffff;

export interface PileSpec {
  key: string;
  kind: "bet" | "payout" | "spill";
  /** stack centre on the felt */
  x: number;
  z: number;
  /** chip values bottom -> top (for "spill": the values to scatter) */
  values: number[];
  /** where new chips come from */
  from: "player" | "tray";
  /** take over an existing pile with this key instead of starting empty (pending bet -> stake) */
  adopt?: string;
  /** stake lost: sweep it to the tray */
  lost?: boolean;
  /** extra seconds before new chips start arriving */
  delay?: number;
}

type Mode = "queued" | "air" | "stacked" | "frozen" | "leaving" | "dead";

interface Pile {
  key: string;
  kind: PileSpec["kind"];
  x: number;
  z: number;
  from: PileSpec["from"];
  chips: Chip[];
  swept: boolean;
  spawned: boolean;
  lost: boolean;
  /** false once the pile has been collected; any chip still pointing at it is an orphan */
  live: boolean;
}

interface Chip {
  value: number;
  vi: number;
  mode: Mode;
  pile: Pile | null;
  body: RigidBody | null;
  spawnAt: number;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: number;
  /** tidy-slot offsets and orientation */
  jx: number;
  jz: number;
  slotQuat: THREE.Quaternion;
  /** spill landing spot */
  tx: number;
  tz: number;
  restT: number;
  lastVy: number;
  caught: boolean;
  /** sim time of the first hard contact, -1 before it */
  hitAt: number;
  still: boolean;
  /** place without a toss (reduced motion / first load) */
  calm: boolean;
  leaveFrom: THREE.Vector3;
  leaveTo: THREE.Vector3;
  leaveAt: number;
  leaveDur: number;
  leaveArc: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _t = new THREE.Vector3();

export class ChipSim {
  private chips: Chip[] = [];
  private piles = new Map<string, Pile>();
  private now = 0;
  private lastClack = -1;
  private dirty = true;
  private counts = new Int32Array(8);
  private first = true;

  constructor(
    private world: World,
    private rapier: RapierApi,
  ) {}

  /* ------------------------------------------------------------ reconcile */

  sync(specs: PileSpec[], reducedMotion: boolean) {
    // On the very first sync (page load mid-round) just place what's there.
    const calm = reducedMotion || this.first;
    this.first = false;
    const wanted = new Set(specs.map((s) => s.key));

    for (const s of specs) {
      if (s.adopt && !this.piles.has(s.key) && this.piles.has(s.adopt) && !wanted.has(s.adopt)) {
        const p = this.piles.get(s.adopt)!;
        this.piles.delete(s.adopt);
        p.key = s.key;
        this.piles.set(s.key, p);
      }
    }

    let collected = false;
    for (const [key, p] of this.piles) {
      if (wanted.has(key)) continue;
      this.piles.delete(key);
      p.live = false;
      if (p.chips.length) collected = true;
      const toTray = p.lost;
      p.chips.forEach((c, i) => {
        if (toTray) this.sweepChip(c, p, i * 0.02, calm);
        else this.leaveTo(c, this.playerDest(p.x, c.pos.y), i * 0.035, 0.55, 0.28, calm);
      });
      p.chips.length = 0;
    }

    for (const s of specs) {
      let p = this.piles.get(s.key);
      if (!p) {
        p = { key: s.key, kind: s.kind, x: s.x, z: s.z, from: s.from, chips: [], swept: false, spawned: false, lost: false, live: true };
        this.piles.set(s.key, p);
      }
      if (p.x !== s.x || p.z !== s.z) {
        p.x = s.x;
        p.z = s.z;
        this.dirty = true;
      }
      p.lost = !!s.lost;
      if (p.swept) continue;
      const delay = (s.delay ?? 0) + (collected ? 0.45 : 0);

      if (s.lost) {
        p.swept = true;
        p.chips.forEach((c, i) => this.sweepChip(c, p, delay + i * 0.012, calm));
        p.chips.length = 0;
        continue;
      }

      if (s.kind === "spill") {
        if (p.spawned || calm) continue;
        p.spawned = true;
        const live = this.chips.reduce((n, c) => n + (c.pile?.kind === "spill" ? 1 : 0), 0);
        const n = Math.min(s.values.length, Math.max(0, MAX_SPILL - live));
        for (let i = 0; i < n; i++) {
          const c = this.newChip(s.values[i], p, this.now + delay + i * 0.045 + rand(0, 0.05), false);
          c.tx = THREE.MathUtils.clamp(s.x + rand(-1.3, 1.3), -3.3, 3.3);
          c.tz = rand(0.35, 2.45);
        }
        continue;
      }

      // diff bottom -> top: keep the common prefix, take the rest off the top, toss the new ones on
      let k = 0;
      while (k < p.chips.length && k < s.values.length && p.chips[k].value === s.values[k]) k++;
      for (let i = p.chips.length - 1; i >= k; i--) {
        const c = p.chips[i];
        const dest = s.from === "tray" ? this.trayDest(p, c) : this.playerDest(p.x, c.pos.y);
        this.leaveTo(c, dest, (p.chips.length - 1 - i) * 0.04, 0.42, 0.3, calm);
      }
      p.chips.length = k;
      for (let i = k; i < s.values.length; i++) {
        this.newChip(s.values[i], p, this.now + (calm ? 0 : delay + (i - k) * 0.15), calm);
      }
    }
  }

  private newChip(value: number, pile: Pile, spawnAt: number, calm: boolean): Chip {
    _e.set(rand(-0.012, 0.012), rand(0, Math.PI * 2), rand(-0.012, 0.012));
    const c: Chip = {
      value,
      vi: denomIndex(value),
      mode: "queued",
      pile,
      body: null,
      spawnAt,
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      scale: 1,
      jx: rand(-0.011, 0.011),
      jz: rand(-0.011, 0.011),
      slotQuat: new THREE.Quaternion().setFromEuler(_e),
      tx: 0,
      tz: 0,
      restT: 0,
      lastVy: 0,
      caught: false,
      hitAt: -1,
      still: false,
      calm,
      leaveFrom: new THREE.Vector3(),
      leaveTo: new THREE.Vector3(),
      leaveAt: 0,
      leaveDur: 0,
      leaveArc: 0,
    };
    pile.chips.push(c);
    this.chips.push(c);
    return c;
  }

  private playerDest(x: number, y: number) {
    return new THREE.Vector3(x * 0.75 + rand(-0.15, 0.15), Math.max(0.35, y + 0.35), PLAYER_SIDE.z + 0.5);
  }

  private trayDest(p: Pile, c: Chip) {
    return new THREE.Vector3(p.x * 0.45 + rand(-0.1, 0.1), c.pos.y + 0.12, TRAY.z + 0.2);
  }

  /** Slide a lost chip across the felt into the tray, keeping the stack's shape. */
  private sweepChip(c: Chip, p: Pile, delay: number, calm: boolean) {
    const dest = _t.set(p.x * 0.45, 0.1, TRAY.z + 0.22).sub(_v.set(p.x, 0, p.z)).add(c.pos);
    this.leaveTo(c, dest.clone(), 0.55 + delay, 0.95, 0.04, calm);
  }

  private leaveTo(c: Chip, dest: THREE.Vector3, delay: number, dur: number, arc: number, calm: boolean) {
    c.pile = null;
    if (c.mode === "queued" || c.mode === "dead") {
      c.mode = "dead";
      return;
    }
    // leaving chips are pure animation: drop the body so they can't knock anything in flight
    if (c.body) this.world.removeRigidBody(c.body);
    c.body = null;
    c.mode = "leaving";
    c.leaveFrom.copy(c.pos);
    if (calm) {
      c.leaveTo.copy(c.pos);
      c.leaveAt = this.now;
      c.leaveDur = 0.22;
      c.leaveArc = 0;
    } else {
      c.leaveTo.copy(dest);
      c.leaveAt = this.now + delay;
      c.leaveDur = dur;
      c.leaveArc = arc;
    }
  }

  /* ------------------------------------------------------------ bodies */

  private makeBody(c: Chip, dynamic: boolean) {
    // (dynamic bodies start in the in-flight group; see GROUP_AIR)
    const R = this.rapier;
    const desc = dynamic ? R.RigidBodyDesc.dynamic() : R.RigidBodyDesc.kinematicPositionBased();
    desc.setTranslation(c.pos.x, c.pos.y, c.pos.z).setRotation(c.quat);
    if (dynamic) {
      desc
        .setCcdEnabled(true)
        // no damping in flight so the ballistic aim is exact; raised on first contact
        .setLinearDamping(0)
        .setAngularDamping(0.2)
        .setCanSleep(true)
        .setAdditionalSolverIterations(2);
    }
    const body = this.world.createRigidBody(desc);
    const col = R.ColliderDesc.roundCylinder(CHIP_H / 2 - BORDER, CHIP_R - BORDER, BORDER)
      .setFriction(0.85)
      .setRestitution(0.12)
      .setDensity(2)
      .setCollisionGroups(dynamic ? GROUP_AIR : GROUP_DOWN);
    this.world.createCollider(col, body);
    c.body = body;
  }

  private dynamicCount() {
    let n = 0;
    for (const c of this.chips) if (c.mode === "air") n++;
    return n;
  }

  private launch(c: Chip) {
    const p = c.pile;
    if (!p) {
      c.mode = "dead";
      return;
    }
    const level = p.chips.indexOf(c);
    const slotY = CHIP_H / 2 + Math.max(0, level) * (CHIP_H + GAP);
    if (c.calm || this.dynamicCount() >= MAX_DYNAMIC) {
      // drop straight into its slot
      c.pos.set(p.x + c.jx, slotY, p.z + c.jz);
      c.quat.copy(c.slotQuat);
      this.makeBody(c, false);
      c.mode = p.kind === "spill" ? "frozen" : "stacked";
      c.still = false;
      this.clack();
      return;
    }

    let T: number;
    if (p.kind === "spill") {
      c.pos.set(THREE.MathUtils.clamp(p.x * 0.5 + rand(-0.5, 0.5), -1.4, 1.4), 0.45, TRAY.z + 0.45);
      _t.set(c.tx, 0.05, c.tz);
      T = rand(0.75, 1.0);
    } else {
      if (p.from === "tray") c.pos.set(p.x * 0.5 + rand(-0.25, 0.25), 0.45, TRAY.z + 0.45);
      else c.pos.set(p.x * 0.6 + rand(-0.2, 0.2), PLAYER_SIDE.y + rand(-0.1, 0.1), PLAYER_SIDE.z);
      _t.set(p.x + c.jx, slotY + CHIP_H * 0.9, p.z + c.jz);
      const dist = Math.hypot(_t.x - c.pos.x, _t.z - c.pos.z);
      T = THREE.MathUtils.clamp(0.42 + dist * 0.11, 0.45, 0.95);
    }
    const tilt = p.kind === "spill" ? 0.6 : 0.08;
    _e.set(rand(-tilt, tilt), rand(0, Math.PI * 2), rand(-tilt, tilt));
    c.quat.setFromEuler(_e);
    this.makeBody(c, true);
    const vx = (_t.x - c.pos.x) / T;
    const vz = (_t.z - c.pos.z) / T;
    const vy = (_t.y - c.pos.y) / T + 0.5 * GRAVITY * T;
    c.body!.setLinvel({ x: vx, y: vy, z: vz }, true);
    const wobble = p.kind === "spill" ? 9 : 0.2;
    const spin = p.kind === "spill" ? 12 : 5;
    c.body!.setAngvel({ x: rand(-wobble, wobble), y: rand(-spin, spin), z: rand(-wobble, wobble) }, true);
    c.mode = "air";
    c.lastVy = vy;
    c.restT = 0;
    c.caught = false;
    c.hitAt = -1;
  }

  private settle(c: Chip) {
    if (!c.body) return;
    c.body.collider(0).setCollisionGroups(GROUP_DOWN);
    c.body.setBodyType(this.rapier.RigidBodyType.KinematicPositionBased, true);
    c.mode = c.pile?.kind === "spill" ? "frozen" : "stacked";
    c.still = false;
  }

  private kill(c: Chip) {
    if (c.body) this.world.removeRigidBody(c.body);
    c.body = null;
    c.mode = "dead";
    if (c.pile) {
      const i = c.pile.chips.indexOf(c);
      if (i >= 0) c.pile.chips.splice(i, 1);
      c.pile = null;
    }
    this.dirty = true;
  }

  private clack() {
    if (this.now - this.lastClack < 1 / 12) return;
    this.lastClack = this.now;
    play("clack", Math.random() * 0.035);
  }

  /* ------------------------------------------------------------ stepping */

  beforeStep() {
    this.now += STEP;
    const k = 1 - Math.exp(-STEP * 16);

    for (const c of this.chips) {
      if (c.mode !== "leaving" && c.mode !== "dead" && (!c.pile || !c.pile.live || this.piles.get(c.pile.key) !== c.pile)) {
        // safety net: a chip whose pile no longer exists must never be left on the felt
        this.leaveTo(c, this.playerDest(c.pos.x, c.pos.y), 0, 0.5, 0.25, false);
        this.dirty = true;
        continue;
      }
      if (c.mode === "queued" && this.now >= c.spawnAt) {
        this.launch(c);
        this.dirty = true;
      } else if (c.mode === "leaving") {
        const t = (this.now - c.leaveAt) / c.leaveDur;
        if (t <= 0) continue;
        if (t >= 1) {
          this.kill(c);
          continue;
        }
        const e = easeInOut(t);
        c.pos.lerpVectors(c.leaveFrom, c.leaveTo, e);
        c.pos.y += Math.sin(Math.PI * t) * c.leaveArc;
        c.scale = t > 0.72 ? Math.max(0.001, 1 - (t - 0.72) / 0.28) : 1;
        this.dirty = true;
      }
    }

    // stacked chips ease into compact, tidy slots (only counting chips already resting)
    for (const p of this.piles.values()) {
      let level = 0;
      for (const c of p.chips) {
        if (c.mode !== "stacked" || !c.body) continue;
        _t.set(p.x + c.jx, CHIP_H / 2 + level * (CHIP_H + GAP), p.z + c.jz);
        level++;
        const d = c.pos.distanceToSquared(_t);
        const ang = c.quat.angleTo(c.slotQuat);
        if (d < 1e-8 && ang < 1e-4) {
          if (!c.still) {
            c.pos.copy(_t);
            c.quat.copy(c.slotQuat);
            c.body.setNextKinematicTranslation(c.pos);
            c.body.setNextKinematicRotation(c.quat);
            c.still = true;
            this.dirty = true;
          }
          continue;
        }
        c.still = false;
        c.pos.lerp(_t, k);
        c.quat.slerp(c.slotQuat, k);
        c.body.setNextKinematicTranslation(c.pos);
        c.body.setNextKinematicRotation(c.quat);
        this.dirty = true;
      }
    }
  }

  afterStep(meshes: (THREE.InstancedMesh | null)[]) {
    for (const c of this.chips) {
      if (c.mode !== "air" || !c.body) continue;
      const b = c.body;
      const tr = b.translation();
      const ro = b.rotation();
      c.pos.set(tr.x, tr.y, tr.z);
      c.quat.set(ro.x, ro.y, ro.z, ro.w);
      this.dirty = true;
      if (tr.y < -0.6 || Math.abs(tr.x) > 6 || Math.abs(tr.z) > 6) {
        this.kill(c);
        continue;
      }
      const v = b.linvel();
      if (c.lastVy < -1.1 && v.y - c.lastVy > 1.0) {
        this.clack();
        if (c.hitAt < 0) c.hitAt = this.now;
        if (!c.caught) {
          c.caught = true;
          b.collider(0).setCollisionGroups(GROUP_DOWN);
          if (c.pile?.kind === "spill") {
            b.setLinearDamping(0.6);
            b.setAngularDamping(1.5);
          } else {
            // first contact soaks up the throw so the chip drops onto the stack instead of
            // skating or flipping off it (a real chip lands with very little bounce)
            const w0 = b.angvel();
            b.setLinvel(_v.set(v.x * 0.12, Math.min(v.y, 0.2), v.z * 0.12), true);
            b.setAngvel(_v.set(w0.x * 0.2, w0.y * 0.5, w0.z * 0.2), true);
            b.setLinearDamping(3);
            b.setAngularDamping(2);
          }
        }
      }
      c.lastVy = v.y;
      const w = b.angvel();
      const slow = v.x * v.x + v.y * v.y + v.z * v.z < 0.05 && w.x * w.x + w.y * w.y + w.z * w.z < 1.5;
      c.restT = slow ? c.restT + STEP : 0;
      const age = this.now - c.spawnAt;
      const spill = c.pile?.kind === "spill";
      // Hard limits: a chip that bounced off and is leaning/creeping against the stack
      // never meets the rest test, so snap it into its slot shortly after it first hit.
      // A chip that came down on (or right next to) its slot is snapped in as soon as the
      // impact has registered, so it is solid before the next chip lands on it.
      let landed = false;
      if (!spill && c.pile && c.hitAt >= 0 && this.now - c.hitAt > 0.05) {
        const lvl = Math.max(0, c.pile.chips.indexOf(c));
        const dx = tr.x - c.pile.x;
        const dz = tr.z - c.pile.z;
        landed = dx * dx + dz * dz < 0.12 * 0.12 && tr.y < CHIP_H / 2 + (lvl + 1.5) * (CHIP_H + GAP) && v.y > -0.6;
      }
      const settled =
        landed ||
        (age > 0.25 && (c.restT > 0.08 || b.isSleeping())) ||
        (c.hitAt >= 0 && this.now - c.hitAt > (spill ? 1.6 : 0.8)) ||
        age > (spill ? 2.6 : 1.8);
      if (settled) this.settle(c);
    }

    // drop dead chips (in place, no allocation)
    let j = 0;
    for (let i = 0; i < this.chips.length; i++) {
      const c = this.chips[i];
      if (c.mode !== "dead") this.chips[j++] = c;
      else if (c.body) this.kill(c);
    }
    if (j !== this.chips.length) {
      this.chips.length = j;
      this.dirty = true;
    }

    if (!this.dirty) return;
    this.dirty = false;
    this.counts.fill(0);
    for (const c of this.chips) {
      if (c.mode === "queued") continue;
      const m = meshes[c.vi];
      if (!m || this.counts[c.vi] >= INSTANCE_CAP) continue;
      _m.compose(c.pos, c.quat, _s.setScalar(c.scale));
      m.setMatrixAt(this.counts[c.vi]++, _m);
    }
    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i];
      if (!m) continue;
      m.count = this.counts[i];
      m.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const c of this.chips) {
      if (c.body) {
        try {
          this.world.removeRigidBody(c.body);
        } catch {
          // world already freed with the <Physics> unmount
        }
      }
      c.body = null;
    }
    this.chips.length = 0;
    this.piles.clear();
  }
}
