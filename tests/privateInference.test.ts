// @vitest-environment node
//
// The module is a verbatim copy of keryx-ecosystem/lib/privateInference.ts; these tests check that it
// builds and round-trips inside the mobile toolchain.

import { describe, it, expect } from "vitest";
import { schnorr } from "@noble/curves/secp256k1.js";
import {
  AI_REQUEST_HEADER_LEN,
  MAX_PRIVATE_RECIPIENTS,
  bytesToHex,
  hexToBytes,
  cohortSeed,
  compressPrompt,
  deriveRequestSecret,
  openOwnPrompt,
  requestHeaderBytes,
  sealRecipients,
  sealRequest,
  type KeySchedule,
} from "../src/mobile/ai/privateInference";

const MODEL_ID = "11".repeat(32);
const WALLET_KEY = "22".repeat(32);
const TXID = "33".repeat(32);

function escrowKey(i: number): string {
  const sk = new Uint8Array(32);
  sk[31] = i + 1;
  return bytesToHex(schnorr.getPublicKey(sk));
}

function seal(prompt: string | Uint8Array, schedule: KeySchedule, recipients = [escrowKey(0), escrowKey(1)]) {
  const secret = deriveRequestSecret(WALLET_KEY, cohortSeed(TXID, 0));
  const payloadHex = sealRequest({
    modelIdHex: MODEL_ID,
    maxTokens: 512,
    inferenceRewardSompi: 250_000_000,
    priorityFeeSompi: 30_000_000,
    prompt,
    recipientsHex: recipients,
    secret,
    schedule,
  });
  return { secret, payload: hexToBytes(payloadHex) };
}

describe("private inference module", () => {
  it("lays out the 52-byte public header little-endian", () => {
    const h = requestHeaderBytes(MODEL_ID, 512, 250_000_000, 30_000_000);
    expect(h.length).toBe(AI_REQUEST_HEADER_LEN);
    const v = new DataView(h.buffer);
    expect(bytesToHex(h.subarray(0, 32))).toBe(MODEL_ID);
    expect(v.getUint32(32, true)).toBe(512);
    expect(v.getBigUint64(36, true)).toBe(250_000_000n);
    expect(v.getBigUint64(44, true)).toBe(30_000_000n);
  });

  it("encodes the cohort seed as txid ‖ index u32 LE", () => {
    const s = cohortSeed(TXID, 7);
    expect(s.length).toBe(36);
    expect(bytesToHex(s)).toBe(TXID + "07000000");
  });

  for (const schedule of [1, 2] as const) {
    it(`seals and reopens its own prompt under key schedule ${schedule}`, () => {
      const { secret, payload } = seal("What is Keryx?", schedule);
      expect(bytesToHex(payload.subarray(0, 32))).toBe(MODEL_ID);
      expect(openOwnPrompt(secret, payload)).toBe("What is Keryx?");
    });
  }

  it("derives the schedule-2 ephemeral key from the request secret", () => {
    const a = seal("one", 2).payload;
    const b = seal("two", 2).payload;
    const eph = (p: Uint8Array) => bytesToHex(p.subarray(AI_REQUEST_HEADER_LEN + 5, AI_REQUEST_HEADER_LEN + 38));
    expect(eph(a)).toBe(eph(b));
    expect(eph(seal("one", 1).payload)).not.toBe(eph(seal("one", 1).payload));
  });

  it("does not open a request with another wallet's secret", () => {
    const { payload } = seal("secret prompt", 2);
    const other = deriveRequestSecret("44".repeat(32), cohortSeed(TXID, 0));
    expect(() => openOwnPrompt(other, payload)).toThrow();
  });

  it("refuses to seal without recipients", () => {
    expect(() => seal("x", 2, [])).toThrow(/no recipients/);
  });

  it("dedupes, sorts and caps the recipient list", () => {
    const cohort = Array.from({ length: 150 }, (_, i) => escrowKey(i));
    const chosen = sealRecipients(cohortSeed(TXID, 0), [...cohort, cohort[0].toUpperCase()]);
    expect(chosen.length).toBe(MAX_PRIVATE_RECIPIENTS);
    expect([...chosen].sort()).toEqual(chosen);
    expect(sealRecipients(cohortSeed(TXID, 0), cohort)).toEqual(chosen);
  });

  it("compresses a prompt behind the KZ magic", async () => {
    const z = await compressPrompt("hello ".repeat(200));
    expect(bytesToHex(z.subarray(0, 4))).toBe("004b5a01");
    expect(z.length).toBeLessThan(200);
  });
});
