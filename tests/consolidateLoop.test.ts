// @vitest-environment node
//
// Multi-batch consolidate auto-loop: one call consolidates the WHOLE set even when it exceeds the
// 80-input cap, waiting for each batch to "confirm" before the next. Real crypto; a stateful fake
// chain removes each batch's spent inputs and adds the single change output (simulating acceptance).

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// @ts-ignore
import * as kaspa from "../src/sdk/kaspa.js";
import { MobileWallet } from "../src/mobile/wallet/mobileWallet";
import type { ChainProvider, Utxo, BroadcastTx, BroadcastResult, RecentTx, InferenceRecord } from "../src/mobile/chain";

beforeAll(async () => {
  const map = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  const here = dirname(fileURLToPath(import.meta.url));
  await kaspa.default({ module_or_path: readFileSync(resolve(here, "../src/sdk/kaspa_bg.wasm")) });
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

// Stateful chain: broadcasting a consolidate removes its inputs and adds the single change output.
class StatefulChain implements ChainProvider {
  readonly kind = "rest" as const;
  utxos: Utxo[] = [];
  private n = 0;
  constructor(private funded: string) {}
  async getInfo() {
    return { network: "keryx-mainnet", lastDaaScore: 1_000_000n };
  }
  async getBalanceSompi() {
    return this.utxos.reduce((s, u) => s + u.amountSompi, 0n);
  }
  async getUtxos(a: string): Promise<Utxo[]> {
    return a === this.funded ? [...this.utxos] : [];
  }
  async getAddress(a: string) {
    const funded = a === this.funded && this.utxos.length > 0;
    return { address: a, totalReceivedSompi: funded ? 1n : 0n, totalTxCount: funded ? 1 : 0, transactions: [] as any[] };
  }
  async getTransaction() {
    return { txId: "", blockHash: "", confirmations: 0, isAccepted: false, isCoinbase: false, inputs: [], outputs: [], totalOutSompi: 0n };
  }
  async listRecentTransactions(): Promise<RecentTx[]> {
    return [];
  }
  async listInferences(): Promise<InferenceRecord[]> {
    return [];
  }
  async broadcast(tx: BroadcastTx): Promise<BroadcastResult> {
    const spent = new Set(tx.inputs.map((i) => `${i.transaction_id}:${i.index}`));
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

function mkUtxo(addr: string, index: number): Utxo {
  const spk = kaspa.payToAddressScript(addr);
  return {
    address: addr,
    transactionId: ("a" + index).padEnd(64, "0"),
    index: 0,
    amountSompi: 1_000_000_000n, // 10 KRX each — well above the fee
    scriptVersion: spk.version,
    scriptPublicKey: spk.script,
    blockDaaScore: 1n,
    isCoinbase: false,
  };
}

describe("multi-batch consolidate (>80 UTXOs in one action)", () => {
  it("loops batches until ≤1 remains, one authorization", async () => {
    const store = memStore();
    const ph = new MobileWallet(new StatefulChain("x") as any, store, { scanWindow: 2 }).newMnemonic();
    const probe = new MobileWallet(new StatefulChain("x") as any, store, { scanWindow: 2 });
    await probe.createOrImport("pw", ph);
    const funded = probe.receiveAddress!; // consolidate change goes to receive[0]

    const chain = new StatefulChain(funded);
    chain.utxos = Array.from({ length: 200 }, (_, i) => mkUtxo(funded, i));
    const w = new MobileWallet(chain as any, store, { scanWindow: 2 });
    w.unlock("pw");

    const progress: number[] = [];
    const r = await w.consolidate("pw", (p) => progress.push(p.remaining));

    // One call consolidated the WHOLE 200-UTXO set (well past the 80-input cap) down to a single coin.
    expect(r.batches).toBeGreaterThan(1); // it auto-looped, not just one batch
    expect(r.remaining).toBeLessThanOrEqual(1); // fully compounded
    expect(r.txids).toHaveLength(r.batches);
    expect(r.totalInputs).toBeGreaterThan(80); // more than a single 80-input batch
    expect(chain.utxos.length).toBeLessThanOrEqual(1);
    expect(progress.length).toBe(r.batches);
    expect(progress[progress.length - 1]).toBeLessThanOrEqual(1); // ends at ≤ 1 remaining
    // strictly decreasing remaining across batches
    for (let i = 1; i < progress.length; i++) expect(progress[i]).toBeLessThan(progress[i - 1]);
  }, 20000);

  it("refuses when fewer than 2 coins", async () => {
    const store = memStore();
    const ph = new MobileWallet(new StatefulChain("x") as any, store, { scanWindow: 2 }).newMnemonic();
    const probe = new MobileWallet(new StatefulChain("x") as any, store, { scanWindow: 2 });
    await probe.createOrImport("pw", ph);
    const funded = probe.receiveAddress!;
    const chain = new StatefulChain(funded);
    chain.utxos = [mkUtxo(funded, 0)];
    const w = new MobileWallet(chain as any, store, { scanWindow: 2 });
    w.unlock("pw");
    await expect(w.consolidate("pw")).rejects.toThrow(/at least 2/i);
  });
});
