// @vitest-environment node
//
// Regression for the on-chain rejection:
//   "AiRequest ... is missing escrow output[1] (required for UTXO escrow design)"
//
// The current protocol (keryx-node utxo_validation.rs::check_ai_request_tx_payload_rules) requires an
// AiRequest to carry, at outputs[1], a CSV-pay-to-pubkey escrow worth >= inference_reward, with the fee
// only needing to cover priority_fee. This builds a real signed AiRequest with the WASM signer and
// checks it against a faithful replica of the consensus rules.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// @ts-ignore
import * as kaspa from "../src/sdk/kaspa.js";
import { signAiRequest, buildEscrowScriptHex } from "../src/mobile/ai/tx";
import { deriveKeyMap } from "../src/mobile/wallet/derivation";
import { MIN_AI_REQUEST_PRIORITY_FEE } from "../src/mobile/ai/payload";
import type { Utxo } from "../src/mobile/chain";

const NET = "mainnet";
const GLM = "fa2f13be0850e26c5ce86c7ac79da85e300c1da8b3290f9a18d47105f1f2140a";

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

function bytes(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

// Faithful replica of keryx-node crypto/txscript ScriptClass::is_csv_pay_to_pubkey.
function isCsvPayToPubkey(scriptHex: string): boolean {
  const b = bytes(scriptHex);
  const len = b.length;
  if (len < 37 || len > 44) return false;
  const seqLen = b[0];
  if (seqLen === 0 || seqLen > 8) return false;
  if (len !== seqLen + 36) return false;
  return b[seqLen + 1] === 0xb1 && b[seqLen + 2] === 0x20 && b[len - 1] === 0xac;
}
function isP2pk(scriptHex: string): boolean {
  const b = bytes(scriptHex);
  return b.length === 34 && b[0] === 0x20 && b[33] === 0xac;
}

function fund(address: string, krx: number): Utxo {
  const spk = kaspa.payToAddressScript(address);
  return {
    address,
    transactionId: "a".padEnd(64, "0"),
    index: 0,
    amountSompi: BigInt(Math.round(krx * 1e8)),
    scriptVersion: spk.version,
    scriptPublicKey: spk.script,
    blockDaaScore: 1n,
    isCoinbase: false,
  };
}

function firstKeyAndAddress() {
  const phrase = kaspa.Mnemonic.random(24).phrase;
  const keyMap = deriveKeyMap(phrase, NET, 2);
  const [address, key] = [...keyMap.entries()][0];
  return { address, key };
}

describe("AiRequest escrow output (UTXO escrow design)", () => {
  it("buildEscrowScriptHex is a valid CSV-pay-to-pubkey embedding the address pubkey", () => {
    const { address } = firstKeyAndAddress();
    const escrow = buildEscrowScriptHex(address);
    expect(isCsvPayToPubkey(escrow)).toBe(true);
    // The trailing 34 bytes are exactly the address's p2pk script (OP_DATA_32 <pubkey> OP_CHECKSIG).
    const p2pk = kaspa.payToAddressScript(address).script as string;
    expect(escrow.endsWith(p2pk)).toBe(true);
  });

  it("a signed AiRequest carries escrow output[1] >= reward, change at [0], fee covers priority_fee", () => {
    const { address, key } = firstKeyAndAddress();
    const reward = 170_000_000n; // GLM base 150M + 4 token steps (256 tokens) — the effective min
    const priorityFee = MIN_AI_REQUEST_PRIORITY_FEE;
    const utxo = fund(address, 10); // 10 KRX

    const signed = signAiRequest({
      utxos: [utxo],
      keys: [key],
      changeAddress: address,
      networkId: NET,
      modelId: GLM,
      prompt: "hello keryx",
      maxTokens: 256,
      rewardSompi: reward,
      priorityFeeSompi: priorityFee,
    });

    const body = signed.broadcastBody;
    // Subnetwork must be AiRequest (0300…).
    expect(body.subnetwork_id.startsWith("0300")).toBe(true);
    // Two outputs: [0] change (p2pk), [1] escrow (CSV-p2pk) worth exactly the reward.
    expect(body.outputs.length).toBe(2);
    expect(isP2pk(body.outputs[0].script_public_key)).toBe(true);
    expect(isCsvPayToPubkey(body.outputs[1].script_public_key)).toBe(true);
    expect(body.outputs[1].amount).toBe(reward);
    expect(body.outputs[1].amount >= reward).toBe(true); // consensus: escrow.value >= inference_reward

    // Fee (inputs − outputs) must cover priority_fee (the reward is escrowed, not burned).
    const outSum = body.outputs.reduce((s, o) => s + o.amount, 0n);
    const fee = utxo.amountSompi - outSum;
    expect(fee).toBe(signed.feeSompi);
    expect(fee >= priorityFee).toBe(true);
    // Change must be positive so the escrow really is at index 1.
    expect(body.outputs[0].amount > 0n).toBe(true);
    expect(signed.escrowSompi).toBe(reward);
  });

  it("rejects when funds can't cover reward + priority fee + change", () => {
    const { address, key } = firstKeyAndAddress();
    const utxo = fund(address, 1); // 1 KRX, far below a 1.7 KRX reward
    expect(() =>
      signAiRequest({
        utxos: [utxo],
        keys: [key],
        changeAddress: address,
        networkId: NET,
        modelId: GLM,
        prompt: "hi",
        maxTokens: 256,
        rewardSompi: 170_000_000n,
        priorityFeeSompi: MIN_AI_REQUEST_PRIORITY_FEE,
      })
    ).toThrow(/can't cover|more than/i);
  });
});
