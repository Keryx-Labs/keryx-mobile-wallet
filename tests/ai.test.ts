import { describe, it, expect } from "vitest";
import {
  serializeAiRequest,
  aiRequestHash,
  parseAiResponse,
  base58btcEncode,
  MIN_AI_REQUEST_PRIORITY_FEE,
} from "../src/mobile/ai/payload";
import { AI_MODELS, modelById } from "../src/mobile/ai/models";

const GEMMA = "ad50ad0bd461d8ab44efc0214989eb33291685ef4ade22a0f4f217d03266d837";

describe("AI request payload (matches keryx-node ai_payload.rs)", () => {
  it("serializes the exact byte layout", () => {
    const p = serializeAiRequest({
      modelId: GEMMA,
      maxTokens: 256,
      inferenceReward: 50_000_000n,
      priorityFee: MIN_AI_REQUEST_PRIORITY_FEE,
      prompt: "hi",
    });
    expect(p.length).toBe(52 + 2);
    // model_id at [0..32]
    expect([...p.slice(0, 32)].map((b) => b.toString(16).padStart(2, "0")).join("")).toBe(GEMMA);
    // max_tokens u32 LE at [32..36] = 256 -> 00 01 00 00
    expect([...p.slice(32, 36)]).toEqual([0, 1, 0, 0]);
    // inference_reward u64 LE at [36..44] = 50_000_000
    const dv = new DataView(p.buffer);
    expect(dv.getBigUint64(36, true)).toBe(50_000_000n);
    expect(dv.getBigUint64(44, true)).toBe(MIN_AI_REQUEST_PRIORITY_FEE);
    // prompt "hi" at [52..]
    expect([...p.slice(52)]).toEqual([104, 105]);
  });

  it("request_hash is a deterministic 32-byte blake2b", () => {
    const r = { modelId: GEMMA, maxTokens: 128, inferenceReward: 50_000_000n, priorityFee: 30_000_000n, prompt: "test" };
    const h1 = aiRequestHash(r);
    const h2 = aiRequestHash(r);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    // changing the prompt changes the hash
    expect(aiRequestHash({ ...r, prompt: "test2" })).not.toBe(h1);
  });
});

describe("base58btc CID encoding (verified against a real Keryx model CID)", () => {
  it("encodes model_id multihash to the known Gemma weight CID", () => {
    // CIDv0 = base58btc( 0x12 0x20 || sha2-256(weights) ); model_id IS that sha2-256.
    const mh = new Uint8Array(34);
    mh[0] = 0x12;
    mh[1] = 0x20;
    for (let i = 0; i < 32; i++) mh[2 + i] = parseInt(GEMMA.substr(i * 2, 2), 16);
    expect(base58btcEncode(mh)).toBe("Qma1CbFzWTNhy2ReVjDG1GvM5q2Uy4VhqTbnS9c641jUQ6");
  });
});

describe("AI response parsing", () => {
  it("parses a 78-byte response payload and encodes its CID", () => {
    const buf = new Uint8Array(78);
    for (let i = 0; i < 32; i++) buf[i] = i; // request_hash
    new DataView(buf.buffer).setBigUint64(32, 12345n, true); // challenge_window_end
    buf[40] = 0x12;
    buf[41] = 0x20; // multihash prefix
    for (let i = 0; i < 32; i++) buf[42 + i] = 0xab;
    new DataView(buf.buffer).setUint32(74, 500, true); // response_length
    const hex = [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
    const r = parseAiResponse(hex)!;
    expect(r.challengeWindowEnd).toBe(12345n);
    expect(r.responseLength).toBe(500);
    expect(r.cid.startsWith("Qm")).toBe(true);
    expect(parseAiResponse("00")).toBeNull();
  });
});

describe("model registry", () => {
  it("has the 5-tier lineup with correct minimum rewards", () => {
    expect(AI_MODELS.map((m) => m.name)).toEqual([
      "Qwen3-1.7B",
      "Gemma-3-4B",
      "Dolphin-3.0-8B",
      "Qwen3-32B",
      "LLaMA-3.3-70B",
    ]);
    expect(modelById(GEMMA)?.minRewardSompi).toBe(50_000_000n);
  });
});
