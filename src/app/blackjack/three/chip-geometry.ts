"use client";

/**
 * Shared casino-chip mesh: a bevelled disc with a fluted (ridged) edge and a slightly
 * recessed centre inlay on both faces. One geometry and one material pair per
 * denomination for the whole page; every chip on the table and in the tray uses them.
 */
import * as THREE from "three";
import { CHIP_VALUES } from "@/components/chip";
import { chipSide, chipTop } from "./chip-textures";

export const CHIP_R = 0.19;
export const CHIP_H = 0.045;
const HALF = CHIP_H / 2;
/** bevel radius on the rim */
const BEVEL = 0.0055;
/** number of flutes around the edge, depth of each */
const FLUTES = 28;
const FLUTE_DEPTH = 0.0026;
/** radius / depth of the recessed centre inlay */
const INLAY_R = CHIP_R * 0.68;
const INLAY_DEPTH = 0.0016;
const SEGMENTS = FLUTES * 6;

/** Radial inset of the fluted edge at angle a (0 between flutes, FLUTE_DEPTH at the groove). */
function flute(a: number) {
  const g = 0.5 + 0.5 * Math.cos(FLUTES * a);
  return FLUTE_DEPTH * g * g * g;
}
/** d(flute)/da, for the edge normals */
function fluteSlope(a: number) {
  const g = 0.5 + 0.5 * Math.cos(FLUTES * a);
  return FLUTE_DEPTH * 3 * g * g * (-0.5 * FLUTES * Math.sin(FLUTES * a));
}

function build() {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const side: number[] = [];
  const face: number[] = [];

  /* ---- edge: profile rows bottom -> top, each with its 2D (radial, y) normal */
  const rows: { r: number; y: number; nr: number; ny: number }[] = [];
  const BEVEL_STEPS = 3;
  for (let k = 0; k <= BEVEL_STEPS; k++) {
    const a = (k / BEVEL_STEPS) * (Math.PI / 2);
    rows.push({ r: CHIP_R - BEVEL + BEVEL * Math.sin(a), y: -HALF + BEVEL - BEVEL * Math.cos(a), nr: Math.sin(a), ny: -Math.cos(a) });
  }
  for (let k = 0; k <= BEVEL_STEPS; k++) {
    const a = Math.PI / 2 + (k / BEVEL_STEPS) * (Math.PI / 2);
    rows.push({ r: CHIP_R - BEVEL + BEVEL * Math.sin(a), y: HALF - BEVEL - BEVEL * Math.cos(a), nr: Math.sin(a), ny: -Math.cos(a) });
  }
  const cols = SEGMENTS + 1;
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < cols; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      // flutes fade out toward the flat faces so the face outline stays round-ish
      const w = Math.abs(row.nr);
      const r = row.r - flute(a) * w;
      pos.push(r * c, row.y, r * s);
      // horizontal normal = radial + (dr/da / r) * tangential, scaled by the profile's radial part
      const tang = (fluteSlope(a) * w) / r;
      const hx = c - tang * -s;
      const hz = s - tang * c;
      const hl = Math.hypot(hx, hz) || 1;
      const n = new THREE.Vector3((hx / hl) * row.nr, row.ny, (hz / hl) * row.nr).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(i / SEGMENTS, (row.y + HALF) / CHIP_H);
    }
  }
  for (let j = 0; j < rows.length - 1; j++) {
    for (let i = 0; i < SEGMENTS; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const d = a + cols;
      const c = d + 1;
      side.push(a, c, b, a, d, c);
    }
  }

  /* ---- faces: outer flat ring, inlay wall, recessed centre disc */
  const faceFor = (top: boolean) => {
    const sy = top ? 1 : -1;
    const ny = sy;
    const vSign = top ? -1 : 1;
    const ring = (radius: (a: number) => number, y: number, nx: (c: number) => number, nyv: number, nz: (s: number) => number) => {
      const start = pos.length / 3;
      for (let i = 0; i < cols; i++) {
        const a = (i / SEGMENTS) * Math.PI * 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const r = radius(a);
        pos.push(r * c, y, r * s);
        nor.push(nx(c), nyv, nz(s));
        uv.push(0.5 + (r * c) / (2 * CHIP_R), 0.5 + (vSign * (r * s)) / (2 * CHIP_R));
      }
      return start;
    };
    const flat = (r: number | ((a: number) => number), y: number) =>
      ring(typeof r === "number" ? () => r : r, y, () => 0, ny, () => 0);
    // `strip` emits a strip between two rings, oriented so it faces `up` (+y) when inner->outer.
    const strip = (inner: number, outer: number, up: boolean) => {
      for (let i = 0; i < SEGMENTS; i++) {
        const qi = inner + i;
        const qn = qi + 1;
        const pi = outer + i;
        const pn = pi + 1;
        if (up) face.push(qi, pn, pi, qi, qn, pn);
        else face.push(qi, pi, pn, qi, pn, qn);
      }
    };
    const outer = flat(CHIP_R - BEVEL, sy * HALF);
    const innerTop = flat(INLAY_R, sy * HALF);
    strip(innerTop, outer, top);
    // inlay wall, facing the centre
    const wallHi = ring(() => INLAY_R, sy * HALF, (c) => -c, 0, (s) => -s);
    const wallLo = ring(() => INLAY_R, sy * (HALF - INLAY_DEPTH), (c) => -c, 0, (s) => -s);
    for (let i = 0; i < SEGMENTS; i++) {
      const a = wallLo + i;
      const b = a + 1;
      const d = wallHi + i;
      const c = d + 1;
      if (top) face.push(a, b, c, a, c, d);
      else face.push(a, c, b, a, d, c);
    }
    // recessed disc: fan from the centre
    const rim = flat(INLAY_R, sy * (HALF - INLAY_DEPTH));
    const centre = pos.length / 3;
    pos.push(0, sy * (HALF - INLAY_DEPTH), 0);
    nor.push(0, ny, 0);
    uv.push(0.5, 0.5);
    for (let i = 0; i < SEGMENTS; i++) {
      if (top) face.push(centre, rim + i + 1, rim + i);
      else face.push(centre, rim + i, rim + i + 1);
    }
  };
  faceFor(true);
  faceFor(false);

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([...side, ...face]);
  g.addGroup(0, side.length, 0);
  g.addGroup(side.length, face.length, 1);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

let geometry: THREE.BufferGeometry | null = null;
/** The shared chip geometry (group 0 = edge, group 1 = faces). */
export function chipGeometry() {
  geometry ??= build();
  return geometry;
}

const materials = new Map<number, THREE.Material[]>();
/** [edge, faces] materials for a denomination, shared page-wide. */
export function chipMaterials(value: number): THREE.Material[] {
  let m = materials.get(value);
  if (!m) {
    const edge = new THREE.MeshPhysicalMaterial({
      map: chipSide(value),
      roughness: 0.52,
      clearcoat: 0.2,
      clearcoatRoughness: 0.5,
    });
    const faces = new THREE.MeshPhysicalMaterial({
      map: chipTop(value),
      roughness: 0.42,
      clearcoat: 0.35,
      clearcoatRoughness: 0.35,
    });
    m = [edge, faces];
    materials.set(value, m);
  }
  return m;
}

export const CHIP_DENOMS: readonly number[] = CHIP_VALUES;
export const denomIndex = (value: number) => {
  const i = CHIP_DENOMS.indexOf(value);
  return i < 0 ? 3 : i;
};
