// AiRequest transaction builder: builds and signs a Keryx AI request on device and emits a broadcast
// body for the gateway. The network layer only sees the signed transaction.
//
// Shape: subnetwork 0300…, payload = public header ‖ sealed envelope (see privateInference.ts),
// output[0] = change to self, output[1] = the reward vault (>= inference_reward), fee >= priority_fee.
// Inputs are fixed before sealing: the first one seeds the target cohort.

import * as kaspa from "../../sdk/kaspa.js";
import type { Utxo } from "../chain";
import { buildBroadcastBody, BroadcastTx, SerializableTx, MAX_TX_INPUTS } from "../chain";
import { AI_REQUEST_SUBNETWORK_ID, MIN_AI_REQUEST_PRIORITY_FEE, aiRequestHashOfPayload } from "./payload";

// Script opcodes for the CSV-pay-to-pubkey escrow (keryx-node crypto/txscript).
const OP_CHECKSEQUENCEVERIFY = 0xb1;
const OP_DATA_32 = 0x20;
const OP_CHECKSIG = 0xac;

// Since the H8 reward-routing hard fork, an AiRequest's escrow output[1] MUST be this canonical keyless
// vault script — `OP_RETURN "aivault"` (keryx-node `INFERENCE_VAULT_SCRIPT`) — instead of the old
// CSV-pay-to-pubkey. The reward locked here is minted by the coinbase to the FIRST miner that answers,
// so it genuinely pays for the inference (it is NOT reclaimable by the requester). A CSV-p2pk escrow is
// now rejected by consensus. Value must still be >= inference_reward.
export const INFERENCE_VAULT_SCRIPT_HEX = "6a0761697661756c74"; // OP_RETURN <"aivault">

// Mainnet DAA at which reward-routing (H8) activated. Before this, AiRequest escrows were CSV-pay-to-
// pubkey (reclaimable by the requester); at/after it they are the keyless vault (paid to the miner).
export const REWARD_ROUTING_ACTIVATION_DAA = 79_210_000n;

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
  /** Inputs from `selectRequestInputs`, spent in this order: the first one seeds the target cohort. */
  inputs: Utxo[];
  keys: Array<{ toString(): string } | string>;
  changeAddress: string;
  networkId: string;
  /** Full AiRequest payload (public header ‖ sealed envelope), hex. */
  payloadHex: string;
  rewardSompi: bigint;
  priorityFeeSompi?: bigint;
}

// KIP-9 storage mass bound kept below the node's standard limit (mirrors the website's wallet).
const STORAGE_MASS_PARAMETER = 1_000_000_000_000n;
const MASS_BUDGET = 80_000n;

/** Whether a change output next to the reward vault keeps the storage mass under budget. */
export function requestChangeFits(changeSompi: bigint, rewardSompi: bigint): boolean {
  if (changeSompi <= 0n) return false;
  const vaultMass = rewardSompi > 0n ? STORAGE_MASS_PARAMETER / rewardSompi : 0n;
  return STORAGE_MASS_PARAMETER / changeSompi + vaultMass <= MASS_BUDGET;
}

/** Confirmed UTXOs, largest first, pooled until the change is large enough. Callers pass mature UTXOs. */
export function selectRequestInputs(utxos: Utxo[], priorityFeeSompi: bigint, rewardSompi: bigint): Utxo[] {
  const candidates = utxos
    .filter((u) => u.blockDaaScore > 0n)
    .sort((a, b) => (a.amountSompi < b.amountSompi ? 1 : a.amountSompi > b.amountSompi ? -1 : 0));
  const selected: Utxo[] = [];
  let total = 0n;
  for (const c of candidates) {
    if (selected.length >= MAX_TX_INPUTS) break;
    selected.push(c);
    total += c.amountSompi;
    if (requestChangeFits(total - priorityFeeSompi - rewardSompi, rewardSompi)) break;
  }
  return selected;
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

/** Build + sign an AiRequest offline: output[0] = change, output[1] = the reward vault. */
export function signAiRequest(req: AiRequestSpend): SignedAiRequest {
  if (req.rewardSompi <= 0n) throw new Error("The inference reward must be greater than zero.");
  if (req.inputs.length === 0) throw new Error("No spendable UTXOs.");
  if (req.inputs.length > MAX_TX_INPUTS) {
    throw new Error(`This request needs more than ${MAX_TX_INPUTS} UTXOs. Consolidate your funds first, then try again.`);
  }
  const priorityFee = req.priorityFeeSompi ?? MIN_AI_REQUEST_PRIORITY_FEE;
  const reward = req.rewardSompi;
  const payload = hexToU8(req.payloadHex);
  const total = req.inputs.reduce((s, e) => s + e.amountSompi, 0n);
  if (total <= reward + priorityFee) throw new Error("Your balance can't cover this AI request (reward + priority fee + change).");

  const entries = req.inputs.map(toEntry);
  const vaultSpk = new kaspa.ScriptPublicKey(0, INFERENCE_VAULT_SCRIPT_HEX as any);

  const build = (fee: bigint): { tx: any; change: bigint } => {
    const change = total - reward - fee;
    const tx: any = kaspa.createTransaction(
      entries as any,
      [{ address: req.changeAddress, amount: change }] as any,
      0n,
      payload as any
    );
    const changeOut = tx.outputs[0];
    tx.outputs = [changeOut, new kaspa.TransactionOutput(reward, vaultSpk)];
    tx.subnetworkId = AI_REQUEST_SUBNETWORK_ID;
    tx.gas = 0n;
    return { tx, change };
  };

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
  const first = broadcastBody.inputs[0];
  if (!first || first.transaction_id !== req.inputs[0].transactionId || first.index !== req.inputs[0].index) {
    throw new Error("The request's first input changed while signing; nothing was sent.");
  }
  return {
    txId: obj.id ?? "",
    requestHash: aiRequestHashOfPayload(payload),
    broadcastBody,
    feeSompi: fee,
    escrowSompi: reward,
    escrowScriptHex: INFERENCE_VAULT_SCRIPT_HEX,
    escrowSequence: 0n,
    inputCount: req.inputs.length,
    payloadHex: broadcastBody.payload,
  };
}

function hexToU8(hex: string): Uint8Array {
  return Uint8Array.from(hexToBytes(hex));
}
// end of tx.ts
