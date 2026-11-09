// @vitest-environment node
//
// Capacitor plugin objects are proxies that answer any method, including `then`. A plugin whose
// `then` never settles (native call with no implementation) must not hang durable reads or writes.

import { describe, it, expect, beforeEach, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("@capacitor/preferences", () => {
  const impl: Record<string, (...a: any[]) => any> = {
    get: async ({ key }: { key: string }) => ({ value: store.has(key) ? store.get(key)! : null }),
    set: async ({ key, value }: { key: string; value: string }) => void store.set(key, value),
    remove: async ({ key }: { key: string }) => void store.delete(key),
  };
  const Preferences = new Proxy({}, {
    get: (_t, prop) => (prop in impl ? impl[prop as string] : () => new Promise(() => {})),
  });
  return { Preferences };
});

import { initDurable, durableGet, durableSet, durableRemove, __resetDurableForTests } from "../src/mobile/durable";

function mockLocalStorage() {
  const map = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  return map;
}

beforeEach(() => {
  __resetDurableForTests();
  store.clear();
  mockLocalStorage();
});

describe("durable storage with a proxy plugin", () => {
  it("writes and removes through Preferences without waiting on a native then()", async () => {
    const t0 = Date.now();
    await initDurable();
    await durableSet("keryx.escrows.v1", '{"me":[1]}');
    expect(store.get("keryx.escrows.v1")).toBe('{"me":[1]}');
    await durableRemove("keryx.escrows.v1");
    expect(store.has("keryx.escrows.v1")).toBe(false);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("reads values that only exist in Preferences", async () => {
    store.set("keryx.ai.history.v1", "from-prefs");
    await initDurable();
    expect(durableGet("keryx.ai.history.v1")).toBe("from-prefs");
  });
});
