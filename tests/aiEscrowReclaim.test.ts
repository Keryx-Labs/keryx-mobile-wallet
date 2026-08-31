// @vitest-environment node
//
// Full AiRequest escrow LIFECYCLE with real WASM crypto:
//   AiRequest -> CSV escrow output[1] -> (CSV maturity) -> reclaim spend back to the wallet.
// Validates that the reclaim transaction is well-formed against the consensus CSV rules: it spends the
// escrow outpoint, sets the input sequence to satisfy OP_CSV, carries a real signature, and returns the
// funds (minus fee) to the requester — so escrowed rewards are never permanently locked.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// @ts-ignore
import * as kaspa from "../src/sdk/kaspa.js";
import { buildEscrowScriptHex, AI_ESCROW_CSV_BLOCKS } from "../src/mobile/ai/tx";
import { signEscrowReclaim, signSpend } from "../src/mobile/chain";
import { deriveKeyMap } from "../src/mobile/wallet/derivation";
import type { Utxo } from "../src/mobile/chain";

const NET = "mainnet";

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

function toBytes(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}
function isCsvPayToPubkey(scriptHex: string): boolean {
  const b = toBytes(scriptHex);
  const len = b.length;
  if (len < 37 || len > 44) return false;
  const seqLen = b[0];
  if (seqLen === 0 || seqLen > 8) return false;
  if (len !== seqLen + 36) return false;
  return b[seqLen + 1] === 0xb1 && b[seqLen + 2] === 0x20 && b[len - 1] === 0xac;
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

function wallet() {
  const phrase = kaspa.Mnemonic.random(24).phrase;
  const keyMap = deriveKeyMap(phrase, NET, 2);
  const [address, key] = [...keyMap.entries()][0];
  return { address, key };
}

// NOTE: since the H8 reward-routing fork, a NEW AiRequest escrow is the keyless vault (paid to the
// miner, not reclaimable). This suite covers the LEGACY path: a pre-H8 CSV-pay-to-pubkey escrow the
// wallet may still hold is reclaimed by the requester — the reclaim signer must still work.
describe("legacy escrow reclaim lifecycle", () => {
  it("reclaims a matured (pre-H8) CSV escrow back to the wallet with a valid CSV-satisfying spend", () => {
    const { address, key } = wallet();
    const reward = 170_000_000n;
    const legacyTxId = "a1".repeat(32);

    // A legacy CSV-pay-to-pubkey escrow (the shape old app versions produced), owned by our key.
    const escrowScriptHex = buildEscrowScriptHex(address);
    expect(isCsvPayToPubkey(escrowScriptHex)).toBe(true);

    const reclaim = signEscrowReclaim({
      escrows: [
        {
          transactionId: legacyTxId,
          index: 1,
          amountSompi: reward,
          scriptPublicKey: escrowScriptHex,
          sequence: AI_ESCROW_CSV_BLOCKS,
          blockDaaScore: 100n,
        },
      ],
      key,
      destinationAddress: address,
      networkId: NET,
    });

    const body = reclaim.broadcastBody;
    // spends exactly the escrow outpoint
    expect(body.inputs.length).toBe(1);
    expect(body.inputs[0].transaction_id).toBe(legacyTxId);
    expect(body.inputs[0].index).toBe(1);
    // input sequence satisfies OP_CSV (>= the escrow's lock)
    expect(BigInt(body.inputs[0].sequence)).toBeGreaterThanOrEqual(AI_ESCROW_CSV_BLOCKS);
    // carries a real signature (65-byte schnorr push -> "41" + 130 hex = 132 chars), same shape a p2pk spend uses
    expect(body.inputs[0].signature_script.length).toBe(132);
    expect(body.inputs[0].signature_script.startsWith("41")).toBe(true);
    // funds return to the wallet, minus the fee — nothing is left stuck
    expect(body.outputs.length).toBe(1);
    expect(body.outputs[0].amount).toBe(reward - reclaim.feeSompi);
    expect(body.outputs[0].amount > 0n).toBe(true);
  });

  it("produces a signature_script the same shape as a normal p2pk spend (format cross-check)", () => {
    const { address, key } = wallet();
    // A standard p2pk spend for reference.
    const spend = signSpend({
      utxos: [fund(address, 5)],
      keys: [key],
      destinationAddress: address,
      amountSompi: 100_000_000n,
      changeAddress: address,
      networkId: NET,
    });
    // Both p2pk and CSV-p2pk sign the trailing "<pubkey> OP_CHECKSIG", so the push is the same length.
    expect(spend.broadcastBody.inputs[0].signature_script.length).toBe(132);
    expect(spend.broadcastBody.inputs[0].signature_script.startsWith("41")).toBe(true);
  });

  it("refuses when the escrow is below the network fee", () => {
    const { address, key } = wallet();
    const scriptHex = buildEscrowScriptHex(address);
    expect(() =>
      signEscrowReclaim({
        escrows: [{ transactionId: "b".padEnd(64, "0"), index: 1, amountSompi: 1000n, scriptPublicKey: scriptHex, sequence: AI_ESCROW_CSV_BLOCKS, blockDaaScore: 1n }],
        key,
        destinationAddress: address,
        networkId: NET,
      })
    ).toThrow(/below the network fee|nothing to reclaim/i);
  });
});
