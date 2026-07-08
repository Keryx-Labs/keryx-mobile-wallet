// @vitest-environment node
//
// End-to-end proof of the REST send path WITHOUT a node: builds a real UTXO, signs a spend fully
// offline with the WASM wallet-core, and checks the emitted broadcast body matches the exact schema
// the live gateway accepted. Uses a throwaway key — no funds, no network.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// @ts-ignore — import the SDK runtime directly to initialize WASM for the shared module instance.
import * as kaspa from "../src/sdk/kaspa.js";
import { signSpend } from "../src/mobile/chain/signer";
import { stringifyBroadcast } from "../src/mobile/chain/broadcast";

beforeAll(async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  await kaspa.default({ module_or_path: readFileSync(resolve(here, "../src/sdk/kaspa_bg.wasm")) });
});

describe("offline sign → broadcast body (REST send path)", () => {
  it("signs locally and emits the gateway's snake_case body", () => {
    const pk = new kaspa.PrivateKey(
      "0000000000000000000000000000000000000000000000000000000000000001"
    );
    const addr = pk.toAddress("mainnet").toString();
    const spk = kaspa.payToAddressScript(addr);

    const utxo = {
      address: addr,
      transactionId: "a".repeat(64),
      index: 0,
      amountSompi: 100_000_000_000n,
      scriptVersion: spk.version,
      scriptPublicKey: spk.script,
      blockDaaScore: 1000n,
      isCoinbase: false,
    };

    const signed = signSpend({
      utxos: [utxo],
      keys: [pk],
      destinationAddress: addr,
      amountSompi: 50_000_000_000n,
      changeAddress: addr,
      networkId: "mainnet",
    });

    // txid is a 64-hex string
    expect(signed.txId).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.feeSompi).toBeGreaterThanOrEqual(30_000_000n); // enforced minimum
    expect(signed.inputCount).toBe(1);

    const b = signed.broadcastBody;
    expect(b.version).toBe(0);
    // input: snake_case, has a real signature script
    expect(b.inputs[0].transaction_id).toBe("a".repeat(64));
    expect(b.inputs[0].sig_op_count).toBe(1);
    expect(b.inputs[0].signature_script.length).toBeGreaterThan(0);
    // outputs: amount is bigint, script stripped of the version prefix
    expect(typeof b.outputs[0].amount).toBe("bigint");
    expect(b.outputs[0].script_public_key).toBe(spk.script);
    expect(b.outputs[0].script_version).toBe(0);

    // serialized body has bare-integer amounts (what the live gateway accepted)
    const json = stringifyBroadcast(b);
    expect(json).toMatch(/"amount":\d+/);
    expect(json).not.toMatch(/"amount":"\d+"/);
  });
});
