// @vitest-environment node
//
// Private request round trip through the wallet: submit, read the sealed answer without the password,
// then rebuild the history from the chain alone and unlock it with the password.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// @ts-ignore
import * as kaspa from "../src/sdk/kaspa.js";
import { MobileWallet } from "../src/mobile/wallet/mobileWallet";
import type { AiProviders, BroadcastTx, BroadcastResult, InferenceResult, RichTx, Utxo } from "../src/mobile/chain";
import { AI_MODELS } from "../src/mobile/ai/models";
import { addAiHistory, clearAiHistory, loadAiHistory } from "../src/mobile/ai/history";
import { hexToBytes } from "../src/mobile/ai/privateInference";
import { minerKey, sealAnswer } from "./_minerSeal";

const REQUEST_TXID = "9a".repeat(32);
const MINER = minerKey(4);

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

class SealedChain {
  readonly kind = "rest" as const;
  lastBody: BroadcastTx | null = null;
  sealedResponses: InferenceResult["sealedResponses"] = [];
  constructor(private funded: string) {}
  async getInfo() {
    return { network: "keryx-mainnet", lastDaaScore: 150_000_000n };
  }
  async getBalanceSompi() {
    return 0n;
  }
  async getUtxos(a: string): Promise<Utxo[]> {
    if (a !== this.funded) return [];
    const spk = kaspa.payToAddressScript(a);
    return [{
      address: a, transactionId: "b".repeat(64), index: 0, amountSompi: 100_000_000_000n,
      scriptVersion: spk.version, scriptPublicKey: spk.script, blockDaaScore: 1000n, isCoinbase: false,
    }];
  }
  async getAddress(a: string) {
    const mine = a === this.funded;
    return {
      address: a,
      totalReceivedSompi: mine ? 1n : 0n,
      totalTxCount: mine ? 1 : 0,
      transactions: mine && this.lastBody ? [{ txId: REQUEST_TXID, amountSompi: 0n, daaScore: 1n }] : [],
    };
  }
  async getRichTransaction(txid: string): Promise<RichTx> {
    const b = this.lastBody!;
    return {
      txId: txid, isAccepted: true, blockDaaScore: 150_000_000n, timestampMs: 1,
      payloadHex: b.payload,
      outputs: [{ index: 0, address: this.funded, amountSompi: b.outputs[0].amount }, { index: 1, address: "", amountSompi: b.outputs[1].amount }],
      inputs: b.inputs.map((i) => ({ prevTxId: i.transaction_id, prevIndex: i.index, address: this.funded })),
    };
  }
  async getAiProviders(): Promise<AiProviders> {
    return { virtualDaaScore: 150_000_000n, cohort: [{ escrowPubkey: MINER.pubHex, modelId: AI_MODELS[0].id, tier: 0 }], window: [] };
  }
  async getInferenceResult(txId: string): Promise<InferenceResult> {
    return { txId, sealed: true, sealedRecipients: 1, sealedResponses: this.sealedResponses, resultCid: null, resultText: null };
  }
  async broadcast(tx: BroadcastTx): Promise<BroadcastResult> {
    this.lastBody = tx;
    return { ok: true, transactionId: REQUEST_TXID };
  }
  async getTransaction() { throw new Error("unused"); }
  async listRecentTransactions() { return []; }
  async listInferences() { return []; }
}

describe("private request through the wallet", () => {
  beforeEach(() => (globalThis as any).localStorage.clear());

  it("opens the answer, then recovers and unlocks the request from the chain", async () => {
    const store = memStore();
    const probe = new MobileWallet(new SealedChain("x") as any, store, { scanWindow: 2 });
    await probe.createOrImport("pw", probe.newMnemonic());
    const owner = probe.receiveAddress!;
    const chain = new SealedChain(owner);
    const w = new MobileWallet(chain as any, store, { scanWindow: 2 });
    w.unlock("pw");

    const r = await w.submitAiRequest("pw", { modelId: AI_MODELS[0].id, prompt: "What is Keryx?", maxTokens: 256, rewardSompi: 50_000_000n });
    expect(r.secretHex).toMatch(/^[0-9a-f]{64}$/);
    addAiHistory(owner, {
      txId: r.txId, requestHash: r.requestHash, modelId: AI_MODELS[0].id, prompt: "What is Keryx?", ts: 2,
      feeSompi: r.feeSompi.toString(), seedHex: r.seedHex, secretHex: r.secretHex, recipients: r.recipients,
    });

    chain.sealedResponses = [{
      responderPubkey: MINER.pubHex,
      bodyHex: sealAnswer({
        schedule: 2, requestSecret: hexToBytes(r.secretHex), requestTxId: REQUEST_TXID,
        requestPayloadHex: chain.lastBody!.payload, miner: MINER, text: "A BlockDAG for AI.",
      }),
      daaScore: 150_000_100n,
    }];
    const entry = loadAiHistory(owner)[0];
    const answers = await w.readAiAnswers(entry);
    expect(answers.locked).toBe(false);
    expect(answers.opened.map((a) => a.text)).toEqual(["A BlockDAG for AI."]);

    // Reinstall: local history gone, rebuilt from the wallet's own transaction.
    clearAiHistory();
    const rec = await w.recoverFromChain();
    expect(rec.historyRecovered).toBe(1);
    const rebuilt = loadAiHistory(owner)[0];
    expect(rebuilt.seedHex).toBe(r.seedHex);
    expect(rebuilt.requestHash).toBe(r.requestHash);
    expect(rebuilt.prompt).toBe("");
    expect((await w.readAiAnswers(rebuilt)).locked).toBe(true);

    expect(await w.unlockAiHistory("pw")).toBe(1);
    const unlocked = loadAiHistory(owner)[0];
    expect(unlocked.secretHex).toBe(r.secretHex);
    expect(unlocked.prompt).toBe("What is Keryx?");
    expect((await w.readAiAnswers(unlocked)).opened[0].text).toBe("A BlockDAG for AI.");
  });
});
