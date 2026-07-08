// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { loadAiHistory, addAiHistory, clearAiHistory } from "../src/mobile/ai/history";

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

const mk = (txId: string, prompt = "hi") => ({
  txId,
  requestHash: "f".repeat(64),
  modelId: "4f21ddeb7d62bd2265bc54230d536ca3f1749927780f528c3c41fa2911df4d72",
  prompt,
  ts: Date.now(),
  feeSompi: "60000000",
});

describe("AI history store", () => {
  it("prepends newest-first and reloads", () => {
    addAiHistory("keryx:a", mk("tx1", "first"));
    addAiHistory("keryx:a", mk("tx2", "second"));
    const h = loadAiHistory("keryx:a");
    expect(h.map((e) => e.txId)).toEqual(["tx2", "tx1"]);
    expect(h[0].prompt).toBe("second");
    expect(BigInt(h[0].feeSompi)).toBe(60_000_000n);
  });

  it("dedupes by txId (re-adding moves it to front, no duplicate)", () => {
    addAiHistory("keryx:a", mk("tx1"));
    addAiHistory("keryx:a", mk("tx2"));
    addAiHistory("keryx:a", mk("tx1", "again"));
    const h = loadAiHistory("keryx:a");
    expect(h.map((e) => e.txId)).toEqual(["tx1", "tx2"]);
    expect(h[0].prompt).toBe("again");
  });

  it("isolates by wallet address", () => {
    addAiHistory("keryx:a", mk("tx1"));
    expect(loadAiHistory("keryx:b")).toEqual([]);
    expect(loadAiHistory(null)).toEqual([]);
  });

  it("clears", () => {
    addAiHistory("keryx:a", mk("tx1"));
    clearAiHistory();
    expect(loadAiHistory("keryx:a")).toEqual([]);
  });
});
