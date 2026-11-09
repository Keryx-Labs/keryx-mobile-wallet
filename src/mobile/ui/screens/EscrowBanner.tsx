import { useCallback, useEffect, useState } from "react";
import { useApp } from "../WalletProvider";
import { formatKrx } from "../kit";

type Summary = { totalSompi: bigint; maturedSompi: bigint; count: number; maturedCount: number };

// Shows the inference reward currently held in AiRequest escrow and lets the user reclaim the matured
// part. Escrows also auto-sweep on the next AI request, so this is the explicit path plus reassurance
// that funds aren't stuck. Only renders when the wallet actually holds escrow.
export function EscrowBanner() {
  const app = useApp();
  const [sum, setSum] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      setSum(await app.escrowSummary());
    } catch {
      /* leave last known */
    }
  }, [app]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 120_000);
    return () => clearInterval(id);
  }, [load]);

  if (!sum || sum.count === 0) return null;

  const run = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await app.reclaimEscrows("");
      setMsg(r.count > 0 ? `Reclaimed ${formatKrx(r.reclaimedSompi)} KRX` : "Nothing matured yet.");
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(m)) setMsg(m.length > 48 ? "Couldn't reclaim" : m);
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="rounded border border-keryx-warn/30 bg-keryx-warn/10 px-4 py-3">
      <div className="text-sm font-medium text-keryx-warn">Reward escrow</div>
      <div className="mt-0.5 text-xs text-keryx-dim">
        {formatKrx(sum.totalSompi)} KRX is held from your AI requests and returns to you after its
        lock (~1h).{sum.maturedSompi > 0n ? ` ${formatKrx(sum.maturedSompi)} KRX is ready now.` : ""}
      </div>
      {sum.maturedCount > 0 && (
        <button
          disabled={busy}
          onClick={() => void run()}
          className="mt-2 rounded-full bg-keryx-warn/20 px-3 py-1 text-xs font-medium text-keryx-warn disabled:opacity-60"
        >
          {busy ? "Reclaiming…" : `Reclaim ${formatKrx(sum.maturedSompi)} KRX`}
        </button>
      )}
      {msg && <div className="mt-1 text-xs text-keryx-dim">{msg}</div>}
    </div>
  );
}
