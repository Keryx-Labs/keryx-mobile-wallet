// Feature flags + navigation model. Framework-agnostic (no React import) so the shell just maps over
// it and it stays unit-testable. The AI tab is a pay-per-inference client (compose request → set KRX
// bid → sign+broadcast → await response), gated by `aiTab`.
//
// Keryx AI: a decentralized inference network where requests are PAID IN KRX (min ~0.3 KRX), miners
// run tiered models (Qwen3, Gemma-3, Dolphin-3, LLaMA-3.3, ...) on CUDA under an Optimistic
// Proof-of-Inference pipeline with results published to IPFS and on-chain AiResponse txs. The AI tab
// reuses this wallet's on-device signing path — it is a client, not a chat bot.

export interface FeatureFlags {
  biometricUnlock: boolean;
  autoLock: boolean;
  lockOnBackground: boolean;
  tradeButton: boolean;
  marketPrice: boolean;
  donate: boolean;
  advancedNodeSettings: boolean; // manual node entry lives here, NOT in the main flow
  aiTab: boolean; // AI inference client (pay-per-request in KRX)
}

export const DEFAULT_FLAGS: FeatureFlags = {
  biometricUnlock: true,
  autoLock: true,
  lockOnBackground: true,
  tradeButton: true,
  marketPrice: true,
  donate: true,
  advancedNodeSettings: true,
  aiTab: true,
};

export type SectionId = "home" | "send" | "receive" | "history" | "ai" | "settings";

export interface NavSection {
  id: SectionId;
  label: string;
  icon: string; // lucide-style icon name; the shell resolves it
  order: number;
  /** Whether the section is shown. `requiresFlag` lets a flag gate visibility (e.g. AI). */
  requiresFlag?: keyof FeatureFlags;
}

// Full section catalog in display order. AI sits between history and settings, gated by `aiTab`.
export const SECTIONS: NavSection[] = [
  { id: "home", label: "Wallet", icon: "wallet", order: 10 },
  { id: "history", label: "Activity", icon: "history", order: 40 },
  { id: "ai", label: "AI", icon: "sparkles", order: 50, requiresFlag: "aiTab" },
  { id: "settings", label: "Settings", icon: "settings", order: 60 },
];

/** Sections visible for the given flags, in display order. */
export function visibleSections(flags: FeatureFlags = DEFAULT_FLAGS): NavSection[] {
  return SECTIONS.filter((s) => !s.requiresFlag || flags[s.requiresFlag]).sort(
    (a, b) => a.order - b.order
  );
}
// end of features.ts
