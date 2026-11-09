// @vitest-environment node
//
// An address the gateway no longer has history for (outside its window) still holds coins: the
// balance must come from the UTXOs of every derived address, not from the address's activity.

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

class NodeBackedChain extends DormantChain {
  nodeUp = true;
  batches: string[][] = [];
  constructor(private h: string, private s: bigint) { super(h, s); }
  async getUtxosForAddresses(addrs: string[]): Promise<Utxo[]> {
    if (!this.nodeUp) throw new Error("No node reachable.");
    this.batches.push(addrs);
    return addrs.includes(this.h) ? [utxo(this.h, this.s)] : [];
  }
}

async function walletOn(makeChain: (holder: string) => DormantChain) {
  const store = memStore();
  const probe = new MobileWallet(new DormantChain("x", 0n) as any, store, { scanWindow: 3 });
  await probe.createOrImport("pw", probe.newMnemonic());
  // A change address deep in the scan window, never seen by the gateway.
  const holder = (probe as any).addresses.change[2] as string;
  const chain = makeChain(holder);
  const w = new MobileWallet(chain as any, store, { scanWindow: 3 });
  w.unlock("pw");
  return { w, chain };
}

describe("dormant addresses", () => {
  beforeEach(() => (globalThis as any).localStorage.clear());

  it("counts coins on an address with no gateway history, read from the gateway", async () => {
    const { w, chain } = await walletOn((h) => new DormantChain(h, 7_000_000_000n));
    expect((await w.overview(0)).balanceSompi).toBe(7_000_000_000n);
    expect(chain.utxoCalls).toBe(6);
  });

  it("reads every address in one node call when a node answers", async () => {
    const { w, chain } = await walletOn((h) => new NodeBackedChain(h, 3_000_000_000n));
    const c = chain as NodeBackedChain;
    expect((await w.overview(0)).balanceSompi).toBe(3_000_000_000n);
    expect(c.batches).toHaveLength(1);
    expect(c.batches[0]).toHaveLength(6);
    expect(c.utxoCalls).toBe(0);
  });

  it("falls back to the gateway when no node is reachable", async () => {
    const { w, chain } = await walletOn((h) => new NodeBackedChain(h, 3_000_000_000n));
    (chain as NodeBackedChain).nodeUp = false;
    expect((await w.overview(0)).balanceSompi).toBe(3_000_000_000n);
    expect(chain.utxoCalls).toBe(6);
  });
});
