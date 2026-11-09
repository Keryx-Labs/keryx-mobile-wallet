import { useCallback, useEffect, useState } from "react";
import { useApp } from "../WalletProvider";
import { Card, Toast, copy } from "../kit";
import { formatKrx } from "../format";
import { ConsolidateRow } from "./ConsolidateRow";
import { Consolidate } from "./Consolidate";
import { RATIO_REWARD_BPS_V3, RATIO_REWARD_THRESHOLDS_V3 } from "../../mining";
import type { HolderRewardStatus, ServiceStanding } from "../../chain";

// Every figure comes from the node through the gateway (holder-reward, service-strikes,
// inferences-served); nothing here is estimated on the device.

const POLL_MS = 60_000;
// Tier-reward schedule (node `TIER_REWARD_BPS_H6`) and the H14 lineup, for the tier mix only.
const TIER_BPS = [6_000, 7_000, 8_000, 9_000, 10_000];
const TIER_LABELS = ["Qwen3.5-9B", "GLM-4-9B", "Gemma-4-12B", "Qwen3.8-27B", "Kimi-48B"];
const LADDER_HELD = ["< 10 days", "10 days", "20 days", "1 month", "40 days", "50 days", "2 months", "70 days", "80 days", "3 months", "100 days", "110 days", "4 months"];
const DAA_PER_HOUR = 36_000n;

const pct = (bps: number) => `${Math.round(bps) / 100}%`;
const krx = (sompi: bigint) => formatKrx(sompi, 0);

function share(part: bigint, whole: bigint): number {
  return whole > 0n ? Number((part * 10_000n) / whole) : 0;
}

/** Tier bracket weighted by how much of the production came from each tier, in bps. */
function weightedTierBps(tierBase: bigint[]): number | null {
  const total = tierBase.reduce((n, v) => n + v, 0n);
  if (total === 0n) return null;
  const sum = tierBase.reduce((n, v, i) => n + v * BigInt(TIER_BPS[i] ?? 0), 0n);
  return Number(sum / total);
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "text-keryx-green" : tone === "warn" ? "text-keryx-warn" : tone === "bad" ? "text-keryx-error" : "text-keryx-ink";
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-keryx-dim">{k}</span>
      <span className={`text-right tabular-nums ${color}`}>{v}</span>
    </div>
  );
}

function Ladder({ currentBps, nextBps }: { currentBps: number; nextBps?: number }) {
  return (
    <div className="flex flex-col">
      {RATIO_REWARD_THRESHOLDS_V3.map((ratio, i) => {
        const bps = RATIO_REWARD_BPS_V3[i];
        const current = bps === currentBps;
        const next = bps === nextBps;
        return (
          <div
            key={ratio}
            className={`flex items-center gap-3 border-t border-keryx-border px-2 py-1.5 text-xs tabular-nums ${
              current ? "bg-keryx-green/10 ring-1 ring-keryx-green/60" : ""
            }`}
          >
            <span className={`w-14 shrink-0 ${current ? "text-keryx-bright" : "text-keryx-text"}`}>
              {ratio === 0 ? "< 10×" : `≥ ${ratio}×`}
            </span>
            <span className="w-20 shrink-0 text-keryx-dim">
              {LADDER_HELD[i]}
              {current && <span className="ml-1 text-keryx-bright">◀</span>}
              {next && <span className="ml-1 text-keryx-mid">next</span>}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-sm bg-keryx-green/[0.06]">
              <span
                className={`block h-full rounded-sm ${current ? "bg-keryx-bright" : "bg-keryx-dim/60"}`}
                style={{ width: `${bps / 100}%` }}
              />
            </span>
            <span className={`w-10 shrink-0 text-right font-semibold ${current ? "text-keryx-bright" : "text-keryx-green"}`}>
              {pct(bps)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Mining() {
  const app = useApp();
  const address = app.minerAddress;
  const [holder, setHolder] = useState<HolderRewardStatus | null>(null);
  const [standing, setStanding] = useState<ServiceStanding | null>(null);
  const [served, setServed] = useState<{ served: number; answered: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showLadder, setShowLadder] = useState(false);
  const [showConsolidate, setShowConsolidate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    try {
      const r = await app.minerStatus(address);
      setHolder(r.holder);
      setStanding(r.standing);
      setServed(r.served);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [app, address]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  if (!address) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-5 pb-28">
        <div className="glow text-lg font-semibold text-keryx-bright">Mining</div>
        <Card>
          <div className="text-sm text-keryx-dim">None of this wallet's addresses has mined a block in the last 24 hours.</div>
        </Card>
      </div>
    );
  }

  const inc = holder?.income ?? null;
  const tierBps = inc ? weightedTierBps(inc.tierBaseSompi) : null;
  const keptBps = inc ? share(inc.paidSompi, inc.baseSompi) : null;
  const progress =
    holder?.next && holder.next.targetBalanceSompi > 0n ? Math.min(100, share(holder.balanceSompi, holder.next.targetBalanceSompi) / 100) : 100;
  const suspendedHours =
    standing?.suspendedUntilDaaScore != null && standing.suspendedUntilDaaScore > standing.virtualDaaScore
      ? Number((standing.suspendedUntilDaaScore - standing.virtualDaaScore) / DAA_PER_HOUR) + 1
      : null;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-5 pb-28">
      <div className="glow text-lg font-semibold text-keryx-bright">Mining</div>

      <button
        className="w-full truncate text-left font-mono text-xs text-keryx-dim"
        onClick={() => {
          copy(address);
          setToast("Address copied");
          setTimeout(() => setToast(null), 1400);
        }}
      >
        {address}
      </button>

      {err && <div className="rounded-sm bg-keryx-error/10 px-3 py-2 text-sm text-keryx-error">{err}</div>}

      {holder && (
        <Card>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-semibold text-keryx-ink">Holder reward</span>
            <span className={`text-2xl font-bold tabular-nums ${holder.bracketBps >= 10_000 ? "text-keryx-green" : "text-keryx-bright"}`}>
              {pct(holder.bracketBps)}
            </span>
          </div>
          <Row k="Holding ratio" v={`${holder.ratio.toFixed(1)}× / ${holder.fullBracketRatio}×`} />
          <Row k="Gross production (24h)" v={`${krx(holder.production24hSompi)} KRX`} />
          <Row k="Effective balance" v={`${krx(holder.balanceSompi)} KRX`} />
          {holder.next ? (
            <>
              <Row k={`Next bracket ${pct(holder.next.bps)}`} v={`+${krx(holder.next.needSompi)} KRX`} tone="warn" />
              <div className="mt-2 h-1 overflow-hidden rounded-sm bg-keryx-border">
                <div className="h-full bg-keryx-green" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-1 text-xs text-keryx-dim">Full 100% at {krx(holder.fullBracketBalanceSompi)} KRX held. Fresh coins ripen over 24 h.</div>
            </>
          ) : (
            <div className="mt-1 text-xs text-keryx-green">Full miner reward: your effective balance covers {holder.fullBracketRatio}× your daily production.</div>
          )}
          <button className="mt-3 text-sm text-keryx-green" onClick={() => setShowLadder((v) => !v)}>
            {showLadder ? "Hide" : "Show"} all brackets
          </button>
          {showLadder && (
            <div className="mt-2">
              <Ladder currentBps={holder.bracketBps} nextBps={holder.next?.bps} />
            </div>
          )}
        </Card>
      )}

      {inc && (
        <Card>
          <div className="mb-2 font-semibold text-keryx-ink">Last 24 hours</div>
          <Row k="Mined (paid to you)" v={`${krx(inc.paidSompi)} KRX`} tone="good" />
          <Row k="Escrow accrued" v={`${krx(inc.escrowSompi)} KRX`} />
          {inc.inferenceSompi > 0n && <Row k="Inference rewards" v={`${krx(inc.inferenceSompi)} KRX`} tone="good" />}
          <Row k="Burned by the brackets" v={`${krx(inc.burnedSompi)} KRX`} tone={inc.burnedSompi > 0n ? "bad" : undefined} />
          {keptBps !== null && <Row k="Kept of the base reward" v={pct(keptBps)} />}
          {tierBps !== null && <Row k="Model-tier bracket" v={pct(tierBps)} />}
          <Row k="Blocks paid" v={inc.chainBlocks.toLocaleString("en-US")} />
          {inc.baseSompi > 0n && (
            <div className="mt-2 flex flex-col gap-1">
              {inc.tierBaseSompi.map((v, i) =>
                v > 0n ? (
                  <div key={i} className="flex items-center gap-2 text-xs text-keryx-dim">
                    <span className="w-28 shrink-0">{TIER_LABELS[i] ?? `tier ${i}`}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-sm bg-keryx-green/[0.06]">
                      <span className="block h-full bg-keryx-dim/70" style={{ width: `${share(v, inc.baseSompi) / 100}%` }} />
                    </span>
                    <span className="w-10 text-right tabular-nums">{pct(share(v, inc.baseSompi))}</span>
                  </div>
                ) : null
              )}
            </div>
          )}
        </Card>
      )}

      {(standing || served) && (
        <Card>
          <div className="mb-2 font-semibold text-keryx-ink">Inference service</div>
          {served && <Row k="Inferences answered" v={served.answered.toLocaleString("en-US")} />}
          {standing && (
            <>
              {suspendedHours !== null && <Row k="Suspended" v={`~${suspendedHours} h left · whole miner cut burned`} tone="bad" />}
              <Row
                k="Consecutive misses"
                v={String(standing.consecutiveMisses)}
                tone={standing.consecutiveMisses > 0 ? "warn" : "good"}
              />
              {standing.pendingBurnCount > 0 && (
                <Row k="Escrow forfeited (pending)" v={`${krx(standing.pendingBurnSompi)} KRX`} tone="bad" />
              )}
              <Row k="Strikes, lifetime" v={String(standing.lifetimeStrikes)} />
            </>
          )}
        </Card>
      )}

      <ConsolidateRow onOpenModal={() => setShowConsolidate(true)} />
      {showConsolidate && <Consolidate onClose={() => setShowConsolidate(false)} />}
      <Toast msg={toast} />
    </div>
  );
}
