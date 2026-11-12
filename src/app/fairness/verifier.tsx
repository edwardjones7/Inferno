"use client";

import { useMemo, useState } from "react";
import { PlayingCard } from "@/components/playing-card";
import { fairShoe, sha256Hex } from "@/lib/blackjack/fair";

export function Verifier({ initial }: { initial: { server: string; client: string; nonce: string } }) {
  const [server, setServer] = useState(initial.server);
  const [client, setClient] = useState(initial.client);
  const [nonce, setNonce] = useState(initial.nonce || "0");

  const n = Number(nonce);
  const valid = server.length > 0 && client.length > 0 && Number.isInteger(n) && n >= 0;
  const result = useMemo(() => {
    if (!valid) return null;
    return { hash: sha256Hex(server), shoe: fairShoe(server, client, n).slice(0, 16) };
  }, [server, client, n, valid]);

  return (
    <div className="panel rounded-3xl p-5">
      <h2 className="font-display text-sm font-bold">Verify a hand</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_110px]">
        <Input label="Server seed (revealed)" value={server} onChange={setServer} />
        <Input label="Client seed" value={client} onChange={setClient} />
        <Input label="Nonce" value={nonce} onChange={(v) => setNonce(v.replace(/\D/g, ""))} />
      </div>

      {result ? (
        <div className="mt-5">
          <p className="text-xs text-ash-500">sha256(server seed). Compare this with the hash you were shown:</p>
          <p className="tabular mt-1 break-all rounded-lg bg-ash-950/70 px-3 py-2 text-xs text-ember-200 ring-1 ring-ash-800">{result.hash}</p>

          <p className="mt-5 text-xs text-ash-500">
            Top of the shoe. Deal order is <span className="text-ash-300">you, dealer, you, dealer (hole)</span>, then hits, doubles,
            split cards and dealer draws in the order they happen.
          </p>
          <div key={`${server}:${client}:${n}`} className="mt-3 flex flex-wrap gap-2">
            {result.shoe.map((c, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <PlayingCard card={c} delay={i * 0.04} />
                <span className="tabular text-[10px] text-ash-500">
                  {i}
                  {i < 4 ? ` · ${["you", "dealer", "you", "hole"][i]}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-ash-700 px-4 py-10 text-center text-sm text-ash-400">
          Enter a revealed server seed, your client seed and the hand&apos;s nonce. Or use a &ldquo;Verify&rdquo; link from your hand history.
        </p>
      )}
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs">
      <span className="text-ash-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="tabular mt-1 h-10 w-full rounded-lg border border-ash-600/70 bg-ash-950 px-3 text-sm text-bone outline-none focus:border-ember-500"
      />
    </label>
  );
}
