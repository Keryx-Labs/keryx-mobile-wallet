// Local transaction signer — builds and signs a spend ENTIRELY ON DEVICE using the audited WASM
// wallet-core, then emits a broadcast body for the REST Gateway. No networking here, no crypto
// re-implementation: it reuses the exact synchronous SDK primitives the desktop wallet proved out
// (`createTransaction` → `calculateTransactionFee` → `signTransaction`). Private keys are used in
// memory only and never leave this function.
//
// This is the security-critical seam of the REST design: the network layer only ever sees the
// resulting signed transaction (public data), never keys or the seed.

import * as kaspa from "../../sdk/kaspa.js";
import type { Utxo } from "./types";
import { buildBroadcastBody, BroadcastTx, SerializableTx } from "./broadcast";

// Keryx consensus limits, matched to the desktop wallet (verified against a live node).
export const MAX_TX_INPUTS = 80;
export const KERYX_MIN_FEE = 30_000_000n; // 0.3 KRX minimum relay fee (sompi)

export interface SpendRequest {
  utxos: Utxo[];
  /** Private keys (or hex strings) that can sign the chosen inputs. */
  keys: Array<{ toString(): string } | string>;
  destinationAddress: string;
  amountSompi: bigint;
  changeAddress: string;
  networkId: string; // e.g. "mainnet"
  /** Extra priority fee added on top of the enforced minimum. */
  extraFeeSompi?: bigint;
}

export interface SignedSpend {
  txId: string;
  broadcastBody: BroadcastTx;
  feeSompi: bigint;
  inputCount: number;
}

/** Map a gateway UTXO to the SDK's IUtxoEntry shape (what createTransaction consumes). */
function toEntry(u: Utxo): any {
  return {
    address: u.address,
    outpoint: { transactionId: u.transactionId, index: u.index },
    amount: u.amountSompi,
    scriptPublicKey: { version: u.scriptVersion, script: u.scriptPublicKey },
    blockDaaScore: u.blockDaaScore,
    isCoinbase: u.isCoinbase,
  };
}

/**
 * Build + sign a spend offline. Mirrors the desktop synchronous path:
 *   1. take the largest-first UTXOs (cap MAX_TX_INPUTS),
 *   2. size the tx to measure the mass-based fee, floor it at KERYX_MIN_FEE (+ extra),
 *   3. rebuild with fee deducted from change, sign locally, serialize to the broadcast body.
 * Throws on insufficient funds or if the chosen inputs can't cover the amount in a single tx.
 */
export function signSpend(req: SpendRequest): SignedSpend {
  const sorted = [...req.utxos].sort((a, b) =>
    a.amountSompi < b.amountSompi ? 1 : a.amountSompi > b.amountSompi ? -1 : 0
  );
  const used = sorted.slice(0, MAX_TX_INPUTS);
  if (used.length === 0) throw new Error("No spendable UTXOs.");

  const total = used.reduce((s, e) => s + e.amountSompi, 0n);
  const sent = req.amountSompi;
  if (sent <= 0n) throw new Error("Amount must be greater than zero.");
  if (sent > total) {
    if (sorted.length > used.length) {
      throw new Error(
        `This amount needs more than ${MAX_TX_INPUTS} UTXOs in one transaction. ` +
          `Consolidate your funds first, then send.`
      );
    }
    throw new Error("Amount exceeds your spendable balance.");
  }

  const entries = used.map(toEntry);
  const build = (changeAmount: bigint) => {
    const outs: Array<{ address: string; amount: bigint }> = [
      { address: req.destinationAddress, amount: sent },
    ];
    if (changeAmount > 0n) outs.push({ address: req.changeAddress, amount: changeAmount });
    // priority_fee 0n: the real fee is inputs−outputs, set explicitly via the change amount below.
    return kaspa.createTransaction(entries as any, outs as any, 0n);
  };

  // 1) size the tx (change = everything not sent) to measure the minimum mass-based fee.
  let tx = build(total - sent);
  const massFee = (kaspa.calculateTransactionFee(req.networkId, tx) ?? 0n) as bigint;
  const fee =
    (massFee > KERYX_MIN_FEE ? massFee : KERYX_MIN_FEE) + (req.extraFeeSompi ?? 0n);

  const change = total - sent - fee;
  if (change < 0n) throw new Error("Amount + network fee exceeds your balance.");

  // 2) rebuild with the fee deducted from change, then sign locally.
  tx = build(change);
  // Pass keys as HEX strings: the packaged wasm-bindgen build rejects PrivateKey instances here
  // ("Unable to cast PrivateKey") — same cross-realm quirk noted in the desktop wallet.
  const signers = req.keys.map((k) => (typeof k === "string" ? k : k.toString()));
  const signed = kaspa.signTransaction(tx as any, signers as any, true);

  const obj = signed.serializeToObject() as unknown as SerializableTx & { id?: string };
  const broadcastBody = buildBroadcastBody(obj);
  const txId = obj.id ?? "";
  return { txId, broadcastBody, feeSompi: fee, inputCount: used.length };
}
// end of signer.ts
