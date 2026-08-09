// @vitest-environment node
//
// Durable, resumable consolidation. Simulates a process kill after batch 1: a durable session with a
// pending (already-broadcast) batch exists, and the chain already reflects that batch. A FRESH wallet
// instance then resumes from real UTXO state — it must NOT re-broadcast the pending batch, must not
// double-spend its inputs, and must finish consolidating the remaining set. Real crypto.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// @ts-ignore
import * as kaspa from "../src/sdk/kaspa.js";
import { MobileWallet } from "../src/mobile/wallet/mobileWallet";
import {
  saveConsolidateSession,
  hasActiveConsolidation,
  type ConsolidateSession,
} from "../src/mobile/wallet/consolidateSession";
import { __resetDurableForTests, initDurable } from "../src/mobile/durable";
import type { ChainProvider, Utxo, BroadcastTx } from "../src/mobile/chain";

beforeAll(async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  await kaspa.default({ module_or_path: readFileSync(resolve(here, "../src/sdk/kaspa_bg.wasm")) });
});

function mockLocalStorage() {
  const map = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}
beforeEach(async () => {
  mockLocalStorage();
  __resetDurableForTests();
  await initDurable();
});

const memStore = () => {
  const m = new Map<string, string>();
  return {
    hardwareBacked: false,
    get: async (k: string) => (m.has(k) ? m.get(k)! : null),
    set: async (k: string, v: string) => void m.set(k, v),
    remove: async (k: string) => void m.delete(k),
    keys: async () => [...m.keys()],
  };
};

class StatefulChain implements Partial<ChainProvider> {
  readonly kind = "rest" as const;
  utxos: Utxo[] = [];
  broadcasts: Set<string>[] = []; // spent-sets of each broadcast (to check for double-spends)
  private n = 0;
  constructor(private funded: string) {}
  async getInfo() {
    return { network: "keryx-mainnet", lastDaaScore: 2_000_000n };
  }
  async getUtxos(a: string) {
    return a === this.funded ? [...this.utxos] : [];
  }
  async getAddress(a: string) {
    const funded = a === this.funded && this.utxos.length > 0;
    return { address: a, totalReceivedSompi: funded ? 1n : 0n, totalTxCount: funded ? 1 : 0, transactions: [] as any[] };
  }
  async broadcast(tx: BroadcastTx) {
    const spent = new Set(tx.inputs.map((i) => `${i.transaction_id}:${i.index}`));
    this.broadcasts.push(spent);
    this.utxos = this.utxos.filter((u) => !spent.has(`${u.transactionId}:${u.index}`));
    const spk = kaspa.payToAddressScript(this.funded);
    this.n++;
    this.utxos.push({
      address: this.funded,
      transactionId: ("c" + this.n).padEnd(64, "0"),
      index: 0,
      amountSompi: BigInt(tx.outputs[0].amount),
      scriptVersion: spk.version,
      scriptPublicKey: spk.script,
      blockDaaScore: 1n,
      isCoinbase: false,
    });
    return { ok: true, transactionId: ("tx" + this.n).padEnd(64, "0") };
  }
}

function mkUtxo(addr: string, i: number): Utxo {
  const spk = kaspa.payToAddressScript(addr);
  return {
    address: addr,
    transactionId: ("a" + i).padEnd(64, "0"),
    index: 0,
    amountSompi: 1_000_000_000n,
    scriptVersion: spk.version,
    scriptPublicKey: spk.script,
    blockDaaScore: 1n,
    isCoinbase: false,
  };
}

describe("durable resumable consolidation", () => {
  it("resumes after a simulated kill without re-broadcasting the pending batch, and finishes", async () => {
    const store = memStore();
    const phrase = new MobileWallet(new StatefulChain("x") as any, store, { scanWindow: 2 }).newMnemonic();
    const probe = new MobileWallet(new StatefulChain("x") as any, store, { scanWindow: 2 });
    await probe.createOrImport("pw", phrase);
    const funded = probe.receiveAddress!;

    // Chain state AFTER batch 1 already landed: the 80 batch-1 inputs are gone; 91 UTXOs remain.
    const chain = new StatefulChain(funded);
    chain.utxos = Array.from({ length: 91 }, (_, i) => mkUtxo(funded, i));

    // Durable session as if the app was killed right after broadcasting batch 1.
    const b1Spent = Array.from({ length: 80 }, (_, i) => `b1input${i}:0`);
    const session: ConsolidateSession = {
      owner: funded,
      active: true,
      txids: [],
      totalInputs: 0,
      totalFeeSompi: "0",
      pending: { spent: b1Spent, txid: "batch1tx".padEnd(64, "0") },
    };
    await saveConsolidateSession(session);

    const w = new MobileWallet(chain as any, store, { scanWindow: 2 });
    w.unlock("pw");
    expect(w.hasResumableConsolidation()).toBe(true);

    const r = await w.consolidate("pw");

    // The pending batch was NOT re-broadcast — only the remaining set was swept (2 new batches: 80 + 11).
    expect(chain.broadcasts.length).toBe(2);
    // No new broadcast reused batch 1's inputs (no double-spend).
    for (const spent of chain.broadcasts) for (const i of b1Spent) expect(spent.has(i)).toBe(false);
    // Finished: at most one coin left, session cleared.
    expect(chain.utxos.length).toBeLessThanOrEqual(1);
    expect(r.remaining).toBeLessThanOrEqual(1);
    expect(w.hasResumableConsolidation()).toBe(false);
    // The resumed batch-1 is counted in the reported total (3 batches overall).
    expect(r.batches).toBe(3);
  }, 20000);

  it("a completed consolidation leaves no resumable session", async () => {
    const store = memStore();
    const phrase = new MobileWallet(new StatefulChain("x") as any, store, { scanWindow: 2 }).newMnemonic();
    const probe = new MobileWallet(new StatefulChain("x") as any, store, { scanWindow: 2 });
    await probe.createOrImport("pw", phrase);
    const funded = probe.receiveAddress!;
    const chain = new StatefulChain(funded);
    chain.utxos = Array.from({ length: 100 }, (_, i) => mkUtxo(funded, i));
    const w = new MobileWallet(chain as any, store, { scanWindow: 2 });
    w.unlock("pw");

    await w.consolidate("pw");
    expect(w.hasResumableConsolidation()).toBe(false);
    expect(chain.utxos.length).toBeLessThanOrEqual(1);
  }, 20000);
});
