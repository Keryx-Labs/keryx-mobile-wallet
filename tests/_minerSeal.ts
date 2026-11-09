// Test helper: seals an answer the way a miner does (keryx-node `inference/src/private.rs`), from the
// request secret and the miner's escrow key. Only used to exercise the requester-side opening.

import { secp256k1, schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { bytesToHex, hexToBytes } from "../src/mobile/ai/privateInference";

const utf8 = (s: string) => new TextEncoder().encode(s);
const cat = (...p: Uint8Array[]) => {
  const out = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let at = 0;
  for (const x of p) (out.set(x, at), (at += x.length));
  return out;
};
const hkdf32 = (salt: Uint8Array, ikm: Uint8Array, ...info: Uint8Array[]) => hkdf(sha256, ikm, salt, cat(...info), 32);

/** A miner escrow key whose point has an even Y (BIP-340 lift), and its x-only public key. */
export function minerKey(tag: number): { secret: Uint8Array; pubHex: string } {
  for (let i = 1; i < 255; i++) {
    const sk = new Uint8Array(32);
    sk[0] = tag;
    sk[31] = i;
    if (secp256k1.getPublicKey(sk, true)[0] === 0x02) return { secret: sk, pubHex: bytesToHex(schnorr.getPublicKey(sk)) };
  }
  throw new Error("no even key");
}

/** Response body (`magic ‖ version ‖ nonce ‖ ciphertext`) for `requestPayloadHex` under `schedule`. */
export function sealAnswer(args: {
  schedule: 1 | 2;
  requestSecret: Uint8Array;
  requestTxId: string;
  requestPayloadHex: string;
  miner: { secret: Uint8Array; pubHex: string };
  text: string;
}): string {
  const responder = hexToBytes(args.miner.pubHex);
  const nonce = new Uint8Array(12).fill(5);
  let key: Uint8Array;
  if (args.schedule === 2) {
    const root = hkdf32(utf8("KeryxPrivateInferenceV2"), args.requestSecret, utf8("root"));
    const eph = hexToBytes(args.requestPayloadHex).subarray(52 + 5, 52 + 38);
    const shared = sha256(secp256k1.getSharedSecret(args.miner.secret, eph, true));
    key = hkdf32(utf8("KeryxPrivateInferenceV2"), cat(shared, root), utf8("response"), responder);
  } else {
    key = hkdf32(utf8("KeryxPrivateInferenceV1"), args.requestSecret, utf8("response"), responder);
  }
  const aad = cat(hexToBytes(args.requestTxId), responder);
  const ct = chacha20poly1305(key, nonce, aad).encrypt(utf8(args.text));
  return bytesToHex(cat(new Uint8Array([0x00, 0x4b, 0x58, 0x50, 1]), nonce, ct));
}
