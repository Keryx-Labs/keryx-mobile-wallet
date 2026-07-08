// Local AI request history. The gateway's /api/v1/infer feed is GLOBAL and carries no requester
// address, so the only way to show "your" past interactions is to remember the request tx ids we
// created. On each submit we append an entry here; the AI tab lists them and reloads each answer from
// /infer by tx id. Only public data is stored (tx id, model, prompt) — never keys/seed/password.
// Keyed by the wallet's primary address so a different imported wallet doesn't show someone else's list.

const KEY = "keryx.ai.history.v1";
const MAX = 50;

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
    const s = localStorage.getItem(KEY);
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

/** Prepend a new request (dedupes by txId, caps the list). Best-effort; never throws. */
export function addAiHistory(address: string | null, entry: AiHistoryEntry): void {
  if (!address) return;
  try {
    const raw = read();
    const items = raw && raw.address === address && Array.isArray(raw.items) ? raw.items : [];
    const next = [entry, ...items.filter((e) => e.txId !== entry.txId)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify({ address, items: next }));
  } catch {
    /* non-fatal */
  }
}

export function clearAiHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
