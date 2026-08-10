// Durable key-value storage for wallet state that must survive APK updates, WebView storage resets,
// process death and reboot.
//
// WHY: Capacitor apps store `localStorage` inside the system WebView, keyed by the WebView origin
// (capacitor://localhost etc.). Across app updates / WebView changes that store can be evicted or
// orphaned — which is why the wallet already mirrors the *seed* into secure storage (seedVault) rather
// than trusting localStorage. AI request history, escrow records and consolidation progress had the
// same weakness. This layer moves them to `@capacitor/preferences` — native SharedPreferences
// (Android) / UserDefaults (iOS) — which survives updates and WebView resets. localStorage is kept as
// a synchronous mirror/cache; Preferences is the source of truth on device.
//
// Note: a full uninstall/reinstall still wipes all app data (allowBackup=false). Recovery from that is
// handled separately by reconstructing state from the wallet's own on-chain transactions.

let cache = new Map<string, string>();
let initialized = false;

// Keys managed durably (fund- / operation-critical, not cheap regenerable caches).
export const DURABLE_KEYS = [
  "keryx.ai.history.v1",
  "keryx.escrows.v1",
  "keryx.addrbook.v1",
  "keryx.consolidate.session.v1",
] as const;

// Never let a hung/slow native plugin call block the caller. Any Preferences op that doesn't resolve
// within the budget is treated as "unavailable" so the wallet falls back to localStorage and boots.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function preferences(): Promise<any | null> {
  try {
    const mod: any = await withTimeout(import("@capacitor/preferences"), 2500);
    return mod?.Preferences ?? null;
  } catch {
    return null; // web / tests / plugin unavailable
  }
}

/**
 * Load durable state into an in-memory cache (enabling synchronous reads) and migrate any values that
 * currently live only in localStorage into Preferences. Idempotent; safe to call more than once.
 * MUST NOT block boot: every native call is time-boxed and failures fall back to localStorage.
 */
export async function initDurable(): Promise<void> {
  if (initialized) return;
  const P = await preferences();
  for (const key of DURABLE_KEYS) {
    let val: string | null = null;
    if (P) {
      const got: any = await withTimeout(P.get({ key }), 2000);
      val = got?.value ?? null;
    }
    if (val == null) {
      // First run after adding durable storage: migrate the existing localStorage value.
      let ls: string | null = null;
      try {
        ls = localStorage.getItem(key);
      } catch {
        /* ignore */
      }
      if (ls != null) {
        val = ls;
        if (P) await withTimeout(P.set({ key, value: ls }), 2000);
      }
    }
    if (val != null) cache.set(key, val);
  }
  initialized = true;
}

/** Synchronous read. Uses the in-memory cache once initialized; falls back to localStorage before. */
export function durableGet(key: string): string | null {
  if (cache.has(key)) return cache.get(key)!;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Write-through: updates the in-memory cache and localStorage mirror synchronously, then persists to
 * Preferences. Await the returned promise on fund-critical writes (escrow records, consolidation
 * checkpoints) so the durable write completes before the app can be killed.
 */
export async function durableSet(key: string, value: string): Promise<void> {
  cache.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
  const P = await preferences();
  if (P) {
    try {
      await P.set({ key, value });
    } catch {
      /* ignore */
    }
  }
}

/** Remove a durable key everywhere. */
export async function durableRemove(key: string): Promise<void> {
  cache.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  const P = await preferences();
  if (P) {
    try {
      await P.remove({ key });
    } catch {
      /* ignore */
    }
  }
}

/** Test-only: reset the in-memory cache + init flag. */
export function __resetDurableForTests(): void {
  cache = new Map();
  initialized = false;
}
