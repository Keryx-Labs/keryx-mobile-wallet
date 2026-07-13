// @vitest-environment node
//
// Consolidate signer: reproduces the official desktop behavior (self-send, largest-first, 80-cap,
// coinbase maturity honored, mass fee, single change output back to self). Real crypto, no node.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// @ts-ignore
import * as kaspa from "../src/sdk/kaspa.js";
import { signConsolidate, consolidateInfo, COINBASE_MATURITY } from "../src/mobile/chain";
import type { Utxo } from "../src/mobile/chain";
import { deriveAddresses, deriveKeyMap } from "../src/mobile/wallet/derivation";

beforeAll(async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  await kaspa.default({ module_or_path: readFileSync(resolve(here, "../src/sdk/kaspa_bg.wasm")) });
});

function utxo(
  addr: string,
  amountSompi: bigint,
  index: number,
  opts: { isCoinbase?: boolean; blockDaaScore?: bigint } = {}
): Utxo {
  const spk = kaspa.payToAddressScript(addr);
  return {
    address: addr,
    transactionId: "b".repeat(64),
    index,
    amountSompi,
    scriptVersion: spk.version,
    scriptPublicKey: spk.script,
    blockDaaScore: opts.blockDaaScore ?? 1n,
    isCoinbase: opts.isCoinbase ?? false,
  };
}

const VALID = "keryx:qprqmwptzgkqea3uw34rlgzwa998keh9j0mattq367pduh895cvuv0hn5a3dd";

describe("consolidateInfo (coinbase maturity + sizing)", () => {
  it("excludes immature coinbase, counts mature, sizes the batch", () => {
    const daa = 100_000n;
    const utxos = [
      utxo(VALID, 100n, 0, { isCoinbase: true, blockDaaScore: daa - (COINBASE_MATURITY - 1n) }), // immature
      utxo(VALID, 200n, 1, { isCoinbase: false }), // normal → mature
      utxo(VALID, 300n, 2, { isCoinbase: true, blockDaaScore: 1n }), // old coinbase → mature
    ];
    const info = consolidateInfo(utxos, daa);
    expect(info.matureCount).toBe(2);
    expect(info.immatureCount).toBe(1);
    expect(info.totalMatureSompi).toBe(500n);
    expect(info.batchInputs).toBe(2);
    expect(info.remainingAfter).toBe(1);
  });
});

describe("signConsolidate (self-send, real signing)", () => {
  it("sweeps mature UTXOs into ONE output back to self, fee deducted, signed", () => {
    const phrase = kaspa.Mnemonic.random(24).phrase;
    const addrs = deriveAddresses(phrase, "mainnet", 2);
    const change = addrs.receive[0];
    const keys = Array.from(deriveKeyMap(phrase, "mainnet", 2).values());

    const utxos = [
      utxo(change, 10_000_000_000n, 0),
      utxo(change, 20_000_000_000n, 1),
    ];
    const total = 30_000_000_000n;
    const signed = signConsolidate({
      utxos,
      keys,
      changeAddress: change,
      networkId: "mainnet",
      currentDaaScore: 100_000n,
    });

    expect(signed.inputCount).toBe(2);
    expect(signed.broadcastBody.inputs.length).toBe(2);
    // single output — change back to self
    expect(signed.broadcastBody.outputs.length).toBe(1);
    expect(signed.feeSompi).toBeGreaterThanOrEqual(30_000_000n);
    expect(signed.broadcastBody.outputs[0].amount).toBe(total - signed.feeSompi);
    // inputs are signed
    expect(signed.broadcastBody.inputs[0].signature_script.length).toBeGreaterThan(0);
  });

  it("refuses when fewer than 2 spendable UTXOs", () => {
    const phrase = kaspa.Mnemonic.random(24).phrase;
    const change = deriveAddresses(phrase, "mainnet", 2).receive[0];
    const keys = Array.from(deriveKeyMap(phrase, "mainnet", 2).values());
    // one immature coinbase → 0 mature
    const only = [utxo(change, 5_000_000_000n, 0, { isCoinbase: true, blockDaaScore: 100_000n })];
    expect(() =>
      signConsolidate({ utxos: only, keys, changeAddress: change, networkId: "mainnet", currentDaaScore: 100_000n })
    ).toThrow(/at least 2/i);
  });
});
