// @vitest-environment node
//
// The AI model registry must mirror the node's active consensus table (H4 lineup,
// INFERENCE_REWARD_MINIMUMS_V2_H4). These checks guard against malformed ids and stale data — a wrong
// model_id or below-minimum reward would get the AiRequest rejected by consensus.

import { describe, it, expect } from "vitest";
import { AI_MODELS, modelById, effectiveMinRewardSompi } from "../src/mobile/ai/models";

describe("AI model registry (H4 lineup)", () => {
  it("has the five current tiers with valid 32-byte ids and consensus minimums", () => {
    expect(AI_MODELS).toHaveLength(5);
    for (const m of AI_MODELS) {
      expect(m.id).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.minRewardSompi).toBeGreaterThan(0n);
    }
    // Exact H4 values mirrored from keryx-node params.rs (INFERENCE_REWARD_MINIMUMS_V2_H4).
    expect(AI_MODELS.map((m) => m.name)).toEqual([
      "EXAONE-4.0-1.2B",
      "Mistral-7B-v0.3",
      "GLM-4-9B-0414",
      "Qwen3.6-27B",
      "Kimi-Linear-48B",
    ]);
    expect(AI_MODELS.map((m) => m.minRewardSompi)).toEqual([
      50_000_000n,
      100_000_000n,
      150_000_000n,
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
