"use client";

import Link from "next/link";
import { IconCheck, IconChevron, IconLock, IconSpade, IconTrain } from "@/components/icons";
import { ProBadge } from "@/components/pro/pro-badge";
import { PageHeader, Ring } from "@/components/ui";
import { lessonLocked, paywallReason } from "@/lib/gates";
import { lessonDone, lessonUnlocked, nextLesson, TRACK_IDS, TRACKS, trackProgress, type TrackId } from "@/lib/learn";
import { openPaywall, useIsPro } from "@/lib/pro";
import { play } from "@/lib/sound";
import { useHydrated, useProgress } from "@/lib/store";
import { LessonArt } from "./lesson-art";

export function LearnPath() {
  const p = useProgress();
  const hydrated = useHydrated();
  const all = TRACK_IDS.map((t) => trackProgress(p, t));
  const done = hydrated ? all.reduce((n, t) => n + t.done, 0) : 0;
  const total = all.reduce((n, t) => n + t.total, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-5 sm:px-6 lg:pt-10">
      <PageHeader eyebrow="Train · Learn" title="Learn the why, then drill it">
        <p className="tabular text-xs font-semibold text-ash-400">
          {hydrated ? `${done} of ${total} lessons done` : " "}
        </p>
      </PageHeader>
      <p className="-mt-2 mb-6 max-w-xl text-sm text-ash-400">
        Short lessons, each two to four minutes: a few screens on one idea, quick questions as you go, then a drill to lock it in. Each lesson opens the next.
      </p>

      <div className="grid gap-6 md:grid-cols-2 md:gap-5">
        {TRACK_IDS.map((t) => (
          <TrackColumn key={t} track={t} hydrated={hydrated} />
        ))}
      </div>
    </div>
  );
}

function TrackColumn({ track, hydrated }: { track: TrackId; hydrated: boolean }) {
  const p = useProgress();
  const pro = useIsPro();
  const info = TRACKS[track];
  const { done, total } = trackProgress(p, track);
  const next = hydrated ? nextLesson(p, track) : null;
  const icon = track === "poker" ? <IconSpade className="h-6 w-6" /> : <IconTrain className="h-6 w-6" />;

  return (
    <section>
      <div className="panel relative overflow-hidden rounded-[28px] p-5">
        <LessonArt id={(next ?? info.lessons[0]).id} variant="backdrop" />
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgba(255,90,31,0.22),transparent)]" />
        <div className="relative flex items-center gap-4">
          <Ring value={hydrated ? done / total : 0} size={64} stroke={6}>
            <span className="text-ember-300">{icon}</span>
          </Ring>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-black">{info.title}</h2>
            <p className="text-xs text-ash-400">{info.blurb}</p>
            <p className="tabular mt-1 text-[11px] font-bold text-ember-400">{hydrated ? `${done}/${total} done` : " "}</p>
          </div>
        </div>
        {hydrated && next && lessonLocked(next.id, pro) ? (
          <button
            onClick={() => {
              play("click");
              openPaywall(paywallReason.lesson(next.id));
            }}
            className="btn-fire relative mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold"
          >
            <span className="truncate">Next: {next.title}</span>
            <ProBadge className="bg-ash-950/30 text-bone ring-ash-950/40" />
          </button>
        ) : hydrated && (
          <Link
            href={next ? `/train/learn/${next.id}/` : `/train/learn/${info.lessons[0].id}/`}
            className={`relative mt-4 flex h-11 items-center justify-center gap-1 rounded-xl text-sm font-bold ${next ? "btn-fire" : "btn-ash"}`}
          >
            {next ? (done ? `Continue: ${next.title}` : `Start: ${next.title}`) : "Track complete · review from the start"}
            <IconChevron className="h-4 w-4 shrink-0" />
          </Link>
        )}
      </div>

      <ol className="relative mt-3">
        {info.lessons.map((l, i) => {
          const isDone = hydrated && lessonDone(p, l.id);
          const open = hydrated && lessonUnlocked(p, l.id);
          const proLocked = hydrated && lessonLocked(l.id, pro);
          const current = !!next && next.id === l.id;
          const last = i === info.lessons.length - 1;
          const body = (
            <>
              <span className="relative flex flex-col items-center self-stretch">
                <span
                  className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-sm font-bold ring-1 ${
                    isDone
                      ? "bg-ember-500 text-ash-950 ring-ember-300"
                      : current
                        ? "bg-ash-900 text-ember-300 ring-2 ring-ember-500 shadow-[0_0_18px_-4px_rgba(255,90,31,0.9)]"
                        : open
                          ? "bg-ash-900 text-bone ring-ash-600"
                          : "bg-ash-900 text-ash-600 ring-ash-800"
                  }`}
                >
                  {isDone ? <IconCheck className="h-4 w-4" /> : open ? i + 1 : <IconLock className="h-3.5 w-3.5" />}
                </span>
                {!last && <span className={`w-px flex-1 ${isDone ? "bg-ember-500/60" : "bg-ash-800"}`} />}
              </span>
              <span className={`min-w-0 flex-1 pb-5 ${open ? "" : "opacity-50"}`}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`text-sm font-bold ${current ? "text-ember-200" : "text-bone"}`}>{l.title}</span>
                    {proLocked && <ProBadge />}
                  </span>
                  <span className="tabular shrink-0 text-[11px] text-ash-500">{l.minutes} min</span>
                </span>
                <span className="mt-0.5 block text-xs text-ash-400">{l.blurb}</span>
              </span>
              <LessonArt id={l.id} variant="thumb" className={`mt-1 ${open && !proLocked ? "" : "opacity-40 grayscale"}`} />
              {open && !proLocked && <IconChevron className="mt-2 h-4 w-4 shrink-0 text-ash-500" />}
            </>
          );
          return (
            <li key={l.id}>
              {proLocked ? (
                // Pro lessons stay visible; tapping one says what Pro adds
                <button
                  onClick={() => {
                    play("click");
                    openPaywall(paywallReason.lesson(l.id));
                  }}
                  className="flex w-full gap-3 rounded-2xl px-2 pt-2 text-left transition-colors hover:bg-ash-900/70"
                >
                  {body}
                </button>
              ) : open ? (
                <Link href={`/train/learn/${l.id}/`} className="flex gap-3 rounded-2xl px-2 pt-2 transition-colors hover:bg-ash-900/70">
                  {body}
                </Link>
              ) : (
                <div className="flex gap-3 px-2 pt-2" aria-disabled>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
