// @vitest-environment node
//
// Durable storage: migrates existing localStorage data on init, then reads from the cache (so state
// survives even if localStorage is later cleared — the WebView-reset case that lost AI history).

import { describe, it, expect, beforeEach } from "vitest";
import {
  initDurable,
  durableGet,
  durableSet,
  durableRemove,
  __resetDurableForTests,
} from "../src/mobile/durable";

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
});

describe("durable storage", () => {
  it("migrates existing localStorage values on init and keeps them after a WebView reset", async () => {
    const ls = mockLocalStorage();
    ls.set("keryx.ai.history.v1", JSON.stringify({ address: "me", items: [{ txId: "t1" }] }));

    await initDurable(); // loads into the in-memory cache (Preferences unavailable in node -> localStorage)
    expect(durableGet("keryx.ai.history.v1")).toContain("t1");

    // Simulate the WebView clearing localStorage after an update: the cache still has it.
    ls.clear();
    expect(durableGet("keryx.ai.history.v1")).toContain("t1");
  });

  it("write-through updates the cache synchronously and survives a localStorage wipe", async () => {
    const ls = mockLocalStorage();
    await initDurable();
    await durableSet("keryx.escrows.v1", '{"me":[]}');
    expect(durableGet("keryx.escrows.v1")).toBe('{"me":[]}');
    ls.clear(); // WebView reset
    expect(durableGet("keryx.escrows.v1")).toBe('{"me":[]}'); // still in cache
  });

  it("remove clears the value", async () => {
    mockLocalStorage();
    await initDurable();
    await durableSet("keryx.addrbook.v1", "x");
    await durableRemove("keryx.addrbook.v1");
    expect(durableGet("keryx.addrbook.v1")).toBeNull();
  });
});
