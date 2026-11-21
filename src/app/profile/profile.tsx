"use client";

import { Capacitor } from "@capacitor/core";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { BotAvatar } from "@/components/bot-avatar";
import { IconFlame, IconTrophy } from "@/components/icons";
import { Eyebrow, Meter, Segmented, SectionTitle, Sparkline, Stat, Switch } from "@/components/ui";
import { showPrivacyChoices, usePrivacyChoicesAvailable } from "@/lib/ads";
import { MOVE_LABEL, type Move } from "@/lib/blackjack/strategy";
import { formatChips, unitsToChips } from "@/lib/chips";
import { POKER_DRILLS } from "@/lib/poker/drills";
import { ROSTER } from "@/lib/poker/roster";
import { ratingTitle } from "@/lib/rating";
import { autoQuality, HAPTICS_KEY, isToggle, useGraphics, type Graphics } from "@/lib/settings";
import { isMuted, onMuteChange, setMuted } from "@/lib/sound";
import { exportDataset, exportFileName } from "@/lib/decisions";
import { accuracy, getProgress, leaksOf, resetProgress, update, useHydrated, useProgress, type RatingKey } from "@/lib/store";
import { streakLength } from "@/lib/streak";
import { StreakSettings } from "./streak-section";
import { AccountSection } from "./account-section";
import { useStored } from "@/lib/use-stored";
import { DesignsSection } from "./designs-section";
import { DevProToggle, ProSection } from "./pro-section";

const RATING_LABEL: Record<RatingKey, string> = { poker: "Poker", blackjack: "Blackjack", training: "Training" };
const KIND_LABEL: Record<string, string> = { hard: "Hard totals", soft: "Soft totals", pair: "Pairs", insurance: "Insurance" };

export function Profile() {
  const p = useProgress();
  const hydrated = useHydrated();
  if (!hydrated) return <div className="mx-auto mt-10 h-96 max-w-5xl animate-pulse rounded-3xl bg-ash-900" />;

  const bjHands = p.bjRounds.length;
  const bjNet = unitsToChips(p.bjRounds.reduce((n, r) => n + r.payout - r.wagered, 0));
  const wins = p.matches.filter((m) => m.result === "win").length;
  const losses = p.matches.filter((m) => m.result === "loss").length;
  const streak = streakLength(p.streak);

  const bjDecisions = [...p.bjRounds.flatMap((r) => r.decisions), ...p.drills.filter((d) => d.game === "blackjack")];
  const kinds = ["hard", "soft", "pair", "insurance"].map((k) => {
    const rows = bjDecisions.filter((d) => d.kind === k);
    return { k, n: rows.length, acc: accuracy(rows) };
  });
  const pokerKinds = POKER_DRILLS.map((d) => {
    const rows = p.drills.filter((r) => r.game === "poker" && r.kind === d.id);
    return { k: d.label, n: rows.length, acc: accuracy(rows) };
  });
  const leaks = leaksOf(p, undefined, 8);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-5 sm:px-6 lg:pt-10">
      <div className="flex items-center gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-[linear-gradient(160deg,#c95c26,#7f2810)] font-display text-xl text-[#fff3df] shadow-[inset_0_0_0_3px_rgb(58_12_4/0.35),0_0_40px_-12px_rgba(255,90,31,0.8)] ring-1 ring-brass-300/60">
          {p.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <Eyebrow>Your File</Eyebrow>
          <h1 className="truncate font-display font-black tracking-tight text-[26px] leading-tight sm:text-4xl">{p.name}</h1>
          <p className="text-xs text-ash-400">
            Since {new Date(p.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })} ·{" "}
            <span className="inline-flex items-center gap-1 font-semibold text-ember-300">
              <IconFlame className="h-3 w-3" />
              {streak}-day streak
            </span>
          </p>
        </div>
      </div>

      {/* ratings */}
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        {(Object.keys(RATING_LABEL) as RatingKey[]).map((k) => {
          const r = p.ratings[k];
          return (
            <div key={k} className="panel rounded-3xl p-4 sm:p-5">
              <p className="caps-label">{RATING_LABEL[k]} rating</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="tabular font-display text-3xl font-black">{r.r}</span>
                <span className="text-xs font-bold text-ember-400">{ratingTitle(r.r)}</span>
              </div>
              <Sparkline points={r.history} className="mt-2 h-10 w-full" />
              <p className="tabular mt-1 text-[11px] text-ash-500">
                Peak {r.peak} · {r.games} {k === "poker" ? "matches" : "decisions"}
              </p>
            </div>
          );
        })}
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Bots beaten" value={`${p.beaten.length}/${ROSTER.length}`} hot={p.beaten.length > 0} />
        <Stat label="Matches" value={String(p.matches.length)} sub={`${wins}W · ${losses}L`} />
        <Stat label="Blackjack hands" value={String(bjHands)} sub={`${formatChips(bjNet, { sign: true, compact: true })} chips`} />
        <Stat label="Poker hands" value={String(p.pokerHands.length)} sub="last 150 kept" />
      </section>

      <ProSection />

      {/* trophy case */}
      <section className="mt-8">
        <SectionTitle title="Trophy case" href="/play/poker/" cta="Ladder" />
        <div className="panel no-scrollbar flex gap-4 overflow-x-auto rounded-3xl p-4">
          {ROSTER.map((b) => {
            const won = p.beaten.includes(b.id);
            return (
              <div key={b.id} className="flex w-16 shrink-0 flex-col items-center gap-1 text-center">
                <div className="relative">
                  <BotAvatar bot={b} size={52} dim={!won} />
                  {won && (
                    <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-ember-400 text-ash-950 ring-2 ring-ash-900">
                      <IconTrophy className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <span className={`text-[11px] font-bold ${won ? "text-bone" : "text-ash-600"}`}>{b.name}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* accuracy + leaks */}
      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="panel rounded-3xl p-5">
          <h2 className="font-display text-sm font-bold">Accuracy</h2>
          <p className="mt-0.5 text-xs text-ash-400">Live play and drills combined.</p>
          <p className="mt-4 eyebrow">Blackjack</p>
          <AccList rows={kinds.map((x) => ({ label: KIND_LABEL[x.k], n: x.n, acc: x.acc }))} />
          <p className="mt-4 eyebrow">Poker</p>
          <AccList rows={pokerKinds.map((x) => ({ label: x.k, n: x.n, acc: x.acc }))} />
        </div>

        <div className="panel rounded-3xl p-5">
          <h2 className="font-display text-sm font-bold">Biggest leaks</h2>
          <p className="mt-0.5 text-xs text-ash-400">The spots you miss most often.</p>
          {leaks.length === 0 ? (
            <p className="mt-6 text-center text-sm text-ash-500">No leaks found yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-ash-800">
              {leaks.map((l) => {
                const href = l.game === "poker" ? `/train/poker/?drill=${l.kind}` : l.key === "insurance" ? null : `/train/blackjack/?spot=${l.key}`;
                const right = l.game === "blackjack" ? (l.correct === "decline" ? "decline" : (MOVE_LABEL[l.correct as Move] ?? l.correct).toLowerCase()) : l.correct;
                return (
                  <li key={`${l.game}|${l.key}|${l.correct}`} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{l.key === "insurance" ? "Taking insurance" : l.label}</span>
                      <span className="block text-xs text-ash-400">Right play: {right}</span>
                    </span>
                    <span className="tabular text-xs text-ember-300">
                      {l.misses}/{l.seen}
                    </span>
                    {href && (
                      <Link href={href} className="btn-ash shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold">
                        Drill
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <DesignsSection />

      <StreakSettings />
      <AccountSection />
      <Settings />
    </div>
  );
}

function AccList({ rows }: { rows: { label: string; n: number; acc: number | null }[] }) {
  return (
    <ul className="mt-2 space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between text-xs">
            <span className="text-ash-300">{r.label}</span>
            <span className="tabular text-ash-400">{r.acc === null ? "–" : `${r.acc}% · ${r.n}`}</span>
          </div>
          <Meter value={r.acc ?? 0} className="mt-1" />
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ settings */

function Settings() {
  const p = useProgress();
  const [graphics, setGraphics] = useGraphics();
  const [haptics, setHaptics] = useStored(HAPTICS_KEY, "1", isToggle);
  const muted = useSyncExternalStore(onMuteChange, isMuted, () => false);
  const [name, setName] = useState(p.name);
  const [confirmReset, setConfirmReset] = useState(false);
  const privacyChoices = usePrivacyChoicesAvailable();
  const auto = useSyncExternalStore(
    () => () => {},
    () => autoQuality(),
    () => "high" as const,
  );

  const saveName = () => {
    const n = name.trim().slice(0, 24);
    if (!n || n === p.name) return setName(p.name);
    update((d) => {
      d.name = n;
    });
    toast.success("Name saved");
  };

  return (
    <section className="mt-8">
      <SectionTitle title="Settings" />
      <div className="panel divide-y divide-ash-800 rounded-3xl">
        <Row title="Display name" sub="Shown on your profile.">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            maxLength={24}
            aria-label="Display name"
            className="h-10 w-40 rounded-xl border border-ash-700 bg-ash-950 px-3 text-sm font-semibold text-bone outline-none focus:border-ember-500 sm:w-52"
          />
        </Row>
        <div className="px-4 py-4 sm:px-5">
          <p className="text-sm font-bold">Graphics</p>
          <p className="mb-3 text-xs text-ash-400">
            High adds bloom, depth of field and soft shadows. Low runs smoothly on phones.
            {graphics === "auto" && ` Auto picked ${auto} for this device.`}
          </p>
          <Segmented<Graphics>
            label="Graphics quality"
            value={graphics}
            onChange={setGraphics}
            options={[
              { id: "auto", label: "Auto" },
              { id: "high", label: "High" },
              { id: "low", label: "Low" },
            ]}
          />
        </div>
        <Row title="Sound" sub="Cards, chips and the fire ambience.">
          <Switch label="Sound" on={!muted} onChange={(v) => setMuted(!v)} />
        </Row>
        <Row title="Haptics" sub="Vibration on chips, wins and big moments (phones).">
          <Switch label="Haptics" on={haptics === "1"} onChange={(v) => setHaptics(v ? "1" : "0")} />
        </Row>
        {privacyChoices && (
          <Row title="Privacy choices" sub="Change how ads may use your data.">
            <button
              onClick={() => void showPrivacyChoices().catch(() => toast.error("Couldn't open privacy choices. Try again when online."))}
              className="btn-ash h-10 rounded-xl px-3 text-xs font-bold"
            >
              Manage
            </button>
          </Row>
        )}
        <DevProToggle />
        <Row title="Export history" sub={`Your graded decisions and hands as a JSON file (${p.decisions.length.toLocaleString()} decisions).`}>
          <button onClick={() => void exportHistory()} className="btn-ash h-10 rounded-xl px-3 text-xs font-bold">
            Export
          </button>
        </Row>
        <Row title="Reset progress" sub="Clears ratings, history, beaten bots and chips on this device.">
          {confirmReset ? (
            <div className="flex gap-2">
              <button onClick={() => setConfirmReset(false)} className="btn-ash h-10 rounded-xl px-3 text-xs font-bold">
                Cancel
              </button>
              <button
                onClick={() => {
                  resetProgress();
                  setConfirmReset(false);
                  toast("Progress reset");
                }}
                className="h-10 rounded-xl bg-ember-700 px-3 text-xs font-bold text-bone ring-1 ring-ember-400"
              >
                Reset
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmReset(true)} className="btn-ash h-10 rounded-xl px-3 text-xs font-bold">
              Reset…
            </button>
          )}
        </Row>
      </div>
      <p className="mt-4 text-center text-[11px] text-ash-600">Inferno is for practice and learning. Chips have no real-world value.</p>
      <p className="mt-2 flex justify-center gap-4 text-[11px] font-semibold text-ash-500">
        <Link href="/legal/privacy/" className="underline-offset-2 hover:text-bone hover:underline">
          Privacy policy
        </Link>
        <Link href="/legal/terms/" className="underline-offset-2 hover:text-bone hover:underline">
          Terms of use
        </Link>
      </p>
    </section>
  );
}

/**
 * Save the play history as JSON. Browsers download it; inside the app (no downloads in a
 * WebView) it goes to the share sheet, or to the clipboard where sharing files isn't supported.
 */
async function exportHistory() {
  const now = new Date();
  const json = JSON.stringify(exportDataset(getProgress(), now.getTime()));
  const name = exportFileName(now);
  if (Capacitor.isNativePlatform()) {
    const file = new File([json], name, { type: "application/json" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Inferno history" });
        return;
      }
      await navigator.clipboard.writeText(json);
      toast.success("History copied to the clipboard");
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error("Couldn't export your history");
    }
    return;
  }
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast.success("History exported");
}

function Row({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs text-ash-400">{sub}</p>
      </div>
      {children}
    </div>
  );
}
