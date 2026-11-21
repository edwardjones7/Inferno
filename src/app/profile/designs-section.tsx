"use client";

import { useEffect, useMemo, useRef } from "react";
import { IconCheck, IconLock } from "@/components/icons";
import { ProBadge } from "@/components/pro/pro-badge";
import { SectionTitle } from "@/components/ui";
import { cardBackUrl } from "@/game/designs/card-backs";
import { flatColors } from "@/game/designs/felt-looks";
import { CARD_BACKS, cosmeticById, FELTS, type CardBackId, type Cosmetic, type FeltId } from "@/lib/cosmetics";
import { canUseCosmetic, cosmeticIsPro, paywallReason } from "@/lib/gates";
import { openPaywall, PRO_NAME, useIsPro } from "@/lib/pro";
import { useBackChoice, useFeltChoice, useTableLook } from "@/lib/settings";
import { play } from "@/lib/sound";

/**
 * "Table & cards" on the profile: pick the felt and the card back. Member designs show a
 * lock for free players and open the paywall. The saved choice survives a lapsed
 * membership; the tables draw the free default until Pro is back.
 */
export function DesignsSection() {
  const pro = useIsPro();
  const look = useTableLook();
  const [feltChoice, setFelt] = useFeltChoice();
  const [backChoice, setBack] = useBackChoice();
  const ref = useRef<HTMLElement>(null);
  // the page renders after hydration, so the browser can't jump to #designs by itself
  useEffect(() => {
    if (location.hash === "#designs") ref.current?.scrollIntoView({ block: "start" });
  }, []);
  const parked = [feltChoice, backChoice].filter((id) => !canUseCosmetic(id, pro)).map((id) => cosmeticById(id)?.name);

  const pick = (c: Cosmetic) => {
    play("click");
    if (!canUseCosmetic(c.id, pro)) return openPaywall(paywallReason.design(c.id));
    if (c.kind === "felt") setFelt(c.id as FeltId);
    else setBack(c.id as CardBackId);
  };

  return (
    <section ref={ref} id="designs" className="mt-8 scroll-mt-24">
      <SectionTitle title="Table & cards" />
      <div className="panel rounded-3xl p-4 sm:p-5">
        <p className="caps-label">Table</p>
        <div role="radiogroup" aria-label="Table design" className="mt-2.5 grid grid-cols-3 gap-2.5 sm:gap-3">
          {FELTS.map((f) => (
            <Tile key={f.id} item={f} on={look.felt === f.id} pro={pro} onPick={pick}>
              <FeltSwatch id={f.id} back={look.back} />
            </Tile>
          ))}
        </div>

        <p className="caps-label mt-5">Card backs</p>
        <div role="radiogroup" aria-label="Card back design" className="mt-2.5 grid grid-cols-3 gap-2.5 sm:gap-3">
          {CARD_BACKS.map((b) => (
            <Tile key={b.id} item={b} on={look.back === b.id} pro={pro} onPick={pick}>
              <BackSwatch id={b.id} felt={look.felt} />
            </Tile>
          ))}
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-ash-500">
          {parked.length > 0
            ? `${parked.join(" and ")} ${parked.length > 1 ? "are" : "is"} saved for when you rejoin ${PRO_NAME}. Until then the tables use the house designs.`
            : `Member designs come with ${PRO_NAME}. Looks only: every table plays the same.`}
        </p>
      </div>
    </section>
  );
}

function Tile({ item, on, pro, onPick, children }: { item: Cosmetic; on: boolean; pro: boolean; onPick: (c: Cosmetic) => void; children: React.ReactNode }) {
  const members = cosmeticIsPro(item.id);
  const locked = members && !pro;
  return (
    <button
      role="radio"
      aria-checked={on}
      aria-label={`${item.name}${locked ? `, needs ${PRO_NAME}` : ""}`}
      title={item.blurb}
      onClick={() => onPick(item)}
      className={`pressable group relative flex flex-col overflow-hidden rounded-2xl bg-ash-950/60 text-left ring-1 transition-shadow ${
        on ? "ring-ember-400/80 shadow-[0_0_24px_-8px_rgba(255,90,31,0.8)]" : "ring-brass-500/30 hover:ring-brass-300/60"
      }`}
    >
      <span className="relative block">
        {children}
        {locked && (
          <span className="absolute inset-0 grid place-items-center bg-ash-950/45">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-ash-950/80 text-brass-200 ring-1 ring-brass-400/60">
              <IconLock className="h-4 w-4" />
            </span>
          </span>
        )}
        {on && (
          <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ember-500 text-ash-950 ring-2 ring-ash-950/70">
            <IconCheck className="h-3 w-3" />
          </span>
        )}
      </span>
      <span className="flex min-h-9 items-center justify-between gap-1 px-2.5 py-2">
        <span className={`truncate font-display text-[13px] ${on ? "text-bone" : "text-brass-100"}`}>{item.name}</span>
        {members && <ProBadge />}
      </span>
    </button>
  );
}

/** The table from above in CSS: leather rail, metal trim, the cloth and a printed ring, with two cards dealt. */
function FeltSwatch({ id, back }: { id: FeltId; back: CardBackId }) {
  const c = flatColors(id);
  const url = useMemo(() => cardBackUrl(back, 96), [back]);
  return (
    <span className="block aspect-[4/3] p-2" style={{ background: "radial-gradient(ellipse at 50% 40%, #2b2019, #0e0a08 75%)" }}>
      <span
        className="relative block h-full w-full rounded-[44%/52%]"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 42%, ${c.hi}, ${c.mid} 55%, ${c.lo})`,
          boxShadow: `0 0 0 1.5px ${c.trim}, 0 0 0 6px ${c.rail}, 0 0 0 7px ${c.trim}88, 0 8px 16px -6px #000, inset 0 0 18px rgb(0 0 0 / 0.55)`,
        }}
      >
        <span className="absolute left-1/2 top-[54%] h-[34%] w-[26%] -translate-x-1/2 rounded-full border-2" style={{ borderColor: c.ink }} />
        <span className="absolute left-1/2 top-[16%] flex -translate-x-1/2">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
          <img src={url} alt="" className="h-7 w-5 -rotate-6 rounded-[2px] shadow-[0_2px_4px_rgb(0_0_0/0.6)]" />
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
          <img src={url} alt="" className="-ml-2 h-7 w-5 rotate-6 rounded-[2px] shadow-[0_2px_4px_rgb(0_0_0/0.6)]" />
        </span>
      </span>
    </span>
  );
}

/** The back itself, standing on the current cloth. */
function BackSwatch({ id, felt }: { id: CardBackId; felt: FeltId }) {
  const c = flatColors(felt);
  const url = useMemo(() => cardBackUrl(id, 160), [id]);
  return (
    <span className="grid aspect-[4/3] place-items-center" style={{ background: `radial-gradient(ellipse at 50% 35%, ${c.mid}, ${c.lo} 80%)` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
      <img src={url} alt="" className="h-[78%] w-auto rounded-[4px] shadow-[0_6px_14px_-4px_rgb(0_0_0/0.85),0_0_0_1px_rgb(0_0_0/0.4)]" />
    </span>
  );
}
