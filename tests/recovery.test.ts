// @vitest-environment node
//
// Chain-based recovery after reinstall/restore (local storage wiped). recoverFromChain() reconstructs
// AI request history + unspent escrow records from the wallet's own subnetwork-0300 transactions, and
// drops escrows already reclaimed on-chain. Then a recovered escrow can be reclaimed. Real WASM crypto.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// @ts-ignore
import * as kaspa from "../src/sdk/kaspa.js";
import { MobileWallet } from "../src/mobile/wallet/mobileWallet";
import { loadAiHistory } from "../src/mobile/ai/history";
import { aiRequestPayloadHex } from "../src/mobile/ai/payload";
import { __resetDurableForTests } from "../src/mobile/durable";
import type { ChainProvider, RichTx } from "../src/mobile/chain";

const NET = "mainnet";
const GLM = "fa2f13be0850e26c5ce86c7ac79da85e300c1da8b3290f9a18d47105f1f2140a";
const REWARD = 170_000_000n;
const CREATED_DAA = 1_000_000n;
const AIREQ_TX = "a1".repeat(32); // valid 64-hex tx id
const RECLAIM_TX = "b2".repeat(32);
const FUNDING_TX = "cd".repeat(32);

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
beforeEach(() => {
  mockLocalStorage();
  __resetDurableForTests();
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

// A chain that serves the wallet's own AiRequest (+ optional reclaim) tx via history + rich detail.
class RecoveryChain implements Partial<ChainProvider> {
  readonly kind = "rest" as const;
  lastBody: any = null;
  constructor(
    private owner: string,
    private payloadHex: string,
    private daa: bigint,
    private includeReclaim: boolean
  ) {}
  async getInfo() {
    return { network: "keryx-mainnet", lastDaaScore: this.daa };
  }
  async getAddress(a: string) {
    if (a !== this.owner) return { address: a, totalReceivedSompi: 0n, totalTxCount: 0, transactions: [] as any[] };
    const txs = [{ txId: AIREQ_TX, amountSompi: -1n, daaScore: CREATED_DAA }];
    if (this.includeReclaim) txs.push({ txId: RECLAIM_TX, amountSompi: 1n, daaScore: CREATED_DAA + 40000n });
    return { address: a, totalReceivedSompi: 1n, totalTxCount: txs.length, transactions: txs };
  }
  async getUtxos() {
    return [];
  }
  async getRichTransaction(txid: string): Promise<RichTx> {
    if (txid === AIREQ_TX) {
      return {
        txId: txid,
        isAccepted: true,
        blockDaaScore: CREATED_DAA,
        timestampMs: 1_700_000_000_000,
        payloadHex: this.payloadHex,
        outputs: [
          { index: 0, address: this.owner, amountSompi: 5_000_000_000n }, // change back to us
          { index: 1, address: "", amountSompi: REWARD }, // CSV escrow (empty address)
        ],
        inputs: [{ prevTxId: FUNDING_TX, prevIndex: 0, address: this.owner }],
      };
    }
    // RECLAIM tx spends the escrow outpoint AIREQ:1
    return {
      txId: txid,
      isAccepted: true,
      blockDaaScore: CREATED_DAA + 40000n,
      timestampMs: 1_700_000_100_000,
      payloadHex: "",
      outputs: [{ index: 0, address: this.owner, amountSompi: REWARD - 30_000_000n }],
      inputs: [{ prevTxId: AIREQ_TX, prevIndex: 1, address: this.owner }],
    };
  }
  async broadcast(body: any) {
    this.lastBody = body;
    return { ok: true, transactionId: "reclaimtx".padEnd(64, "0") };
  }
}

async function makeWallet(payloadHex: string, daa: bigint, includeReclaim: boolean) {
  const store = memStore();
  const phrase = new MobileWallet({} as any, store, { scanWindow: 2 }).newMnemonic();
  const probe = new MobileWallet({ kind: "rest" } as any, store, { scanWindow: 2 });
  await probe.createOrImport("pw", phrase);
  const owner = probe.receiveAddress!;
  const chain = new RecoveryChain(owner, payloadHex, daa, includeReclaim);
  const w = new MobileWallet(chain as any, store, { scanWindow: 2 });
  await w.createOrImport("pw", phrase); // fresh install: unlocked, but local caches are empty
  return { w, owner, chain };
}

describe("recover escrow + AI history from chain", () => {
  const payload = () =>
    aiRequestPayloadHex({ modelId: GLM, maxTokens: 256, inferenceReward: REWARD, priorityFee: 30_000_000n, prompt: "recovered prompt" });

  it("empty store -> rescan -> escrow + history recovered; then matured -> reclaim works", async () => {
    const maturedDaa = CREATED_DAA + 36000n + 5n;
    const { w, owner } = await makeWallet(payload(), maturedDaa, false);

    // Local caches are empty on a fresh restore.
    expect(loadAiHistory(owner)).toHaveLength(0);
    expect((await w.escrowSummary()).count).toBe(0);

    const rec = await w.recoverFromChain();
    expect(rec.escrowsRecovered).toBe(1);
    expect(rec.historyRecovered).toBe(1);

    // History reconstructed (prompt + model from the on-chain payload).
    const hist = loadAiHistory(owner);
    expect(hist).toHaveLength(1);
    expect(hist[0].modelId).toBe(GLM);
    expect(hist[0].prompt).toBe("recovered prompt");

    // Escrow reconstructed and, since matured, reclaimable.
    const sum = await w.escrowSummary();
    expect(sum.count).toBe(1);
    expect(sum.totalSompi).toBe(REWARD);
    expect(sum.maturedCount).toBe(1);

    const r = await w.reclaimEscrows("pw");
    expect(r.count).toBe(1);
    expect(r.reclaimedSompi).toBeGreaterThan(0n);
    expect((await w.escrowSummary()).count).toBe(0); // cleared after reclaim

    // Recovery is idempotent: running again doesn't duplicate (escrow now spent on-chain would be dropped).
    await w.recoverFromChain();
    expect(loadAiHistory(owner)).toHaveLength(1);
  });

  it("does not resurrect an escrow that was already reclaimed on-chain", async () => {
    const { w } = await makeWallet(payload(), CREATED_DAA + 50000n, true /* include the reclaim tx */);
    const rec = await w.recoverFromChain();
    expect(rec.escrowsRecovered).toBe(0); // AIREQ:1 is spent by RECLAIM -> not claimable
    expect((await w.escrowSummary()).count).toBe(0);
  });
});
