// Address book — saved contacts (with labels) + recent recipients. Stored LOCALLY only (localStorage),
// never uploaded anywhere; the phone's own contacts are never accessed. Keyed by the wallet's primary
// address so a different imported wallet doesn't see another wallet's list. Only public data (Keryx
// addresses + user labels) is stored.

const KEY = "keryx.addrbook.v1";
const MAX_RECENTS = 12;

export interface Contact {
  address: string;
  label: string;
  ts: number;
}
export interface Recent {
  address: string;
  ts: number;
}
interface Book {
  wallet: string;
  contacts: Contact[];
  recents: Recent[];
}

function read(): Book | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as Book) : null;
  } catch {
    return null;
  }
}
function write(b: Book): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    /* non-fatal */
  }
}
function forWallet(wallet: string): Book {
  const b = read();
  if (b && b.wallet === wallet) return b;
  return { wallet, contacts: [], recents: [] };
}

/** Saved contacts (newest first) + recent recipients that are NOT already saved contacts. */
export function loadBook(wallet: string | null): { contacts: Contact[]; recents: Recent[] } {
  if (!wallet) return { contacts: [], recents: [] };
  const b = forWallet(wallet);
  const saved = new Set(b.contacts.map((c) => c.address));
  return {
    contacts: [...b.contacts].sort((a, z) => z.ts - a.ts),
    recents: b.recents.filter((r) => !saved.has(r.address)).sort((a, z) => z.ts - a.ts),
  };
}

/** Save/label a contact (dedupe by address — updates the label if it already exists). */
export function saveContact(wallet: string | null, address: string, label: string): void {
  if (!wallet || !address) return;
  const b = forWallet(wallet);
  const existing = b.contacts.find((c) => c.address === address);
  if (existing) {
    existing.label = label.trim() || existing.label;
    existing.ts = Date.now();
  } else {
    b.contacts.push({ address, label: label.trim() || "Saved address", ts: Date.now() });
  }
  // A saved address shouldn't also live in recents.
  b.recents = b.recents.filter((r) => r.address !== address);
  write(b);
}

export function removeContact(wallet: string | null, address: string): void {
  if (!wallet) return;
  const b = forWallet(wallet);
  b.contacts = b.contacts.filter((c) => c.address !== address);
  write(b);
}

/** Record a recent recipient after a send (skips saved contacts; dedupes; caps the list). */
export function addRecent(wallet: string | null, address: string): void {
  if (!wallet || !address) return;
  const b = forWallet(wallet);
  if (b.contacts.some((c) => c.address === address)) return; // already a saved contact
  b.recents = [{ address, ts: Date.now() }, ...b.recents.filter((r) => r.address !== address)].slice(
    0,
    MAX_RECENTS
  );
  write(b);
}
