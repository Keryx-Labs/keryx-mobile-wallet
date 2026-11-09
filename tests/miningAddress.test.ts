// @vitest-environment node
//
// The Mining tab follows the wallet address the node credits with production.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// @ts-ignore
import * as kaspa from "../src/sdk/kaspa.js";
import { MobileWallet } from "../src/mobile/wallet/mobileWallet";
import type { Utxo } from "../src/mobile/chain";

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

function utxo(address: string, sompi: bigint): Utxo {
  const spk = kaspa.payToAddressScript(address);
  return {
    address, transactionId: "c".repeat(64), index: 0, amountSompi: sompi,
    scriptVersion: spk.version, scriptPublicKey: spk.script, blockDaaScore: 10n, isCoinbase: false,
  };
}

/** Gateway that reports no activity anywhere; coins sit on one address. */
class DormantChain {
  readonly kind = "rest" as const;
  utxoCalls = 0;
  constructor(private holder: string, private sompi: bigint) {}
  async getInfo() {
    return { network: "keryx-mainnet", lastDaaScore: 5_000n };
  }
  async getAddress(a: string) {
    return { address: a, totalReceivedSompi: 0n, totalTxCount: 0, transactions: [] };
  }
  async getUtxos(a: string): Promise<Utxo[]> {
    this.utxoCalls++;
    return a === this.holder ? [utxo(a, this.sompi)] : [];
  }
  async getBalanceSompi() { return 0n; }
  async getTransaction() { throw new Error("unused"); }
  async getRichTransaction() { throw new Error("unused"); }
  async listRecentTransactions() { return []; }
  async listInferences() { return []; }
  async broadcast() { return { ok: true }; }
}

class MiningChain extends DormantChain {
  reads: string[] = [];
  constructor(public miner: string | null) { super("none", 0n); }
  async getHolderReward(a: string) {
    this.reads.push(a);
    const mining = a === this.miner;
    return {
      address: a, isMiner: mining, balanceSompi: 0n, production24hSompi: mining ? 5n : 0n, ratio: 0,
      bracketBps: 500, fullBracketRatio: 120, fullBracketBalanceSompi: 0n, next: null, income: null,
    };
  }
}

describe("mining address", () => {
  beforeEach(() => (globalThis as any).localStorage.clear());

  it("finds the mining address, remembers it, and drops it when mining stops", async () => {
    const store = memStore();
    const probe = new MobileWallet(new DormantChain("x", 0n) as any, store, { scanWindow: 3 });
    await probe.createOrImport("pw", probe.newMnemonic());
    const miner = (probe as any).addresses.change[1] as string;
    const chain = new MiningChain(miner);
    const w = new MobileWallet(chain as any, store, { scanWindow: 3 });
    w.unlock("pw");

    expect(await w.findMiningAddress()).toBe(miner);
    chain.reads = [];
    expect(await w.findMiningAddress()).toBe(miner);
    expect(chain.reads).toEqual([miner]);

    chain.miner = null;
    expect(await w.findMiningAddress()).toBeNull();
    w.lock();
    expect(await w.findMiningAddress()).toBeNull();
  });
});
