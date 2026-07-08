// AiRequest transaction builder — builds and signs a Keryx AI inference request ENTIRELY ON DEVICE,
// then emits a broadcast body for the REST Gateway. Same security seam as the spend signer: the
// network layer only ever sees the resulting signed transaction (public data), never keys or seed.
//
// An AiRequest is a special-subnetwork (0300…) transaction whose PAYLOAD carries the request
// (model, prompt, reward, priority-fee) and whose on-chain FEE (inputs − outputs) IS the payment
// miners collect. So we build it like a "spend to nobody": inputs → change only, with the fee set to
// exactly reward + priorityFee. No destination output; the miner claims the fee by answering.

import * as kaspa from "../../sdk/kaspa.js";
import type { Utxo } from "../chain";
import { buildBroadcastBody, BroadcastTx, SerializableTx, MAX_TX_INPUTS } from "../chain";
import {
  AI_REQUEST_SUBNETWORK_ID,
  MIN_AI_REQUEST_PRIORITY_FEE,
  serializeAiRequest,
  aiRequestHash,
  type AiRequest,
} from "./payload";

export interface AiRequestSpend {
  utxos: Utxo[];
  /** Private keys (or hex strings) that can sign the chosen inputs. */
  keys: Array<{ toString(): string } | string>;
  changeAddress: string;
  networkId: string;
  modelId: string; // 32-byte hex
  prompt: string;
  maxTokens: number;
  /** Inference reward paid to the miner (must be ≥ the model minimum). */
  rewardSompi: bigint;
  /** Extra priority fee on top of the reward; defaults to the protocol minimum. */
  priorityFeeSompi?: bigint;
}

export interface SignedAiRequest {
  txId: string;
  requestHash: string; // hex — matches the AiResponse that answers this request
  broadcastBody: BroadcastTx;
  feeSompi: bigint; // total on-chain fee = reward + priorityFee (the miner's payment)
  inputCount: number;
  payloadHex: string;
}

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
 * Build + sign an AiRequest offline. Reuses the audited synchronous SDK path
 * (`createTransaction` → `signTransaction`), setting the AI subnetwork id + payload before signing
 * so the signature covers them. Throws on insufficient funds.
 */
export function signAiRequest(req: AiRequestSpend): SignedAiRequest {
  if (req.maxTokens <= 0) throw new Error("maxTokens must be greater than zero.");
  if (req.rewardSompi <= 0n) throw new Error("The inference reward must be greater than zero.");
  const priorityFee = req.priorityFeeSompi ?? MIN_AI_REQUEST_PRIORITY_FEE;
  const reward = req.rewardSompi;
  const request: AiRequest = {
    modelId: req.modelId,
    maxTokens: req.maxTokens,
    inferenceReward: reward,
    priorityFee,
    prompt: req.prompt,
  };
  const payloadBytes = serializeAiRequest(request); // throws if prompt too long / bad model id
  const requestHash = aiRequestHash(request);

  // The miner's payment == the on-chain fee (inputs − outputs).
  const fee = reward + priorityFee;

  const sorted = [...req.utxos].sort((a, b) =>
    a.amountSompi < b.amountSompi ? 1 : a.amountSompi > b.amountSompi ? -1 : 0
  );
  const used = sorted.slice(0, MAX_TX_INPUTS);
  if (used.length === 0) throw new Error("No spendable UTXOs.");
  const total = used.reduce((s, e) => s + e.amountSompi, 0n);
  if (fee > total) {
    if (sorted.length > used.length) {
      throw new Error(
        `This request needs more than ${MAX_TX_INPUTS} UTXOs in one transaction. ` +
          `Consolidate your funds first, then try again.`
      );
    }
    throw new Error("Your balance can't cover this AI request (reward + priority fee).");
  }
  const change = total - fee;

  const entries = used.map(toEntry);
  const outs: Array<{ address: string; amount: bigint }> =
    change > 0n ? [{ address: req.changeAddress, amount: change }] : [];

  // payload set via createTransaction; subnetwork id + gas set before signing so they're covered.
  const tx: any = kaspa.createTransaction(entries as any, outs as any, 0n, payloadBytes as any);
  tx.subnetworkId = AI_REQUEST_SUBNETWORK_ID;
  tx.gas = 0n;

  // Sanity: our fee must cover the mass-based minimum for a payload-carrying tx.
  const massFee = (kaspa.calculateTransactionFee(req.networkId, tx) ?? 0n) as bigint;
  if (massFee > fee) {
    throw new Error(
      `Raise your bid: the network mass fee (${massFee} sompi) exceeds reward + priority fee (${fee} sompi).`
    );
  }

  const signers = req.keys.map((k) => (typeof k === "string" ? k : k.toString()));
  const signed = kaspa.signTransaction(tx as any, signers as any, true);
  const obj = signed.serializeToObject() as unknown as SerializableTx & { id?: string };
  const broadcastBody = buildBroadcastBody(obj);
  return {
    txId: obj.id ?? "",
    requestHash,
    broadcastBody,
    feeSompi: fee,
    inputCount: used.length,
    payloadHex: broadcastBody.payload,
  };
}
// end of tx.ts
