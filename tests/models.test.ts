// @vitest-environment node
//
// The AI model registry FALLBACK must mirror the node's active consensus table (H6 lineup,
// INFERENCE_REWARD_MINIMUMS_V2_H6). The live list is fetched from /capabilities; this hardcoded list is
// the offline fallback + the per-model minimum-reward source. A wrong model_id or below-minimum reward
// would get the AiRequest rejected by consensus.

import { describe, it, expect, afterEach } from "vitest";
import { AI_MODELS, modelById, effectiveMinRewardSompi, fetchLiveModels } from "../src/mobile/ai/models";

describe("AI model registry (H6 lineup)", () => {
  it("has the five current tiers with valid 32-byte ids and consensus minimums", () => {
    expect(AI_MODELS).toHaveLength(5);
    for (const m of AI_MODELS) {
      expect(m.id).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.minRewardSompi).toBeGreaterThan(0n);
    }
    // Exact H6 values mirrored from keryx-node params.rs (INFERENCE_REWARD_MINIMUMS_V2_H6).
    expect(AI_MODELS.map((m) => m.name)).toEqual([
      "Qwen3.5-9B",
      "GLM-4-9B-0414",
      "Gemma-4-12B",
      "Qwen3.6-27B",
      "Kimi-Linear-48B",
    ]);
    expect(AI_MODELS.map((m) => m.minRewardSompi)).toEqual([
      100_000_000n,
      150_000_000n,
      200_000_000n,
      250_000_000n,
      400_000_000n,
    ]);
  });

  it("ids are unique and minimums are strictly ascending by tier", () => {
    const ids = new Set(AI_MODELS.map((m) => m.id));
    expect(ids.size).toBe(AI_MODELS.length);
    for (let i = 1; i < AI_MODELS.length; i++) {
      expect(AI_MODELS[i].minRewardSompi > AI_MODELS[i - 1].minRewardSompi).toBe(true);
    }
  });

  it("effectiveMinRewardSompi adds the node's per-64-token surcharge (ceil)", () => {
    const glm = AI_MODELS.find((m) => m.name === "GLM-4-9B-0414")!;
    expect(glm.minRewardSompi).toBe(150_000_000n);
    // The reported rejection: GLM at 256 max_tokens requires 170_000_000 (150M + 4 × 5M).
    expect(effectiveMinRewardSompi(glm.minRewardSompi, 256)).toBe(170_000_000n);
    // ceil semantics + edges
    expect(effectiveMinRewardSompi(150_000_000n, 0)).toBe(150_000_000n); // no length → base
    expect(effectiveMinRewardSompi(150_000_000n, 1)).toBe(155_000_000n); // ceil(1/64)=1 step
    expect(effectiveMinRewardSompi(150_000_000n, 64)).toBe(155_000_000n); // exactly 1 step
    expect(effectiveMinRewardSompi(150_000_000n, 65)).toBe(160_000_000n); // rolls to 2 steps
    expect(effectiveMinRewardSompi(150_000_000n, 128)).toBe(160_000_000n); // 2 steps
  });

  it("modelById resolves case-insensitively and returns undefined for unknown ids", () => {
    const m = AI_MODELS[0];
    expect(modelById(m.id)?.name).toBe(m.name);
    expect(modelById(m.id.toUpperCase())?.name).toBe(m.name);
    expect(modelById("deadbeef")).toBeUndefined();
  });
});

describe("fetchLiveModels (dynamic /capabilities)", () => {
  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  it("parses the capabilities feed into models (min reward from the known table, sorted asc)", async () => {
    (globalThis as any).fetch = async () => ({
      ok: true,
      json: async () => [
        { model: "kimi-linear-48b", model_id_hex: "3dc09358ad75c6ef0c9c86ee4f47c4d6acda961fecbd0e4f9cf55e8f0fdffddb", miner_count: "10" },
        { model: "qwen3.5-9b-abliterated", model_id_hex: "bd34568cd89f5f19c6c3a6e1a61b929bc868709409eaad8e672d85f3c1eb5710", miner_count: "37" },
        { model: "brand-new-model", model_id_hex: "aa".repeat(32), miner_count: "1" }, // unknown -> safe default
        { model: "garbage", model_id_hex: "not-hex" }, // dropped
      ],
    });
    const models = await fetchLiveModels("https://x/api/v1");
    // Sorted ascending by min reward; the two 400M entries keep input order (stable sort: kimi, then unknown).
    expect(models.map((m) => m.name)).toEqual(["Qwen3.5-9B", "Kimi-Linear-48B", "brand-new-model"]);
    expect(models[0].minRewardSompi).toBe(100_000_000n); // qwen3.5-9b known min
    expect(models[1].minRewardSompi).toBe(400_000_000n); // kimi known min
    expect(models[2].minRewardSompi).toBe(400_000_000n); // unknown -> safe default (never under-charge)
  });

  it("falls back to the bundled list on error or empty response", async () => {
    (globalThis as any).fetch = async () => ({ ok: false });
    expect(await fetchLiveModels("https://x/api/v1")).toBe(AI_MODELS);
    (globalThis as any).fetch = async () => ({ ok: true, json: async () => [] });
    expect(await fetchLiveModels("https://x/api/v1")).toBe(AI_MODELS);
    (globalThis as any).fetch = async () => {
      throw new Error("network");
    };
    expect(await fetchLiveModels("https://x/api/v1")).toBe(AI_MODELS);
  });
});
