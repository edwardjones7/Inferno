import type { FeltId } from "@/lib/cosmetics";

/**
 * How each table design is painted and lit. Plain data (no three.js), shared by the 3D felt
 * painters, the rail materials and the picker swatches.
 */
export interface FeltLook {
  /** cloth gradient, centre → mid → edge */
  cloth: readonly [string, string, string];
  /** soft mottling tones (r,g,b) where the nap lies differently: light, dark */
  mottle: readonly [string, string];
  /** fibre specks: light, dark */
  fibre: readonly [string, string];
  /** the lamp catching the nap */
  sheen: string;
  /** printing inks: headline, small print, rules, betting ring */
  print: { gold: string; cream: string; line: string; ring: string; faint: string; mark: string };
  /** padded rail leather */
  leather: { color: string; sheenColor: string };
  /** metal trim between rail and cloth */
  trim: { color: string; roughness: number };
}

export const FELT_LOOKS: Record<FeltId, FeltLook> = {
  /* Free default: deep red baize, warm under the lamp. The rail is near-black leather so it
     separates from the red cloth; the print is a brighter antique gold to hold against red. */
  crimson: {
    cloth: ["#7c2120", "#5e1617", "#30090a"],
    mottle: ["255,225,200", "24,0,2"],
    fibre: ["rgba(255,205,185,0.03)", "rgba(0,0,0,0.08)"],
    sheen: "#c2786a",
    print: {
      gold: "rgba(240,202,124,0.92)",
      cream: "rgba(244,224,192,0.6)",
      line: "rgba(232,192,112,0.5)",
      ring: "rgba(244,204,124,0.9)",
      faint: "rgba(232,192,112,0.3)",
      mark: "rgba(240,202,124,",
    },
    leather: { color: "#1a0d09", sheenColor: "#6a4632" },
    trim: { color: "#cf9d4e", roughness: 0.24 },
  },
  "back-room": {
    cloth: ["#1f5a3c", "#174a31", "#0d2e1f"],
    mottle: ["255,255,230", "0,10,4"],
    fibre: ["rgba(200,235,200,0.03)", "rgba(0,0,0,0.07)"],
    sheen: "#6f9a7c",
    print: {
      gold: "rgba(226,186,110,0.88)",
      cream: "rgba(232,220,196,0.5)",
      line: "rgba(214,176,104,0.42)",
      ring: "rgba(230,190,112,0.85)",
      faint: "rgba(214,176,104,0.25)",
      mark: "rgba(226,186,110,",
    },
    leather: { color: "#3a1009", sheenColor: "#8a3a22" },
    trim: { color: "#c9954a", roughness: 0.26 },
  },
  midnight: {
    cloth: ["#1d3352", "#152842", "#0a1526"],
    mottle: ["220,235,255", "0,4,14"],
    fibre: ["rgba(200,215,240,0.03)", "rgba(0,0,0,0.08)"],
    sheen: "#6d86a8",
    print: {
      gold: "rgba(214,220,228,0.9)",
      cream: "rgba(206,196,170,0.55)",
      line: "rgba(190,198,210,0.42)",
      ring: "rgba(222,226,232,0.85)",
      faint: "rgba(190,198,210,0.25)",
      mark: "rgba(214,220,228,",
    },
    leather: { color: "#0d0d10", sheenColor: "#3c4252" },
    trim: { color: "#b9bcc2", roughness: 0.2 },
  },
};

/** Colours for the flat (CSS) table and swatch: cloth highlight, cloth, cloth edge, rail, trim. */
export function flatColors(id: FeltId) {
  const l = FELT_LOOKS[id];
  return { hi: l.cloth[0], mid: l.cloth[1], lo: l.cloth[2], rail: l.leather.color, trim: l.trim.color, ink: l.print.ring };
}
