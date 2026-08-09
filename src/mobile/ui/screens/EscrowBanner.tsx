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
  const [asking, setAsking] = useState(false);
  const [pw, setPw] = useState("");
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

  const run = async (password?: string) => {
    setBusy(true);
    setMsg("");
    try {
      const r =
        password !== undefined
          ? await app.reclaimEscrows(password)
          : await app.reclaimEscrowsWithBiometric();
      setPw("");
      setAsking(false);
      setMsg(r.count > 0 ? `Reclaimed ${formatKrx(r.reclaimedSompi)} KRX` : "Nothing matured yet.");
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(m)) setMsg(m.length > 48 ? "Couldn't reclaim" : m);
    } finally {
      setBusy(false);
    }
  };

  const onReclaim = () => {
    if (app.biometricEnabled) void run();
    else setAsking(true);
  };

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <div className="text-sm font-medium text-amber-200">Reward escrow</div>
      <div className="mt-0.5 text-xs text-slate-400">
        {formatKrx(sum.totalSompi)} KRX is held from your AI requests and returns to you after its
        lock (~1h).{sum.maturedSompi > 0n ? ` ${formatKrx(sum.maturedSompi)} KRX is ready now.` : ""}
      </div>
      {sum.maturedCount > 0 && !asking && (
        <button
          disabled={busy}
          onClick={onReclaim}
          className="mt-2 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-200 disabled:opacity-60"
        >
          {busy ? "Reclaiming…" : `Reclaim ${formatKrx(sum.maturedSompi)} KRX`}
        </button>
      )}
      {asking && (
        <div className="mt-2 flex gap-2">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Password"
            className="flex-1 rounded-xl bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/60 focus:ring-2"
          />
          <button
            disabled={busy || !pw}
            onClick={() => void run(pw)}
            className="rounded-xl bg-amber-500/20 px-3 text-xs font-medium text-amber-200 disabled:opacity-60"
          >
            Reclaim
          </button>
        </div>
      )}
      {msg && <div className="mt-1 text-xs text-slate-500">{msg}</div>}
    </div>
  );
}
