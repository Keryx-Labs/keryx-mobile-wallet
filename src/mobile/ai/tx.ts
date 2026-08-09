// AiRequest transaction builder — builds and signs a Keryx AI inference request ENTIRELY ON DEVICE,
// then emits a broadcast body for the REST Gateway. Same security seam as the spend signer: the
// network layer only ever sees the resulting signed transaction (public data), never keys or seed.
//
// PROTOCOL (current, "UTXO escrow" design — keryx-node consensus
// `pipeline/virtual_processor/utxo_validation.rs::check_ai_request_tx_payload_rules`):
//   - subnetwork 0300…, payload = [model_id:32][max_tokens:4 LE][inference_reward:8 LE][priority_fee:8 LE][prompt…]
//   - output[1] MUST be a CSV-pay-to-pubkey escrow (script class `CsvPubKey`) worth >= inference_reward.
//     The reward is LOCKED in this escrow output — NOT burned as fee (the old design). The escrow is a
//     bond spendable by its pubkey holder; we set it to the requester's OWN pubkey so the funds stay in
//     the user's control (miners are paid by the coinbase subsidy, not by spending this escrow).
//   - the on-chain fee (inputs − outputs) only needs to cover `priority_fee` (>= MIN_AI_REQUEST_PRIORITY_FEE),
//     which is the burned network fee.
//   - inference_reward >= model_base + ceil(max_tokens/64) * INFERENCE_REWARD_TOKEN_STEP (enforced by the UI).
// So we build: inputs → [output0 = change to self, output1 = escrow(reward)], fee = priority_fee (or the
// mass minimum if higher).

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

// Script opcodes for the CSV-pay-to-pubkey escrow (keryx-node crypto/txscript).
const OP_CHECKSEQUENCEVERIFY = 0xb1;
const OP_DATA_32 = 0x20;
const OP_CHECKSIG = 0xac;

// Relative-timelock (in blocks/DAA) the escrow is locked for before the requester can reclaim it.
// Matches the protocol's escrow/challenge window (keryx-node: "escrow ... locked via CSV, 36,000
// blocks", ~1h at 10 BPS). Consensus checks only the escrow script CLASS + value, not this lock value,
// but we use the canonical window so the escrow behaves like the rest of the network.
export const AI_ESCROW_CSV_BLOCKS = 36000n;

/** Minimal little-endian byte encoding of a u64 (>=1 byte). Used for the CSV sequence push. */
function u64MinLeBytes(v: bigint): number[] {
  const out: number[] = [];
  let x = v;
  while (x > 0n) {
    out.push(Number(x & 0xffn));
    x >>= 8n;
  }
  return out.length ? out : [0];
}
const ESCROW_SEQUENCE_BYTES = u64MinLeBytes(AI_ESCROW_CSV_BLOCKS);

export interface AiRequestSpend {
  utxos: Utxo[];
  keys: Array<{ toString(): string } | string>;
  changeAddress: string; // also the escrow pubkey owner (the requester)
  networkId: string;
  modelId: string;
  prompt: string;
  maxTokens: number;
  rewardSompi: bigint;
  priorityFeeSompi?: bigint;
}

export interface SignedAiRequest {
  txId: string;
  requestHash: string;
  broadcastBody: BroadcastTx;
  feeSompi: bigint; // on-chain (burned) fee — covers priority_fee
  escrowSompi: bigint; // reward locked in output[1]
  escrowScriptHex: string; // the CSV-p2pk script of output[1] (needed to reclaim it later)
  escrowSequence: bigint; // CSV relative-lock (blocks) the escrow is locked for
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

function hexToBytes(hex: string): number[] {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16));
  return out;
}
function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Build the CSV-pay-to-pubkey escrow script for `address`, reusing its p2pk pubkey:
 *   [seq_len][seq…][OP_CSV][OP_DATA_32][32-byte pubkey][OP_CHECKSIG]
 * (the exact shape keryx-node `ScriptClass::is_csv_pay_to_pubkey` accepts). Returns hex.
 */
export function buildEscrowScriptHex(address: string): string {
  const p2pk = kaspa.payToAddressScript(address) as { version: number; script: string };
  const p2pkBytes = hexToBytes(p2pk.script);
  // A standard schnorr p2pk is exactly: OP_DATA_32 <32-byte pubkey> OP_CHECKSIG.
  if (p2pkBytes.length !== 34 || p2pkBytes[0] !== OP_DATA_32 || p2pkBytes[33] !== OP_CHECKSIG) {
    throw new Error("Unexpected change-address script; cannot build the AI escrow output.");
  }
  const seq = ESCROW_SEQUENCE_BYTES;
  const bytes = [seq.length, ...seq, OP_CHECKSEQUENCEVERIFY, ...p2pkBytes];
  return bytesToHex(bytes);
}

/** Build + sign an AiRequest offline with the required escrow output[1]. Throws on insufficient funds. */
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
  const payloadBytes = serializeAiRequest(request);
  const requestHash = aiRequestHash(request);

  const sorted = [...req.utxos].sort((a, b) =>
    a.amountSompi < b.amountSompi ? 1 : a.amountSompi > b.amountSompi ? -1 : 0
  );
  const used = sorted.slice(0, MAX_TX_INPUTS);
  if (used.length === 0) throw new Error("No spendable UTXOs.");
  const total = used.reduce((s, e) => s + e.amountSompi, 0n);

  // The escrow (reward) is an OUTPUT; the fee only needs to cover priority_fee. Need change > 0 so the
  // escrow lands at output[1] (consensus requires outputs[1] to be the escrow).
  const needFloor = reward + priorityFee;
  if (total <= needFloor) {
    if (sorted.length > used.length) {
      throw new Error(
        `This request needs more than ${MAX_TX_INPUTS} UTXOs in one transaction. ` +
          `Consolidate your funds first, then try again.`
      );
    }
    throw new Error("Your balance can't cover this AI request (reward + priority fee + change).");
  }

  const entries = used.map(toEntry);
  const escrowSpk = new kaspa.ScriptPublicKey(0, buildEscrowScriptHex(req.changeAddress) as any);

  const build = (fee: bigint): { tx: any; change: bigint } => {
    const change = total - reward - fee;
    // output[0] = change to self (created via createTransaction so it's a proper p2pk output),
    // then output[1] = the escrow, set before signing so the signature covers it.
    const tx: any = kaspa.createTransaction(
      entries as any,
      [{ address: req.changeAddress, amount: change }] as any,
      0n,
      payloadBytes as any
    );
    const changeOut = tx.outputs[0];
    tx.outputs = [changeOut, new kaspa.TransactionOutput(reward, escrowSpk)];
    tx.subnetworkId = AI_REQUEST_SUBNETWORK_ID;
    tx.gas = 0n;
    return { tx, change };
  };

  // First size with fee = priority_fee, then bump to the mass minimum if that's higher.
  let fee = priorityFee;
  let { tx, change } = build(fee);
  const massFee = (kaspa.calculateTransactionFee(req.networkId, tx) ?? 0n) as bigint;
  if (massFee > fee) {
    fee = massFee;
    if (total <= reward + fee) throw new Error("Your balance can't cover this AI request (network fee).");
    ({ tx, change } = build(fee));
  }
  if (change <= 0n) throw new Error("Your balance can't cover this AI request (reward + fee + change).");

  const signers = req.keys.map((k) => (typeof k === "string" ? k : k.toString()));
  const signed = kaspa.signTransaction(tx as any, signers as any, true);
  const obj = signed.serializeToObject() as unknown as SerializableTx & { id?: string };
  const broadcastBody = buildBroadcastBody(obj);
  return {
    txId: obj.id ?? "",
    requestHash,
    broadcastBody,
    feeSompi: fee,
    escrowSompi: reward,
    escrowScriptHex: buildEscrowScriptHex(req.changeAddress),
    escrowSequence: AI_ESCROW_CSV_BLOCKS,
    inputCount: used.length,
    payloadHex: broadcastBody.payload,
  };
}
// end of tx.ts
