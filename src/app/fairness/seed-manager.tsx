"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { rotateSeedsAction } from "@/app/actions";
import type { Fairness } from "@/server/casino";

interface Revealed {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  handsPlayed: number;
}

export function SeedManager({ initial, handInProgress }: { initial: Fairness; handInProgress: boolean }) {
  const router = useRouter();
  const [fair, setFair] = useState(initial);
  const [clientSeed, setClientSeed] = useState(initial.clientSeed);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [busy, setBusy] = useState(false);

  const rotate = async () => {
    setBusy(true);
    const res = await rotateSeedsAction(clientSeed.trim() === fair.clientSeed ? undefined : clientSeed);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    setRevealed(res.data.revealed);
    setFair(res.data.fairness);
    setClientSeed(res.data.fairness.clientSeed);
    toast.success("Seeds rotated. Previous server seed revealed.");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="panel rounded-3xl p-5">
        <h2 className="font-display text-sm font-bold">Your active seeds</h2>
        <dl className="mt-4 space-y-3 text-xs">
          <Row label="Server seed (sha256)" value={fair.serverSeedHash} />
          <div>
            <label htmlFor="client-seed" className="text-ash-500">
              Client seed
            </label>
            <input
              id="client-seed"
              value={clientSeed}
              maxLength={64}
              onChange={(e) => setClientSeed(e.target.value)}
              className="tabular mt-1 h-10 w-full rounded-lg border border-ash-600/70 bg-ash-950 px-3 text-sm text-bone outline-none focus:border-ember-500"
            />
          </div>
          <Row label="Hands on this pair (next nonce)" value={String(fair.nonce)} />
        </dl>
        <button
          onClick={rotate}
          disabled={busy || handInProgress}
          className="btn-fire mt-5 h-11 w-full rounded-xl text-sm font-bold"
        >
          {busy ? "Rotating…" : "Rotate seeds & reveal"}
        </button>
        {handInProgress && <p className="mt-2 text-xs text-ash-400">Finish your current hand before rotating.</p>}
      </div>

      {revealed && (
        <div className="panel animate-rise rounded-3xl p-5 ring-1 ring-ember-500/40">
          <h2 className="font-display text-sm font-bold text-ember-300">Revealed seed pair</h2>
          <dl className="mt-3 space-y-3 text-xs">
            <Row label="Server seed" value={revealed.serverSeed} />
            <Row label="Committed hash" value={revealed.serverSeedHash} />
            <Row label="Client seed" value={revealed.clientSeed} />
            <Row label="Hands dealt" value={`${revealed.handsPlayed} (nonces 0–${Math.max(0, revealed.handsPlayed - 1)})`} />
          </dl>
          {revealed.handsPlayed > 0 && (
            <button
              onClick={() =>
                router.push(
                  `/fairness?server=${revealed.serverSeed}&client=${encodeURIComponent(revealed.clientSeed)}&nonce=${revealed.handsPlayed - 1}`,
                  { scroll: false },
                )
              }
              className="btn-ash mt-4 h-10 w-full rounded-xl text-sm font-bold"
            >
              Verify last hand →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ash-500">{label}</dt>
      <dd className="tabular mt-1 break-all rounded-lg bg-ash-950/70 px-3 py-2 text-ash-200 ring-1 ring-ash-800">{value}</dd>
    </div>
  );
}
