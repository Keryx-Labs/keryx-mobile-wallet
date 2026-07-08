// Secure storage abstraction.
//
//   iOS      → Keychain (kSecClassGenericPassword, accessible after-first-unlock-this-device-only)
//   Android  → Keystore-backed EncryptedSharedPreferences (AES-256-GCM master key in TEE/StrongBox)
//   web/dev  → in-memory only (NEVER persisted in plaintext)
//
// What we put here is ciphertext or non-secret metadata only — never a plaintext seed/mnemonic.

export interface SecureStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
  readonly hardwareBacked: boolean;
}

// ---- Native implementation (Capacitor plugin) --------------------------------------------------
//
// IMPORTANT: the plugin's `SecureStorage` object is a Capacitor Proxy that intercepts EVERY property
// access (including `.then`). If it is ever returned from a `.then()` callback or an async function,
// the Promise machinery tries to "unwrap" it as a thenable and calls `SecureStorage.then(...)`, which
// the native side rejects with `"SecureStorage.then()" is not implemented on android`. So we must
// NEVER pass the proxy through Promise resolution — we await the module namespace and then call the
// plugin method INLINE, returning only its (plain) result.

class NativeSecureStore implements SecureStore {
  readonly hardwareBacked = true;
  private mod: Promise<any> | null = null;

  private modPromise(): Promise<any> {
    if (!this.mod) this.mod = import("@aparajita/capacitor-secure-storage");
    return this.mod; // resolves to the ES module namespace (NOT the proxy) — safe to await
  }

  async get(key: string): Promise<string | null> {
    const m = await this.modPromise();
    const v = await m.SecureStorage.get(key, false, false);
    return typeof v === "string" ? v : v == null ? null : String(v);
  }
  async set(key: string, value: string): Promise<void> {
    const m = await this.modPromise();
    await m.SecureStorage.set(key, value, false, false);
  }
  async remove(key: string): Promise<void> {
    const m = await this.modPromise();
    await m.SecureStorage.remove(key);
  }
  async keys(): Promise<string[]> {
    const m = await this.modPromise();
    return (await m.SecureStorage.keys()) as string[];
  }
}

// ---- Web/dev fallback: in-memory, non-persistent -----------------------------------------------

class MemorySecureStore implements SecureStore {
  readonly hardwareBacked = false;
  private map = new Map<string, string>();
  async get(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  async set(key: string, value: string) {
    this.map.set(key, value);
  }
  async remove(key: string) {
    this.map.delete(key);
  }
  async keys() {
    return [...this.map.keys()];
  }
}

let instance: SecureStore | null = null;

/** Returns the process-wide SecureStore, native when available, in-memory otherwise. */
export function secureStore(isNative: boolean): SecureStore {
  if (!instance) instance = isNative ? new NativeSecureStore() : new MemorySecureStore();
  return instance;
}

// Test seam: allow tests to inject a fake and reset between cases.
export function __setSecureStoreForTests(s: SecureStore | null) {
  instance = s;
}
