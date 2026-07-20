// Keryx AI model registry — the current on-chain lineup.
//
// model_id = sha2-256(model weight file) = base58-decode(weight CID)[2..34]. The ids and minimum
// inference_reward values below are mirrored VERBATIM from keryx-node
// `consensus/core/src/config/params.rs` → `INFERENCE_REWARD_MINIMUMS_V2_H4`, the table enforced by
// consensus since the **H4 hard fork** (`H4_ACTIVATION_DAA = 54_766_000`, which mainnet has passed).
// A request for a model not in this table — or below its minimum reward — is rejected by the node, so
// the UI must only offer these models and charge at least the minimum. Re-sync this file whenever the
// node activates a new lineup (see keryx-miner `src/models.rs`, which the node mirrors in lockstep).

export interface AiModel {
  id: string; // 32-byte model_id, hex
  name: string;
  tier: string; // miner flag / size hint
  minRewardSompi: bigint; // consensus minimum inference_reward
}

export const AI_MODELS: AiModel[] = [
  { id: "300a99b3a85b0ab45d1d930bb7b1d4b0f35983d521e79ff21193a6908dc4b810", name: "EXAONE-4.0-1.2B", tier: "very-light", minRewardSompi: 50_000_000n },
  { id: "8c2fea600f0eefe7048741a5119cb7be303037f59fc026e48382658f23581e0a", name: "Mistral-7B-v0.3", tier: "light", minRewardSompi: 100_000_000n },
  { id: "fa2f13be0850e26c5ce86c7ac79da85e300c1da8b3290f9a18d47105f1f2140a", name: "GLM-4-9B-0414", tier: "default", minRewardSompi: 150_000_000n },
  { id: "b8bdc01fa407eab943e4fefc807483b39f8142785256049e1f559698a5284746", name: "Qwen3.6-27B", tier: "high", minRewardSompi: 250_000_000n },
  { id: "3dc09358ad75c6ef0c9c86ee4f47c4d6acda961fecbd0e4f9cf55e8f0fdffddb", name: "Kimi-Linear-48B", tier: "very-high", minRewardSompi: 400_000_000n },
];

export function modelById(id: string): AiModel | undefined {
  return AI_MODELS.find((m) => m.id.toLowerCase() === id.toLowerCase());
}
