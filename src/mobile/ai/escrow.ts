// Local registry of AiRequest escrow outputs so the wallet can reclaim them later.
//
// An AiRequest locks its inference_reward in a CSV-pay-to-pubkey escrow output (ai/tx.ts). Those UTXOs
// are NOT indexed under a normal address (their script class is CsvPubKey), so the gateway's
// /addresses/:a/utxos never returns them — the wallet must remember the outpoints itself to reclaim
// the funds after the CSV window. Stored on-device only, keyed by the owning wallet address. No
// secrets. (An AiRequest also appears in the wallet's own tx history, so escrows are additionally
// recoverable by re-scanning subnetwork-0300 txs if this store is ever lost — see mobileWallet.)

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
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}
function writeAll(s: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* non-fatal */
  }
}

export function outpointKey(txid: string, index: number): string {
  return `${txid}:${index}`;
}

/** Record a new escrow for `owner` (deduped by outpoint). */
export function addEscrow(owner: string, rec: EscrowRecord): void {
  if (!owner) return;
  const all = readAll();
  const list = all[owner] ?? [];
  const key = outpointKey(rec.txid, rec.index);
  if (!list.some((e) => outpointKey(e.txid, e.index) === key)) {
    list.push(rec);
    all[owner] = list;
    writeAll(all);
  }
}

/** All escrows currently tracked for `owner`. */
export function listEscrows(owner: string): EscrowRecord[] {
  return readAll()[owner] ?? [];
}

/** Remove escrows (by outpoint) once reclaimed. */
export function removeEscrows(owner: string, outpoints: string[]): void {
  const all = readAll();
  const list = all[owner];
  if (!list) return;
  const gone = new Set(outpoints);
  all[owner] = list.filter((e) => !gone.has(outpointKey(e.txid, e.index)));
  writeAll(all);
}

/** An escrow is reclaimable once at least `sequence` DAA have passed since it was created. */
export function isMatured(rec: EscrowRecord, currentDaa: bigint): boolean {
  return currentDaa - BigInt(rec.createdDaa) >= BigInt(rec.sequence);
}
