// Local registry of AiRequest escrow outputs so the wallet can reclaim them later.
//
// An AiRequest locks its inference_reward in a CSV-pay-to-pubkey escrow output (ai/tx.ts). Those UTXOs
// are NOT indexed under a normal address (their script class is CsvPubKey), so the gateway's
// /addresses/:a/utxos never returns them — the wallet must remember the outpoints itself to reclaim
// the funds after the CSV window. Persisted via the durable store (survives APK updates / WebView
// resets). Keyed by the owning wallet address. No secrets.
//
// This registry is a CACHE: an AiRequest also appears in the wallet's own tx history, so escrows are
// reconstructable on-chain (subnetwork-0300 tx -> output[1]) even after a reinstall — see
// mobileWallet.recoverFromChain. Reclaimed escrows are detected by our later txs spending the outpoint.

import { durableGet, durableSet } from "../durable";

const KEY = "keryx.escrows.v1";

export interface EscrowRecord {
  txid: string;
  index: number; // always 1 for an AiRequest escrow
  amountSompi: string; // bigint as decimal string
  scriptHex: string; // the CSV-p2pk script (needed to spend it)
  sequence: string; // CSV relative-lock (blocks), bigint as string
  createdDaa: string; // DAA score when the request was made (maturity reference), bigint as string
  requestHash: string;
}

type Store = Record<string, EscrowRecord[]>; // ownerAddress -> escrows

function readAll(): Store {
  try {
    const raw = durableGet(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}
function writeAll(s: Store): Promise<void> {
  return durableSet(KEY, JSON.stringify(s));
}

export function outpointKey(txid: string, index: number): string {
  return `${txid}:${index}`;
}

/** Record a new escrow for `owner` (deduped by outpoint). Awaitable — used on fund-critical paths. */
export async function addEscrow(owner: string, rec: EscrowRecord): Promise<void> {
  if (!owner) return;
  const all = readAll();
  const list = all[owner] ?? [];
  const key = outpointKey(rec.txid, rec.index);
  if (!list.some((e) => outpointKey(e.txid, e.index) === key)) {
    list.push(rec);
    all[owner] = list;
    await writeAll(all);
  }
}

/**
 * Merge reconstructed escrows into the store: add any missing, and DROP any locally-tracked escrow
 * whose outpoint is in `spentOutpoints` (already reclaimed on-chain). Dedupe by outpoint. Used by
 * recovery so the store reflects real chain state and reclaimed escrows aren't shown as claimable.
 */
export async function reconcileEscrows(
  owner: string,
  found: EscrowRecord[],
  spentOutpoints: Set<string>
): Promise<void> {
  if (!owner) return;
  const all = readAll();
  const byKey = new Map<string, EscrowRecord>();
  for (const e of all[owner] ?? []) byKey.set(outpointKey(e.txid, e.index), e);
  for (const e of found) byKey.set(outpointKey(e.txid, e.index), e);
  const list = [...byKey.values()].filter((e) => !spentOutpoints.has(outpointKey(e.txid, e.index)));
  all[owner] = list;
  await writeAll(all);
}

/** All escrows currently tracked for `owner`. */
export function listEscrows(owner: string): EscrowRecord[] {
  return readAll()[owner] ?? [];
}

/** Remove escrows (by outpoint) once reclaimed. Awaitable. */
export async function removeEscrows(owner: string, outpoints: string[]): Promise<void> {
  const all = readAll();
  const list = all[owner];
  if (!list) return;
  const gone = new Set(outpoints);
  all[owner] = list.filter((e) => !gone.has(outpointKey(e.txid, e.index)));
  await writeAll(all);
}

/** An escrow is reclaimable once at least `sequence` DAA have passed since it was created. */
export function isMatured(rec: EscrowRecord, currentDaa: bigint): boolean {
  return currentDaa - BigInt(rec.createdDaa) >= BigInt(rec.sequence);
}
