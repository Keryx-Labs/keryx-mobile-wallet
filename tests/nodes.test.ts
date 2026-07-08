import { describe, it, expect } from "vitest";
import { nodesFromEnv, candidateNodes, selectHealthyNode, NodeCandidate, ProbeResult } from "../src/mobile/nodes";

const N = (url: string): NodeCandidate => ({ url, networkId: "mainnet" });

describe("node candidates", () => {
  it("parses VITE_KERYX_NODES and normalizes to wss:// with default port", () => {
    const got = nodesFromEnv("node1.keryx-labs.com, wss://node2:24110 ");
    expect(got).toEqual([
      { url: "wss://node1.keryx-labs.com:23110", networkId: "mainnet" },
      { url: "wss://node2:24110", networkId: "mainnet" },
    ]);
  });

  it("env overrides the in-code default list", () => {
    expect(candidateNodes("wss://x:23110").map((n) => n.url)).toEqual(["wss://x:23110"]);
    expect(candidateNodes(undefined)).toEqual([]); // OFFICIAL_NODES empty until project fills it
  });
});

describe("healthy node selection (failover)", () => {
  const good: ProbeResult = { ok: true, synced: true, utxoIndex: true };
  const noUtxo: ProbeResult = { ok: true, synced: true, utxoIndex: false };
  const unsynced: ProbeResult = { ok: true, synced: false, utxoIndex: true };
  const down: ProbeResult = { ok: false, error: "unreachable" };

  it("picks the first reachable+synced+utxoindex node", async () => {
    const probe = async (url: string) =>
      url.includes("a") ? down : url.includes("b") ? good : good;
    const sel = await selectHealthyNode([N("wss://a"), N("wss://b"), N("wss://c")], probe);
    expect(sel.selected?.url).toBe("wss://b");
    expect(sel.attempts).toHaveLength(2); // stopped at b
  });

  it("skips nodes without --utxoindex and unsynced nodes", async () => {
    const map: Record<string, ProbeResult> = {
      "wss://a": noUtxo,
      "wss://b": unsynced,
      "wss://c": good,
    };
    const sel = await selectHealthyNode([N("wss://a"), N("wss://b"), N("wss://c")], async (u) => map[u]);
    expect(sel.selected?.url).toBe("wss://c");
    expect(sel.attempts).toHaveLength(3);
  });

  it("returns null when nothing is healthy, recording every attempt", async () => {
    const sel = await selectHealthyNode([N("wss://a"), N("wss://b")], async () => down);
    expect(sel.selected).toBeNull();
    expect(sel.attempts).toHaveLength(2);
  });

  it("treats a throwing probe as a failed attempt and continues", async () => {
    const probe = async (u: string) => {
      if (u.includes("a")) throw new Error("boom");
      return good;
    };
    const sel = await selectHealthyNode([N("wss://a"), N("wss://b")], probe);
    expect(sel.selected?.url).toBe("wss://b");
    expect(sel.attempts[0].result.ok).toBe(false);
  });
});
