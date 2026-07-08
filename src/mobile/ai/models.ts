// Keryx AI model registry — the current on-chain lineup (H2, 5 tiers).
//
// model_id = sha2-256(model weights) = base58-decode(weight CID)[2..34]. Values + minimum
// inference_reward are mirrored VERBATIM from keryx-node `consensus/core/src/config/params.rs`
// (`INFERENCE_REWARD_MINIMUMS_V2_H2`). A request below a model's minimum reward is rejected by
// consensus, so the UI must charge at least this much.

export interface AiModel {
  id: string; // 32-byte model_id, hex
  name: string;
  tier: string; // miner flag / size hint
  minRewardSompi: bigint; // consensus minimum inference_reward
}

export const AI_MODELS: AiModel[] = [
  { id: "4f21ddeb7d62bd2265bc54230d536ca3f1749927780f528c3c41fa2911df4d72", name: "Qwen3-1.7B", tier: "very-light", minRewardSompi: 30_000_000n },
  { id: "ad50ad0bd461d8ab44efc0214989eb33291685ef4ade22a0f4f217d03266d837", name: "Gemma-3-4B", tier: "light", minRewardSompi: 50_000_000n },
  { id: "9421066a6400c98ba137114f7f4b7d4a2ddf13ab163a5de38c0184793af6313a", name: "Dolphin-3.0-8B", tier: "default", minRewardSompi: 150_000_000n },
  { id: "65c6eb6fe18b9efd8060ab9d2d03bb9b01050a3b1378cbac000c5cc0acdc0d2a", name: "Qwen3-32B", tier: "high", minRewardSompi: 250_000_000n },
  { id: "6df46a78cbe4dc579f04dbd801f1a520b9eae28ce7b50c8da7874bfa3fb5108d", name: "LLaMA-3.3-70B", tier: "very-high", minRewardSompi: 400_000_000n },
];

export function modelById(id: string): AiModel | undefined {
  return AI_MODELS.find((m) => m.id.toLowerCase() === id.toLowerCase());
}
