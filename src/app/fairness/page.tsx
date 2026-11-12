import type { Metadata } from "next";
import { Suspense } from "react";
import { getTable } from "@/server/casino";
import { currentUserId } from "@/server/session";
import { SeedManager } from "./seed-manager";
import { Verifier } from "./verifier";

export const metadata: Metadata = { title: "Provably fair" };

export default function FairnessPage({ searchParams }: PageProps<"/fairness">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-ember-400">Provably fair</p>
      <h1 className="font-display text-3xl font-black sm:text-4xl">
        Don&apos;t trust us. <span className="molten-text">Check us.</span>
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ash-300">
        Every hand is dealt from a 6-deck shoe shuffled by a seed pair. You see a hash of our server seed before you play and you
        pick the client seed, so neither side can rig the shuffle. Rotate your seed at any time to reveal the old one and replay
        every hand it dealt.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
        <Suspense fallback={<div className="panel h-96 animate-pulse rounded-3xl" />}>
          <Seeds />
        </Suspense>
        <Suspense fallback={<div className="panel h-96 animate-pulse rounded-3xl" />}>
          <VerifierWithParams searchParams={searchParams} />
        </Suspense>
      </div>

      <section className="panel mt-8 rounded-3xl p-6">
        <h2 className="font-display text-lg font-bold">The algorithm</h2>
        <ol className="mt-4 grid gap-4 text-sm text-ash-300 md:grid-cols-3">
          <li>
            <Step n={1} title="Commit" />
            We generate a random 256-bit server seed and show you <code className="text-ember-300">sha256(serverSeed)</code> before
            any hand is dealt. We can&apos;t change it later without the hash changing.
          </li>
          <li>
            <Step n={2} title="Shuffle" />
            For hand number <em>nonce</em> we compute <code className="text-ember-300">HMAC_SHA256(serverSeed, clientSeed:nonce:i)</code>,
            turn each 4 bytes into a number in [0,1), and run a Fisher–Yates shuffle over 312 cards. Cards are dealt from the top.
          </li>
          <li>
            <Step n={3} title="Reveal" />
            When you rotate seeds, the old server seed is revealed. Hash it, compare with the commitment, and rebuild any shoe below,
            right here in your browser with the same code the server runs.
          </li>
        </ol>
      </section>
    </div>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <span className="mb-1.5 flex items-center gap-2 font-display text-sm font-bold text-bone">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-ember-500 text-xs text-ash-950">{n}</span>
      {title}
    </span>
  );
}

async function Seeds() {
  const userId = await currentUserId();
  if (!userId) return <div className="panel rounded-3xl p-5 text-sm text-ash-400">Enable cookies to get a seed pair.</div>;
  const { fairness, round } = await getTable(userId);
  return <SeedManager initial={fairness} handInProgress={!!round} />;
}

async function VerifierWithParams({ searchParams }: { searchParams: PageProps<"/fairness">["searchParams"] }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const initial = { server: one(sp.server), client: one(sp.client), nonce: one(sp.nonce) };
  // Keyed so following a new "Verify" link re-seeds the form.
  return <Verifier key={`${initial.server}:${initial.client}:${initial.nonce}`} initial={initial} />;
}
