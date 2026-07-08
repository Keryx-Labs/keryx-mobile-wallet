// Wallet data cache (stale-while-revalidate). After the first successful sync we persist the last
// balance + history + receive address to localStorage, keyed by the wallet's primary address. On the
// next launch the UI shows this immediately (no empty/zero screen) while a background sync fetches
// fresh data and updates in place — the pattern used by OKX / Phantom / MetaMask.
//
// Only PUBLIC chain data is cached (balance, history, address) — never the seed, keys or password.
// bigint fields are stored as strings so JSON round-trips losslessly.

import type { HistoryEntry } from "./chain";

const KEY = "keryx.cache.overview.v1";

export interface CachedOverview {
  address: string;
  balanceSompi: bigint;
  history: HistoryEntry[];
  ts: number; // epoch ms of the sync that produced this snapshot
}

interface RawHistory {
  txId: string;
  amountSompi: string;
  isSpend: boolean;
  daaScore: string;
  blockHash: string;
}
interface RawCache {
  address: string;
  balanceSompi: string;
  history: RawHistory[];
  ts: number;
}

/** Persist the latest overview for `address`. Best-effort; never throws. */
export function saveOverviewCache(address: string, balanceSompi: bigint, history: HistoryEntry[]): void {
  try {
    const raw: RawCache = {
      address,
      balanceSompi: balanceSompi.toString(),
      history: history.slice(0, 50).map((h) => ({
        txId: h.txId,
        amountSompi: h.amountSompi.toString(),
        isSpend: h.isSpend,
        daaScore: h.daaScore.toString(),
        blockHash: h.blockHash,
      })),
      ts: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(raw));
  } catch {
    /* non-fatal */
  }
}

/** Load the cached overview iff it belongs to `address` (guards against a different imported wallet). */
export function loadOverviewCache(address: string): CachedOverview | null {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    const raw = JSON.parse(s) as RawCache;
    if (!raw || raw.address !== address) return null;
    return {
      address: raw.address,
      balanceSompi: BigInt(raw.balanceSompi),
      history: (raw.history || []).map((h) => ({
        txId: h.txId,
        amountSompi: BigInt(h.amountSompi),
        isSpend: h.isSpend,
        daaScore: BigInt(h.daaScore),
        blockHash: h.blockHash,
      })),
      ts: raw.ts,
    };
  } catch {
    return null;
  }
}

export function clearOverviewCache(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
