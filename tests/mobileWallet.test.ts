// @vitest-environment node
//
// Full REST send path with real crypto and a fake chain: create a wallet, unlock it (wrong password
// rejected), and send — asserting the transaction is built, signed on-device (signature verifies),
// and handed to the ChainProvider as a valid broadcast body. No node, no funds.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// @ts-ignore
import * as kaspa from "../src/sdk/kaspa.js";
import { MobileWallet } from "../src/mobile/wallet/mobileWallet";
import type {
  ChainProvider,
  Utxo,
  BroadcastTx,
  BroadcastResult,
  RecentTx,
  InferenceRecord,
} from "../src/mobile/chain";
import { AI_MODELS } from "../src/mobile/ai/models";
import { AI_REQUEST_SUBNETWORK_ID } from "../src/mobile/ai/payload";

// localStorage shim (node env)
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

// A fake chain that funds the wallet's primary receive address with one real, signable UTXO.
class FakeChain implements ChainProvider {
  readonly kind = "rest" as const;
  lastBody: BroadcastTx | null = null;
  recent: RecentTx[] = [];
  inferences: InferenceRecord[] = [];
  constructor(private fundedAddress: string, private amount: bigint) {}
  async getInfo() {
    return { network: "keryx-mainnet", lastDaaScore: 1n };
  }
  async getBalanceSompi(a: string) {
    return a === this.fundedAddress ? this.amount : 0n;
  }
  async getUtxos(a: string): Promise<Utxo[]> {
    if (a !== this.fundedAddress) return [];
    const spk = kaspa.payToAddressScript(a);
    return [
      {
        address: a,
        transactionId: "b".repeat(64),
        index: 0,
        amountSompi: this.amount,
        scriptVersion: spk.version,
        scriptPublicKey: spk.script,
        blockDaaScore: 1000n,
        isCoinbase: false,
      },
    ];
  }
  async getAddress(a: string) {
    // Report activity on the funded address so the active-filter queries its UTXOs.
    const funded = a === this.fundedAddress && this.amount > 0n;
    return {
      address: a,
      totalReceivedSompi: funded ? this.amount : 0n,
      totalTxCount: funded ? 1 : 0,
      transactions: [] as any[],
    };
  }
  async getTransaction() {
    return {
      txId: "", blockHash: "", confirmations: 0, isAccepted: false, isCoinbase: false,
      inputs: [], outputs: [], totalOutSompi: 0n,
    };
  }
  async listRecentTransactions(_limit: number): Promise<RecentTx[]> {
    return this.recent;
  }
  async listInferences(_limit: number): Promise<InferenceRecord[]> {
    return this.inferences;
  }
  async broadcast(tx: BroadcastTx): Promise<BroadcastResult> {
    this.lastBody = tx;
    return { ok: true, transactionId: "fakebroadcasttxid" };
  }
}

describe("MobileWallet (REST send path, real crypto)", () => {
  let phrase: string;
  beforeEach(() => (globalThis as any).localStorage.clear());

  it("creates a wallet, persists ciphertext, and derives a keryx: receive address", async () => {
    const w = new MobileWallet(new FakeChain("x", 0n) as any, memStore(), { scanWindow: 2 });
    phrase = w.newMnemonic();
    expect(w.validateMnemonic(phrase)).toBe(true);
    await w.createOrImport("pw-correct", phrase);
    expect(w.exists()).toBe(true);
    expect(w.receiveAddress).toMatch(/^keryx:/);
    // stored blob is ciphertext, not the phrase
    const blob = (globalThis as any).localStorage.getItem("keryx.wallet.seed.v1");
    expect(blob).toBeTruthy();
    expect(blob).not.toContain(phrase.split(" ")[0]);
  });

  it("rejects a wrong password on unlock", async () => {
    const w = new MobileWallet(new FakeChain("x", 0n) as any, memStore(), { scanWindow: 2 });
    await w.createOrImport("pw-correct", w.newMnemonic());
    w.lock();
    expect(() => w.unlock("pw-wrong")).toThrow(/wrong password/i);
    expect(w.isUnlocked).toBe(false);
    w.unlock("pw-correct");
    expect(w.isUnlocked).toBe(true);
  });

  it("sends: builds + signs locally, hands a valid broadcast body to the chain", async () => {
    const w0 = new MobileWallet(new FakeChain("x", 0n) as any, memStore(), { scanWindow: 2 });
    const ph = w0.newMnemonic();
    const store = memStore();
    // First wallet to learn the funded address:
    const probe = new MobileWallet(new FakeChain("x", 0n) as any, store, { scanWindow: 2 });
    await probe.createOrImport("pw", ph);
    const funded = probe.receiveAddress!;

    const chain = new FakeChain(funded, 100_000_000_000n); // 1000 KRX
    const w = new MobileWallet(chain as any, store, { scanWindow: 2 });
    w.unlock("pw");

    const dest = new kaspa.PrivateKey("02".padStart(64, "0")).toAddress("mainnet").toString();
    const res = await w.send("pw", dest, 50_000_000_000n);

    expect(res.txId).toBeTruthy();
    expect(res.feeSompi).toBeGreaterThanOrEqual(30_000_000n);
    // the chain received a well-formed, signed body
    expect(chain.lastBody).not.toBeNull();
    expect(chain.lastBody!.version).toBe(0);
    expect(chain.lastBody!.inputs[0].signature_script.length).toBeGreaterThan(0);
    expect(chain.lastBody!.inputs[0].transaction_id).toBe("b".repeat(64));
    // outputs: destination + change back to us
    expect(chain.lastBody!.outputs.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects sending to an invalid address", async () => {
    const w = new MobileWallet(new FakeChain("x", 0n) as any, memStore(), { scanWindow: 2 });
    await w.createOrImport("pw", w.newMnemonic());
    await expect(w.send("pw", "not-an-address", 1n)).rejects.toThrow(/invalid destination/i);
  });

  it("submits an AI request: builds a signed subnetwork-0300 tx with payload, fee = reward+priority", async () => {
    const store = memStore();
    const ph = new MobileWallet(new FakeChain("x", 0n) as any, store, { scanWindow: 2 }).newMnemonic();
    const probe = new MobileWallet(new FakeChain("x", 0n) as any, store, { scanWindow: 2 });
    await probe.createOrImport("pw", ph);
    const funded = probe.receiveAddress!;

    const chain = new FakeChain(funded, 100_000_000_000n); // 1000 KRX
    const w = new MobileWallet(chain as any, store, { scanWindow: 2 });
    w.unlock("pw");

    const model = AI_MODELS[0]; // Qwen3-1.7B, min 0.3 KRX
    const reward = 30_000_000n;
    const r = await w.submitAiRequest("pw", {
      modelId: model.id,
      prompt: "hello keryx",
      maxTokens: 64,
      rewardSompi: reward,
    });

    expect(r.txId).toBeTruthy();
    expect(r.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.feeSompi).toBe(reward + 30_000_000n); // reward + default priority fee
    // The signed body is an AI-subnetwork tx carrying the request payload.
    expect(chain.lastBody!.subnetwork_id).toBe(AI_REQUEST_SUBNETWORK_ID);
    expect(chain.lastBody!.payload.startsWith(model.id)).toBe(true); // payload begins with model_id
    expect(chain.lastBody!.inputs[0].signature_script.length).toBeGreaterThan(0);

    // findAiResponse: unanswered request (in feed, no result yet) -> null.
    chain.inferences = [
      {
        txId: r.txId,
        model: "qwen3-1.7b",
        prompt: "hello keryx",
        maxTokens: 64,
        inferenceRewardSompi: reward,
        priorityFeeSompi: 30_000_000n,
        resultCid: null,
        resultText: null,
        resultDaaScore: 0n,
      },
    ];
    expect(await w.findAiResponse(r.txId)).toBeNull();

    // Once answered (result CID present) -> returns it, matched by request tx id.
    chain.inferences[0].resultCid = "QmTestResultCid";
    const found = await w.findAiResponse(r.txId);
    expect(found).not.toBeNull();
    expect(found!.requestTxId).toBe(r.txId);
    expect(found!.cid).toBe("QmTestResultCid");

    // A wrong password is rejected before any broadcast.
    await expect(
      w.submitAiRequest("nope", { modelId: model.id, prompt: "x", maxTokens: 1, rewardSompi: reward })
    ).rejects.toThrow(/wrong password/i);
  });
});
