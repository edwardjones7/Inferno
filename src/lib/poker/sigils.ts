import type { BotProfile, Sigil } from "./roster";

/** Each bot's sigil as SVG markup in a 64×64 box, stroked by the caller. */
export const SIGIL_SVG: Record<Sigil, string> = {
  spark: '<path d="M32 14l4 12 12 4-12 4-4 12-4-12-12-4 12-4z"/>',
  drop: '<path d="M32 13c6 9 13 15 13 23a13 13 0 0 1-26 0c0-8 7-14 13-23Zm-4 25a5 5 0 0 0 5 5"/>',
  leaf: '<path d="M18 44c0-17 12-27 28-27 0 17-10 29-27 29Zm1 1 15-15"/>',
  moon: '<path d="M38 16a16 16 0 1 0 10 25 13 13 0 0 1-10-25Z"/>',
  eye: '<path d="M14 32s7-11 18-11 18 11 18 11-7 11-18 11-18-11-18-11Z"/><circle cx="32" cy="32" r="5"/>',
  crown: '<path d="M16 42h32l2-20-9 7-9-12-9 12-9-7zM17 47h30"/>',
  fang: '<path d="M18 18h28l-4 10-5 18-5-14-5 14-5-18z"/>',
  sun: '<circle cx="32" cy="32" r="8"/><path d="M32 14v6M32 44v6M14 32h6M44 32h6M19.3 19.3l4.3 4.3M40.4 40.4l4.3 4.3M19.3 44.7l4.3-4.3M40.4 23.6l4.3-4.3"/>',
};

/** A standalone SVG document of the bot's coin portrait (used as a texture in 3D). */
export function avatarSvg(bot: Pick<BotProfile, "colors" | "sigil">, size = 256): string {
  const [inner, outer] = bot.colors;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
<defs>
<radialGradient id="bg" cx="0.35" cy="0.3" r="0.85"><stop offset="0" stop-color="${inner}"/><stop offset="0.55" stop-color="${outer}"/><stop offset="1" stop-color="#0a0705"/></radialGradient>
<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9b8" stop-opacity="0.9"/><stop offset="1" stop-color="${outer}" stop-opacity="0.6"/></linearGradient>
</defs>
<circle cx="32" cy="32" r="32" fill="url(#bg)"/>
<circle cx="32" cy="32" r="31" fill="none" stroke="url(#rim)" stroke-width="1.4"/>
<ellipse cx="26" cy="20" rx="14" ry="7" fill="#fff" opacity="0.12"/>
<g fill="none" stroke="#fff6e8" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.95">${SIGIL_SVG[bot.sigil]}</g>
</svg>`;
}
