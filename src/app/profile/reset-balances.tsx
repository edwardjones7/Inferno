"use client";

import { useState } from "react";
import { toast } from "sonner";
import { resetBalancesAction } from "@/app/actions";
import { useWallet } from "@/components/wallet-provider";
import { formatUsd, STARTING_USD } from "@/lib/currency";

export function ResetBalances() {
  const { setWallet } = useWallet();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {armed && <span className="text-xs text-ash-400">Reset every coin to {formatUsd(STARTING_USD)}?</span>}
      <button
        disabled={busy}
        onClick={async () => {
          if (!armed) return setArmed(true);
          setBusy(true);
          const res = await resetBalancesAction();
          setBusy(false);
          setArmed(false);
          if (!res.ok) return void toast.error(res.error);
          setWallet(res.data.wallet);
          toast.success("Balances reset. Back in the fire.");
        }}
        className={`h-10 rounded-xl px-4 text-sm font-bold ${armed ? "btn-fire" : "btn-ash"}`}
      >
        {armed ? "Yes, reset" : "Reset paper balances"}
      </button>
      {armed && (
        <button onClick={() => setArmed(false)} className="btn-ash h-10 rounded-xl px-3 text-sm">
          Cancel
        </button>
      )}
    </div>
  );
}
