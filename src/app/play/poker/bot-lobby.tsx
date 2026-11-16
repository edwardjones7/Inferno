"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { BotAvatar, TierBadge } from "@/components/bot-avatar";
import { IconLock, IconTrophy } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { isUnlocked, MATCH, ROSTER, STYLE_BLURB, STYLE_LABEL, type BotProfile } from "@/lib/poker/roster";
import { expected } from "@/lib/rating";
import { play } from "@/lib/sound";
import { useHydrated, useProgress } from "@/lib/store";

export function BotLobby() {
  const p = useProgress();
  const hydrated = useHydrated();
  const firstOpen = ROSTER.find((b) => !p.beaten.includes(b.id) && isUnlocked(b.id, p.beaten)) ?? ROSTER[0];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = ROSTER.find((b) => b.id === (selectedId ?? firstOpen.id))!;
  const open = isUnlocked(selected.id, p.beaten);
  const record = p.matches.filter((m) => m.botId === selected.id);
  const wins = record.filter((m) => m.result === "win").length;
  const losses = record.filter((m) => m.result === "loss").length;
  const you = p.ratings.poker.r;
  const odds = Math.round(expected(you, selected.rating) * 100);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-5 sm:px-6 lg:pt-10">
      <PageHeader eyebrow="Texas Hold'em" title="Choose your opponent">
        <Link href="/play/poker/table/" className="btn-ash rounded-xl px-4 py-2 text-sm font-bold">
          6-max table →
        </Link>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        {/* roster */}
        <div className="grid grid-cols-2 content-start gap-2.5 sm:grid-cols-4">
          {ROSTER.map((b) => {
            const unlocked = isUnlocked(b.id, p.beaten);
            const beaten = p.beaten.includes(b.id);
            const on = b.id === selected.id;
            return (
              <button
                key={b.id}
                onClick={() => {
                  setSelectedId(b.id);
                  play("click");
                }}
                aria-pressed={on}
                className={`panel pressable relative flex flex-col items-center rounded-3xl px-2 py-4 text-center transition-all ${
                  on ? "ring-2 ring-ember-400 shadow-[0_0_40px_-12px_rgba(255,90,31,0.8)]" : ""
                }`}
              >
                <BotAvatar bot={b} size={64} dim={hydrated && !unlocked} />
                {hydrated && !unlocked && (
                  <span className="absolute right-3 top-3 text-ash-500">
                    <IconLock className="h-4 w-4" />
                  </span>
                )}
                {beaten && (
                  <span className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full bg-ember-500 text-ash-950">
                    <IconTrophy className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="mt-2 font-display text-sm font-bold">{b.name}</span>
                <span className="tabular text-xs text-ash-400">{b.rating}</span>
              </button>
            );
          })}
        </div>

        {/* selected bot */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <AnimatePresence mode="wait">
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="panel relative overflow-hidden rounded-[28px] p-5 sm:p-6"
            >
              <div
                className="absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-40 blur-2xl"
                style={{ background: `radial-gradient(closest-side, ${selected.colors[1]}, transparent)` }}
              />
              <div className="relative flex items-center gap-4">
                <BotAvatar bot={selected} size={88} ring />
                <div className="min-w-0">
                  <TierBadge tier={selected.tier} />
                  <h2 className="mt-1.5 font-display text-2xl font-black leading-none">{selected.name}</h2>
                  <p className="mt-1 text-sm text-ash-400">{selected.title}</p>
                </div>
              </div>

              <SpeechBubble bot={selected} />

              <dl className="relative mt-5 grid grid-cols-3 gap-2 text-center">
                <Fact label="Rating" value={String(selected.rating)} />
                <Fact label="Style" value={STYLE_LABEL[selected.style]} small />
                <Fact label="Your odds" value={hydrated ? `${odds}%` : "–"} />
              </dl>
              <p className="relative mt-4 text-sm leading-relaxed text-ash-300">{selected.bio}</p>
              <p className="relative mt-2 text-xs text-ash-500">{STYLE_BLURB[selected.style]}</p>

              {hydrated && record.length > 0 && (
                <div className="relative mt-4 rounded-2xl bg-ash-950/60 p-3 ring-1 ring-ash-700/70">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ember-400">Coach&apos;s tip</p>
                  <p className="mt-1 text-xs leading-relaxed text-ash-300">{selected.tell}</p>
                  <p className="tabular mt-2 text-[11px] text-ash-500">
                    Your record: {wins}W · {losses}L{record.length - wins - losses ? ` · ${record.length - wins - losses}D` : ""}
                  </p>
                </div>
              )}

              <div className="relative mt-5">
                {open || !hydrated ? (
                  <Link
                    href={`/play/poker/match/?bot=${selected.id}`}
                    onClick={() => play("chip")}
                    className="btn-fire flex h-14 items-center justify-center rounded-2xl font-display text-sm font-bold uppercase tracking-wider"
                  >
                    Play {selected.name}
                  </Link>
                ) : (
                  <div className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-ash-850 text-sm font-bold text-ash-400 ring-1 ring-ash-700">
                    <IconLock className="h-4 w-4" />
                    Beat {ROSTER[ROSTER.findIndex((b) => b.id === selected.id) - 1]?.name} to unlock
                  </div>
                )}
                <p className="mt-2 text-center text-[11px] text-ash-500">
                  Heads-up · {MATCH.stack / 10} big blinds · up to {MATCH.hands} hands · blinds rise every {MATCH.levelEvery}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-2xl bg-ash-950/50 px-2 py-2.5 ring-1 ring-ash-800">
      <dt className="text-[9px] font-bold uppercase tracking-[0.16em] text-ash-500">{label}</dt>
      <dd className={`tabular mt-1 font-display font-bold ${small ? "text-[11px] leading-tight" : "text-lg leading-none"}`}>{value}</dd>
    </div>
  );
}

function SpeechBubble({ bot }: { bot: BotProfile }) {
  return (
    <div className="relative mt-4 w-fit max-w-full rounded-2xl rounded-tl-sm bg-bone px-3.5 py-2 text-sm font-semibold text-ash-950 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.8)]">
      {bot.lines.greet[0]}
    </div>
  );
}
