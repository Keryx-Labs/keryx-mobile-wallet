// Keryx AI model registry.
//
// The live lineup is fetched DYNAMICALLY from the gateway's /api/v1/capabilities feed (available since
// the network started publishing it), so the app tracks model changes without a code update. The
// hardcoded list below is only a FALLBACK when the feed is unreachable/empty — kept in sync with the
// consensus table the node currently enforces (keryx-node params.rs → INFERENCE_REWARD_MINIMUMS_V2_H6,
// active on mainnet). capabilities gives the model name + model_id, but NOT the minimum reward, so the
// per-model consensus minimum is looked up from this table by id (with a safe default for a model we
// don't yet know). A request below a model's minimum is rejected by consensus.

import { DEFAULT_GATEWAY } from "../chain";

export interface AiModel {
  id: string; // 32-byte model_id, hex
  name: string;
  tier: string; // size hint
  minRewardSompi: bigint; // consensus minimum inference_reward (base, before the max_tokens surcharge)
}

// Fallback / minimum-reward source — the H6 lineup (mirrors params.rs INFERENCE_REWARD_MINIMUMS_V2_H6).
export const AI_MODELS: AiModel[] = [
  { id: "bd34568cd89f5f19c6c3a6e1a61b929bc868709409eaad8e672d85f3c1eb5710", name: "Qwen3.5-9B", tier: "light", minRewardSompi: 100_000_000n },
  { id: "fa2f13be0850e26c5ce86c7ac79da85e300c1da8b3290f9a18d47105f1f2140a", name: "GLM-4-9B-0414", tier: "default", minRewardSompi: 150_000_000n },
  { id: "399984045600f7d58d1b2cf01e6a4bf466fa15c7ac31bd0dd1a71e003b617cc6", name: "Gemma-4-12B", tier: "mid", minRewardSompi: 200_000_000n },
  { id: "b8bdc01fa407eab943e4fefc807483b39f8142785256049e1f559698a5284746", name: "Qwen3.6-27B", tier: "high", minRewardSompi: 250_000_000n },
  { id: "3dc09358ad75c6ef0c9c86ee4f47c4d6acda961fecbd0e4f9cf55e8f0fdffddb", name: "Kimi-Linear-48B", tier: "very-high", minRewardSompi: 400_000_000n },
];

// Safe default for a model the capabilities feed advertises but we don't have a known minimum for:
// the highest known tier, so we never charge below the consensus minimum (worst case the user slightly
// overpays for a brand-new model until the fallback table is updated).
const DEFAULT_MIN_REWARD = 400_000_000n;

export function modelById(id: string): AiModel | undefined {
  return AI_MODELS.find((m) => m.id.toLowerCase() === id.toLowerCase());
}

/**
 * Fetch the current model lineup from the gateway's capabilities feed. Returns models the network is
 * actually serving right now (name + model_id), with the per-model minimum reward resolved from the
 * known table (or a safe default). Falls back to AI_MODELS on any error / empty response.
 */
export async function fetchLiveModels(gatewayBase: string = DEFAULT_GATEWAY): Promise<AiModel[]> {
  try {
    const res = await fetch(`${gatewayBase}/capabilities`, { headers: { Accept: "application/json" } });
    if (!res.ok) return AI_MODELS;
    const arr: any = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return AI_MODELS;
    const models: AiModel[] = [];
    for (const m of arr) {
      const idHex = typeof m?.model_id_hex === "string" ? m.model_id_hex.toLowerCase() : "";
      if (!/^[0-9a-f]{64}$/.test(idHex)) continue;
      const known = AI_MODELS.find((k) => k.id === idHex);
      models.push({
        id: idHex,
        name: known?.name ?? String(m.model ?? "Model"),
        tier: known?.tier ?? "",
        minRewardSompi: known?.minRewardSompi ?? DEFAULT_MIN_REWARD,
      });
    }
    if (models.length === 0) return AI_MODELS;
    // Order light → heavy by minimum reward (stable, deterministic picker order).
    models.sort((a, b) => (a.minRewardSompi < b.minRewardSompi ? -1 : a.minRewardSompi > b.minRewardSompi ? 1 : 0));
    return models;
  } catch {
    return AI_MODELS;
  }
}

// The consensus minimum inference_reward is NOT flat per model — it scales with max_tokens. The node
// adds a surcharge of INFERENCE_REWARD_TOKEN_STEP per 64-token increment (keryx-node
// `inference/src/ai_payload.rs`): effective_min = base + ceil(max_tokens / 64) * step. A request below
// this is rejected ("inference_reward … below minimum … for model"), so the UI must charge at least
// the effective minimum for the chosen length, not just the model base.
export const INFERENCE_REWARD_TOKEN_STEP = 5_000_000n; // 0.05 KRX per 64-token step

export function effectiveMinRewardSompi(baseMinSompi: bigint, maxTokens: number): bigint {
  const steps = Number.isFinite(maxTokens) && maxTokens > 0 ? Math.ceil(maxTokens / 64) : 0;
  return baseMinSompi + BigInt(steps) * INFERENCE_REWARD_TOKEN_STEP;
}
