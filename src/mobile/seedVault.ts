// Seed durability + secure-storage mirror.
//
// The shared wallet-core (`src/lib/wallet.ts`) stores the encrypted mnemonic blob in the WebView's
// localStorage under `keryx.wallet.seed.v1`. On iOS, WKWebView localStorage/IndexedDB can be EVICTED
// by the system under storage pressure — which would drop the encrypted blob (and the SDK's own
// wallet store). The user could still restore from their 24 words, but silent loss is a bad surprise.
//
// This module mirrors that ciphertext into hardware-backed secure storage and restores it on launch,
// so the encrypted (still password-protected) seed survives WebView eviction. It stores CIPHERTEXT
// ONLY — the password is required to decrypt, exactly as before. No plaintext seed ever leaves the
// WebView, and nothing here is logged.

import type { SecureStore } from "./secureStore";

// Must match SEED_BLOB_KEY in src/lib/wallet.ts.
const WEB_SEED_KEY = "keryx.wallet.seed.v1";
const VAULT_SEED_KEY = "seed.blob.v1";

/** After the wallet writes its encrypted blob to localStorage, copy it into secure storage. */
export async function mirrorSeedToVault(store: SecureStore): Promise<void> {
  const blob = safeLocalGet(WEB_SEED_KEY);
  if (blob) await store.set(VAULT_SEED_KEY, blob);
}

/**
 * On launch, if the WebView lost its localStorage copy but secure storage still has the ciphertext,
 * restore it so unlock keeps working. Returns true if a restore happened.
 */
export async function restoreSeedFromVault(store: SecureStore): Promise<boolean> {
  const inWeb = safeLocalGet(WEB_SEED_KEY);
  if (inWeb) return false; // WebView copy is intact
  const inVault = await store.get(VAULT_SEED_KEY);
  if (!inVault) return false;
  safeLocalSet(WEB_SEED_KEY, inVault);
  return true;
}

/** Remove the mirrored ciphertext (e.g. on wallet reset / wipe). */
export async function clearVaultSeed(store: SecureStore): Promise<void> {
  await store.remove(VAULT_SEED_KEY);
}

function safeLocalGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function safeLocalSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* non-fatal */
  }
}
// end of seedVault.ts
