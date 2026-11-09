// WASM bootstrap for the mobile wallet-core. Loads the Keryx wallet-core (kaspa) WASM and verifies,
// at runtime, that this build really emits `keryx:` addresses (the .d.ts doc-comments show the
// upstream `kaspa:` prefix). Kept separate from the wallet service so tests can init WASM their own
// way (from bytes) without pulling in the Vite `?url` asset import.

import * as kaspa from "../../sdk/kaspa.js";
import wasmUrl from "../../sdk/kaspa_bg.wasm?url";

// One shared load: the SDK's own guard is only set once instantiation finishes, so two concurrent
// calls (React StrictMode runs effects twice in dev) would instantiate the module twice.
let loading: Promise<void> | null = null;
let ready = false;

export function initWasm(): Promise<void> {
  if (!loading) {
    loading = kaspa.default({ module_or_path: wasmUrl }).then(
      () => {
        ready = true;
      },
      (e: unknown) => {
        loading = null;
        throw e;
      }
    );
  }
  return loading;
}

export function isWasmReady(): boolean {
  return ready;
}

/** Derive a throwaway address and confirm the network prefix is `keryx`. Returns the prefix. */
export function verifyAddressPrefix(): string | null {
  try {
    const addr = new kaspa.PrivateKey(
      "0000000000000000000000000000000000000000000000000000000000000001"
    )
      .toAddress("mainnet")
      .toString();
    return addr.split(":")[0] || null;
  } catch {
    return null;
  }
}
// end of wasm.ts
