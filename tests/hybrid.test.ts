// @vitest-environment node
//
// Hybrid provider: the node broadcast path rebuilds the exact signed transaction, and every node
// call falls back to the gateway when no node is reachable. Throwaway key, no funds.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// @ts-ignore — import the SDK runtime directly to initialize WASM for the shared module instance.
import * as kaspa from "../src/sdk/kaspa.js";
import { signSpend } from "../src/mobile/chain/signer";
import { toSdkTransaction, fromNodeEntry } from "../src/mobile/chain/nodeRpc";
import { HybridProvider } from "../src/mobile/chain/hybrid";
import { AI_REQUEST_SUBNETWORK_ID } from "../src/mobile/ai/payload";
import type { BroadcastTx, ChainProvider } from "../src/mobile/chain";

beforeAll(async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  await kaspa.default({ module_or_path: readFileSync(resolve(here, "../src/sdk/kaspa_bg.wasm")) });
});

function signedSpend() {
  const pk = new kaspa.PrivateKey("0000000000000000000000000000000000000000000000000000000000000001");
  const addr = pk.toAddress("mainnet").toString();
  const spk = kaspa.payToAddressScript(addr);
  return signSpend({
    utxos: [
      {
        address: addr,
        transactionId: "a".repeat(64),
        index: 0,
        amountSompi: 100_000_000_000n,
        scriptVersion: spk.version,
        scriptPublicKey: spk.script,
        blockDaaScore: 1000n,
        isCoinbase: false,
      },
    ],
    keys: [pk],
    destinationAddress: addr,
    amountSompi: 50_000_000_000n,
    changeAddress: addr,
    networkId: "mainnet",
  });
}

function fakeRest(calls: string[]): ChainProvider {
  return {
    kind: "rest",
    getInfo: async () => (calls.push("info"), { network: "keryx-mainnet", lastDaaScore: 5n, syncedHint: true }),
    getBalanceSompi: async () => (calls.push("balance"), 42n),
    getUtxos: async () => (calls.push("utxos"), []),
    getAddress: async (a) => (calls.push("address"), { address: a, totalReceivedSompi: 0n, totalTxCount: 0, transactions: [] }),
    getTransaction: async () => Promise.reject(new Error("unused")),
    getRichTransaction: async () => Promise.reject(new Error("unused")),
    listRecentTransactions: async () => [],
    listInferences: async () => [],
    broadcast: async (tx: BroadcastTx) => (calls.push(`broadcast:${tx.subnetwork_id}`), { ok: true, transactionId: "rest" }),
  };
}

describe("node broadcast path", () => {
  it("rebuilds the signed transaction with the same id", () => {
    const signed = signedSpend();
    const tx = toSdkTransaction(signed.broadcastBody);
    expect(tx.id).toBe(signed.txId);
    expect(tx.inputs[0].signatureScript).toBe(signed.broadcastBody.inputs[0].signature_script);
  });

  it("maps a node UTXO entry, hex or byte script alike", () => {
    const base = {
      outpoint: { transactionId: "b".repeat(64), index: 3 },
      amount: 123n,
      scriptPublicKey: { version: 0, script: "20" + "11".repeat(32) + "ac" },
      blockDaaScore: 77n,
      isCoinbase: true,
    };
    const u = fromNodeEntry(base, "keryx:fallback");
    expect(u).toMatchObject({ address: "keryx:fallback", transactionId: "b".repeat(64), index: 3, amountSompi: 123n });
    expect(u.isCoinbase).toBe(true);
    const bytes = fromNodeEntry({ ...base, scriptPublicKey: { version: 0, script: new Uint8Array([0x20, 0xac]) } }, "x");
    expect(bytes.scriptPublicKey).toBe("20ac");
  });
});

describe("HybridProvider fallback", () => {
  it("uses the gateway when no node is configured", async () => {
    const calls: string[] = [];
    const p = new HybridProvider(fakeRest(calls), []);
    expect(await p.getBalanceSompi("keryx:x")).toBe(42n);
    await p.getUtxos("keryx:x");
    expect(calls).toEqual(["balance", "utxos"]);
    expect(p.status().url).toBeNull();
  });

  it("falls back to the gateway when the node is unreachable", async () => {
    const calls: string[] = [];
    const p = new HybridProvider(fakeRest(calls), [{ url: "ws://127.0.0.1:9", networkId: "mainnet" }]);
    expect(await p.getBalanceSompi("keryx:x")).toBe(42n);
    expect(calls).toEqual(["balance"]);
    expect(p.status().lastError).toBeTruthy();
  }, 30_000);

  it("keeps inference requests on the gateway", async () => {
    const calls: string[] = [];
    const p = new HybridProvider(fakeRest(calls), [{ url: "ws://127.0.0.1:9", networkId: "mainnet" }]);
    const body = { ...signedSpend().broadcastBody, subnetwork_id: AI_REQUEST_SUBNETWORK_ID };
    await p.broadcast(body);
    expect(calls).toEqual([`broadcast:${AI_REQUEST_SUBNETWORK_ID}`]);
  });
});
