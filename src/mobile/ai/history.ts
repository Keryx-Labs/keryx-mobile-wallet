// Local AI request history. The gateway's /api/v1/infer feed is GLOBAL and carries no requester
// address, so the only way to show "your" past interactions is to remember the request tx ids we
// created. On each submit we append an entry here; the AI tab lists them and reloads each answer from
// /infer by tx id. Only public data is stored (tx id, model, prompt) — never keys/seed/password.
// Keyed by the wallet's primary address so a different imported wallet doesn't show someone else's list.
//
// Persisted via the durable store (survives APK updates / WebView resets). This list is also
// reconstructable from the wallet's own AiRequest (subnetwork-0300) transactions on-chain, so it is a
// cache: a full reinstall recovers it by rescan (see mobileWallet.recoverFromChain).

import { durableGet, durableSet, durableRemove } from "../durable";

const KEY = "keryx.ai.history.v1";
const MAX = 100;

export interface AiHistoryEntry {
  txId: string;
  requestHash: string;
  modelId: string;
  prompt: string;
  ts: number; // epoch ms
  feeSompi: string; // bigint as string
}

interface RawStore {
  address: string;
  items: AiHistoryEntry[];
}

function read(): RawStore | null {
  try {
    const s = durableGet(KEY);
    return s ? (JSON.parse(s) as RawStore) : null;
  } catch {
    return null;
  }
}

/** Past requests for this wallet, newest first. Empty if the stored list belongs to another wallet. */
export function loadAiHistory(address: string | null): AiHistoryEntry[] {
  if (!address) return [];
  const raw = read();
  if (!raw || raw.address !== address || !Array.isArray(raw.items)) return [];
  return raw.items;
}

function persist(address: string, items: AiHistoryEntry[]): void {
  // Newest first, dedupe by txId, cap. Fire-and-forget durable write (cache + localStorage update
  // synchronously; Preferences shortly after).
  const seen = new Set<string>();
  const clean: AiHistoryEntry[] = [];
  for (const e of items) {
    if (e && e.txId && !seen.has(e.txId)) {
      seen.add(e.txId);
      clean.push(e);
    }
  }
  clean.sort((a, b) => b.ts - a.ts);
  void durableSet(KEY, JSON.stringify({ address, items: clean.slice(0, MAX) }));
}

/** Prepend a new request (dedupes by txId, caps the list). Best-effort; never throws. */
export function addAiHistory(address: string | null, entry: AiHistoryEntry): void {
  if (!address) return;
  const raw = read();
  const items = raw && raw.address === address && Array.isArray(raw.items) ? raw.items : [];
  persist(address, [entry, ...items]);
}

/**
 * Merge reconstructed/on-chain entries into the stored list without losing existing ones or creating
 * duplicates (dedupe by txId; keep the richer/earlier local prompt if present). Used by recovery.
 */
export function mergeAiHistory(address: string | null, entries: AiHistoryEntry[]): void {
  if (!address || entries.length === 0) return;
  const raw = read();
  const existing = raw && raw.address === address && Array.isArray(raw.items) ? raw.items : [];
  const byId = new Map<string, AiHistoryEntry>();
  // Prefer existing local entries (they may have a fuller prompt) over reconstructed ones.
  for (const e of entries) byId.set(e.txId, e);
  for (const e of existing) byId.set(e.txId, e);
  persist(address, [...byId.values()]);
}

export function clearAiHistory(): void {
  void durableRemove(KEY);
}
