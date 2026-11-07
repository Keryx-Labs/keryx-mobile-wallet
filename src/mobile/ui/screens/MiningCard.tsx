import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../WalletProvider";
import { formatKrx } from "../kit";
import { BPS_DIVISOR } from "../../mining";
import type { MiningStats } from "../../wallet/mobileWallet";

// Mining insight for miner mode: a compact summary of mined rewards plus the HOLDER-REWARD keep rate
// (are you keeping the full reward or burning part of it by not holding enough KRX?). The keep rate is
// computed with the node's exact bracket formula; production is estimated from recent coinbase UTXOs,
// so the rate is shown as an estimate. Collapsed by default; tap to expand the breakdown.

function pct(bps: number): string {
  return `${Math.round((bps / BPS_DIVISOR) * 100)}%`;
}

export function MiningCard() {
  const app = useApp();
  const [s, setS] = useState<MiningStats | null>(null);
  const [open, setOpen] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const r = await app.miningStats();
      if (alive.current) setS(r);
    } catch {
      /* leave last known; refreshed on next mount */
    }
  }, [app]);

  useEffect(() => {
    alive.current = true;
    void load();
    const id = setInterval(() => void load(), 120_000);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [load]);

  if (!s) return null;

  const keep = s.holderKeepBps;
  const full = keep >= BPS_DIVISOR;
  const keepColor = full ? "text-keryx-green" : keep >= 8000 ? "text-keryx-warn" : "text-keryx-error";
  const barColor = full ? "bg-keryx-cta" : keep >= 8000 ? "bg-keryx-warn" : "bg-keryx-error";
  const extraNeeded =
    s.next && s.next.needBalanceSompi > s.balanceSompi ? s.next.needBalanceSompi - s.balanceSompi : 0n;

  return (
    <button
      onClick={() => setOpen((v) => !v)}
      className="border border-keryx-border flex w-full flex-col gap-2 rounded bg-keryx-surface px-4 py-3 text-left active:scale-[0.99] hover:border-keryx-borderHi"
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-keryx-green">Mining</span>
        <span className="text-xs text-keryx-dim">{s.rewardCoins.toLocaleString()} rewards</span>
        <span className="flex-1" />
        <span className="text-xs text-keryx-dim">keep</span>
        <span className={`text-sm font-semibold ${keepColor}`}>{pct(keep)}</span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-keryx-border/60">
        <div className={`h-full ${barColor}`} style={{ width: `${(keep / BPS_DIVISOR) * 100}%` }} />
      </div>

      {open && (
        <div className="mt-1 flex flex-col gap-2 border-t border-keryx-border pt-2 text-xs">
          <div className="flex justify-between">
            <span className="text-keryx-dim">Mined (last 24h)</span>
            <span className="font-mono text-keryx-ink">{formatKrx(s.minedInWindowSompi)} KRX</span>
          </div>
          {s.maturingCoins > 0 && (
            <div className="flex justify-between">
              <span className="text-keryx-dim">Still maturing</span>
              <span className="font-mono text-keryx-ink">{s.maturingCoins.toLocaleString()} coins</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-keryx-dim">Holder keep rate</span>
            <span className={`font-mono ${keepColor}`}>{pct(keep)}</span>
          </div>
          {full ? (
            <div className="text-keryx-green/90">
              You're holding enough to keep the full mining reward.
            </div>
          ) : (
            <div className="text-keryx-dim">
              {pct(BPS_DIVISOR - keep)} of your mining reward is burning. Hold{" "}
              <span className="text-keryx-ink">≈ {formatKrx(extraNeeded)} KRX</span> more to reach{" "}
              {s.next ? pct(s.next.keepBps) : "100%"}.
            </div>
          )}
          <div className="text-[11px] text-keryx-dim">
            Estimate · holder-reward only (excludes your GPU tier factor).
          </div>
        </div>
      )}
    </button>
  );
}
