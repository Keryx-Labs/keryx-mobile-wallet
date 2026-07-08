// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { secureStore, __setSecureStoreForTests, SecureStore } from "../src/mobile/secureStore";
import { mirrorSeedToVault, restoreSeedFromVault, clearVaultSeed } from "../src/mobile/seedVault";

const WEB_SEED_KEY = "keryx.wallet.seed.v1";

describe("secure storage abstraction", () => {
  beforeEach(() => {
    __setSecureStoreForTests(null);
    localStorage.clear();
  });

  it("web fallback round-trips values and is NOT hardware-backed", async () => {
    const s = secureStore(false); // not native → in-memory fallback
    expect(s.hardwareBacked).toBe(false);
    await s.set("k", "v");
    expect(await s.get("k")).toBe("v");
    await s.remove("k");
    expect(await s.get("k")).toBeNull();
  });

  it("reports hardwareBacked=true when native", () => {
    __setSecureStoreForTests(null);
    const s = secureStore(true);
    expect(s.hardwareBacked).toBe(true);
  });
});

describe("seed vault (durability mirror)", () => {
  let store: SecureStore;
  beforeEach(() => {
    localStorage.clear();
    store = new Map<string, string>() as any; // simple fake
    const map = new Map<string, string>();
    store = {
      hardwareBacked: true,
      get: async (k) => (map.has(k) ? map.get(k)! : null),
      set: async (k, v) => void map.set(k, v),
      remove: async (k) => void map.delete(k),
      keys: async () => [...map.keys()],
    };
  });

  it("mirrors the encrypted blob to secure storage, storing CIPHERTEXT only", async () => {
    const ciphertext = "BASE64_XCHACHA_CIPHERTEXT"; // stand-in; never a plaintext seed
    localStorage.setItem(WEB_SEED_KEY, ciphertext);
    await mirrorSeedToVault(store);
    expect(await store.get("seed.blob.v1")).toBe(ciphertext);
  });

  it("restores the blob to the WebView when localStorage was evicted", async () => {
    await store.set("seed.blob.v1", "CIPHERTEXT");
    expect(localStorage.getItem(WEB_SEED_KEY)).toBeNull(); // simulate eviction
    const restored = await restoreSeedFromVault(store);
    expect(restored).toBe(true);
    expect(localStorage.getItem(WEB_SEED_KEY)).toBe("CIPHERTEXT");
  });

  it("does not overwrite an intact WebView copy", async () => {
    localStorage.setItem(WEB_SEED_KEY, "WEB_COPY");
    await store.set("seed.blob.v1", "VAULT_COPY");
    expect(await restoreSeedFromVault(store)).toBe(false);
    expect(localStorage.getItem(WEB_SEED_KEY)).toBe("WEB_COPY");
  });

  it("clears the mirrored seed on wipe", async () => {
    await store.set("seed.blob.v1", "CIPHERTEXT");
    await clearVaultSeed(store);
    expect(await store.get("seed.blob.v1")).toBeNull();
  });
});
