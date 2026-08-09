// @vitest-environment node
//
// Escrow registry: records AiRequest escrow outpoints, computes maturity, and dedupes — so escrowed
// rewards are tracked for reclaim and can't silently pile up unreclaimed.

import { describe, it, expect, beforeEach } from "vitest";
import {
  addEscrow,
  listEscrows,
  removeEscrows,
  isMatured,
  outpointKey,
  type EscrowRecord,
} from "../src/mobile/ai/escrow";

beforeEach(() => {
  const map = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
});

const rec = (txid: string, createdDaa: string, seq = "36000"): EscrowRecord => ({
  txid,
  index: 1,
  amountSompi: "170000000",
  scriptHex: "02a08cb120" + "ab".repeat(32) + "ac",
  sequence: seq,
  createdDaa,
  requestHash: "f".repeat(64),
});

describe("escrow registry", () => {
  it("records, lists, and dedupes by outpoint per owner", () => {
    addEscrow("me", rec("aa", "1000"));
    addEscrow("me", rec("aa", "1000")); // duplicate outpoint — ignored
    addEscrow("me", rec("bb", "2000"));
    addEscrow("other", rec("cc", "1000"));
    expect(listEscrows("me").map((e) => e.txid)).toEqual(["aa", "bb"]);
    expect(listEscrows("other").map((e) => e.txid)).toEqual(["cc"]);
  });

  it("computes maturity from createdDaa + sequence", () => {
    const e = rec("aa", "1000", "36000"); // matures at 1000 + 36000 = 37000
    expect(isMatured(e, 36999n)).toBe(false);
    expect(isMatured(e, 37000n)).toBe(true);
    expect(isMatured(e, 50000n)).toBe(true);
  });

  it("removes reclaimed escrows by outpoint", () => {
    addEscrow("me", rec("aa", "1000"));
    addEscrow("me", rec("bb", "2000"));
    removeEscrows("me", [outpointKey("aa", 1)]);
    expect(listEscrows("me").map((e) => e.txid)).toEqual(["bb"]);
  });
});
