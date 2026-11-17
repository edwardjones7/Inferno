/**
 * A full-bleed noir scene behind a card's content, faded from the bottom so text set over it
 * reads. `base` is the path without the width suffix: `/tables/blackjack` serves
 * `/tables/blackjack-640.webp` and `-1280.webp` (both 16:9). Fills its (relative) parent.
 */
export function SceneArt({ base, className = "", position = "50% 35%" }: { base: string; className?: string; position?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 ${className}`}>
      {/* static export with pre-sized webp files and our own srcSet, so next/image adds nothing */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${base}-640.webp`}
        srcSet={`${base}-640.webp 640w, ${base}-1280.webp 1280w`}
        sizes="(min-width: 1024px) 960px, 100vw"
        alt=""
        decoding="async"
        className="h-full w-full object-cover"
        style={{ objectPosition: position }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ash-950 via-ash-950/40 to-ash-950/0" />
      <div className="absolute inset-0 bg-gradient-to-r from-ash-950/75 via-transparent to-transparent" />
      <div className="absolute inset-0 shadow-[inset_0_0_80px_rgba(0,0,0,0.6)]" />
    </div>
  );
}
