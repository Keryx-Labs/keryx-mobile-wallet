// Durable state for a multi-batch consolidation so it survives app suspension, process death and
// reboot. A consolidation is a SELF-SEND (funds go back to the same wallet), so resuming is safe even
// under races: the worst case is a duplicate/rejected transaction, never lost funds. Progress is
// therefore CHAIN-STATE-DRIVEN — on resume we re-read the real UTXO set rather than trusting a stored
// "batch complete" flag. We persist only:
//   - that a consolidation is in progress (so the wallet can offer Resume);
//   - the accumulated result (txids / totals) for reporting;
//   - the in-flight batch's spent outpoints + txid, so on resume we wait for that batch to confirm
//     (idempotent — we never re-broadcast blindly; if it didn't land, the loop re-picks those UTXOs).
// No secrets are stored (only public outpoints + txids).

import { durableGet, durableSet, durableRemove } from "../durable";

const KEY = "keryx.consolidate.session.v1";

export interface PendingBatch {
  spent: string[]; // "txid:index" outpoints the in-flight batch consumes
  txid: string;
}

export interface ConsolidateSession {
  owner: string;
  active: boolean;
  txids: string[];
  totalInputs: number;
  totalFeeSompi: string; // bigint as string
  pending: PendingBatch | null;
}

export function loadConsolidateSession(owner: string): ConsolidateSession | null {
  try {
    const raw = durableGet(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ConsolidateSession;
    return s && s.owner === owner ? s : null;
  } catch {
    return null;
  }
}

/** True if a consolidation was started for `owner` and never reached completion. */
export function hasActiveConsolidation(owner: string | null): boolean {
  if (!owner) return false;
  const s = loadConsolidateSession(owner);
  return !!s && s.active;
}

export function saveConsolidateSession(s: ConsolidateSession): Promise<void> {
  return durableSet(KEY, JSON.stringify(s));
}

export function clearConsolidateSession(): Promise<void> {
  return durableRemove(KEY);
}
