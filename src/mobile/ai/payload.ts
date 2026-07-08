// AiRequest / AiResponse on-chain payload codec — byte-for-byte matching keryx-node
// `inference/src/ai_payload.rs`.
//
//   AiRequest  payload = [model_id:32][max_tokens:4 LE][inference_reward:8 LE][priority_fee:8 LE][prompt…]
//   AiResponse payload = [request_hash:32][challenge_window_end:8 LE][ipfs_cid:34][response_length:4 LE]
//   request_hash = blake2b(AiRequest_payload)[0..32]   (see fraud_proof.rs)
//   IPFS CID     = base58btc(response_ipfs_cid) → "Qm…" (CIDv0)
//
// These are pure functions (no network, no wallet) so they're fully unit-testable.

import { blake2b } from "@noble/hashes/blake2b";

export const AI_REQUEST_SUBNETWORK_ID = "0300000000000000000000000000000000000000";
export const AI_RESPONSE_SUBNETWORK_ID = "0400000000000000000000000000000000000000";
export const MIN_AI_REQUEST_PRIORITY_FEE = 30_000_000n; // 0.3 KRX
export const MAX_AI_REQUEST_PAYLOAD_LEN = 4096;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}
function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}
function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}
function u64le(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

export interface AiRequest {
  modelId: string; // 32-byte hex
  maxTokens: number;
  inferenceReward: bigint; // sompi paid to the miner
  priorityFee: bigint; // sompi burned (>= MIN_AI_REQUEST_PRIORITY_FEE)
  prompt: string; // UTF-8
}

/** Serialize an AiRequest to its on-chain payload bytes. */
export function serializeAiRequest(r: AiRequest): Uint8Array {
  const model = hexToBytes(r.modelId);
  if (model.length !== 32) throw new Error("model_id must be 32 bytes");
  const promptBytes = new TextEncoder().encode(r.prompt);
  const out = new Uint8Array(52 + promptBytes.length);
  out.set(model, 0);
  out.set(u32le(r.maxTokens), 32);
  out.set(u64le(r.inferenceReward), 36);
  out.set(u64le(r.priorityFee), 44);
  out.set(promptBytes, 52);
  if (out.length > MAX_AI_REQUEST_PAYLOAD_LEN) throw new Error("prompt too long");
  return out;
}

/** Payload as hex (for the tx payload field). */
export function aiRequestPayloadHex(r: AiRequest): string {
  return bytesToHex(serializeAiRequest(r));
}

/** request_hash = blake2b(payload)[0..32] — used to match the AiResponse that answers this request. */
export function aiRequestHash(r: AiRequest): string {
  return bytesToHex(blake2b(serializeAiRequest(r), { dkLen: 32 }));
}

export interface AiResponse {
  requestHash: string; // hex
  challengeWindowEnd: bigint;
  cid: string; // CIDv0 "Qm…"
  responseLength: number;
}

/** Parse an AiResponse payload (hex) from an on-chain response tx. */
export function parseAiResponse(payloadHex: string): AiResponse | null {
  const b = hexToBytes(payloadHex);
  if (b.length !== 78) return null;
  const dv = new DataView(b.buffer);
  return {
    requestHash: bytesToHex(b.slice(0, 32)),
    challengeWindowEnd: dv.getBigUint64(32, true),
    cid: base58btcEncode(b.slice(40, 74)), // 34-byte multihash → CIDv0
    responseLength: dv.getUint32(74, true),
  };
}

/** Base58btc (Bitcoin/IPFS alphabet) — ported from keryx-node ai_payload.rs `base58btc_encode`. */
export function base58btcEncode(input: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const digits: number[] = [0];
  for (const byte of input) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let leadingZeros = 0;
  for (const b of input) {
    if (b === 0) leadingZeros++;
    else break;
  }
  let out = "";
  for (let i = 0; i < leadingZeros; i++) out += ALPHABET[0];
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
  return out;
}
