import { lessonArt } from "@/lib/learn/art";

/**
 * Lesson hero art. `thumb` is the small frame on the Learn path, `hero` the cinematic banner
 * at the top of a lesson, `backdrop` fills its (relative) parent behind other content with a
 * left-to-right fade, `cover` fills it with a bottom-up fade for text set over the image.
 * Renders nothing when a lesson has no art.
 */
export function LessonArt({ id, variant, className = "" }: { id: string; variant: "thumb" | "hero" | "backdrop" | "cover"; className?: string }) {
  const art = lessonArt(id);
  if (!art) return null;

  const img = (
    // static export with pre-sized webp files and our own srcSet, so next/image adds nothing
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={art.src}
      srcSet={art.srcSet}
      sizes={variant === "thumb" ? "96px" : "(min-width: 672px) 640px, 100vw"}
      alt=""
      loading={variant === "hero" ? "eager" : "lazy"}
      decoding="async"
      className="h-full w-full object-cover object-[50%_30%]"
    />
  );

  if (variant === "backdrop")
    return (
      <div aria-hidden className={`pointer-events-none absolute inset-0 ${className}`}>
        {img}
        <div className="absolute inset-0 bg-gradient-to-r from-ash-950 via-ash-950/85 to-ash-950/30" />
      </div>
    );

  if (variant === "cover")
    return (
      <div aria-hidden className={`pointer-events-none absolute inset-0 ${className}`}>
        {img}
        <div className="absolute inset-0 bg-gradient-to-t from-ash-950 via-ash-950/70 to-ash-950/5" />
        <div className="absolute inset-0 shadow-[inset_0_0_60px_rgba(0,0,0,0.55)]" />
      </div>
    );

  if (variant === "thumb")
    return (
      <span aria-hidden className={`relative block aspect-video w-20 shrink-0 self-start sm:w-24 overflow-hidden rounded-lg ring-1 ring-ash-700 ${className}`}>
        {img}
      </span>
    );

  return (
    <div aria-hidden className={`relative mb-3 aspect-[16/7] overflow-hidden rounded-3xl ring-1 ring-ash-800 ${className}`}>
      {img}
      <div className="absolute inset-0 bg-gradient-to-t from-ash-950/80 via-transparent to-transparent" />
      <div className="absolute inset-0 shadow-[inset_0_0_60px_rgba(0,0,0,0.6)]" />
    </div>
  );
}
