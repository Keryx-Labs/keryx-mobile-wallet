// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { saveOverviewCache, loadOverviewCache, clearOverviewCache } from "../src/mobile/walletCache";
import type { HistoryEntry } from "../src/mobile/chain";

beforeAll(() => {
  const map = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
});
beforeEach(() => (globalThis as any).localStorage.clear());

const hist: HistoryEntry[] = [
  { txId: "a".repeat(64), amountSompi: 12345678901234567890n, isSpend: false, daaScore: 999999999999n, blockHash: "b".repeat(64) },
  { txId: "c".repeat(64), amountSompi: -5000000000n, isSpend: true, daaScore: 1n, blockHash: "" },
];

describe("walletCache (stale-while-revalidate store)", () => {
  it("round-trips balance + history with bigints intact", () => {
    saveOverviewCache("keryx:addr1", 98765432109876543210n, hist);
    const c = loadOverviewCache("keryx:addr1");
    expect(c).not.toBeNull();
    expect(c!.balanceSompi).toBe(98765432109876543210n);
    expect(c!.history).toHaveLength(2);
    expect(c!.history[0].amountSompi).toBe(12345678901234567890n);
    expect(c!.history[1].amountSompi).toBe(-5000000000n);
    expect(c!.history[0].daaScore).toBe(999999999999n);
    expect(typeof c!.ts).toBe("number");
  });

  it("ignores a cache that belongs to a different address (imported wallet)", () => {
    saveOverviewCache("keryx:addrA", 100n, hist);
    expect(loadOverviewCache("keryx:addrB")).toBeNull();
  });

  it("returns null after clear", () => {
    saveOverviewCache("keryx:addr", 1n, []);
    clearOverviewCache();
    expect(loadOverviewCache("keryx:addr")).toBeNull();
  });
});
