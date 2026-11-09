// @vitest-environment node

import { describe, it, expect, vi, afterEach } from "vitest";
import { buildChatPrompt, CONTINUE_PROMPT, looksTruncated, normalizeTicker, questionOfPrompt } from "../src/mobile/ai/prompt";
import type { FactsApi } from "../src/mobile/ai/factsApi";

const NOW = new Date("2026-11-09T14:30:00Z");

function facts(): FactsApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    info: async () => {
      calls.push("info");
      return {
        network: "keryx-mainnet", last_daa_score: 148_600_000, total_blocks: 1, total_txs: 1, hashrate_hps: 7.7e8,
        total_supply_krx: 775_000_000, circulating_supply_krx: 556_000_000, block_reward_krx: 5.02, max_supply_krx: 7.1e9,
        mined_pct: 7.83, burned_krx: 2.2e8, total_escrow_krx: 1.7e7, total_real_inferences: 2476,
      };
    },
    market: async () => {
      calls.push("market");
      return { price_usd: 0.000545, market_cap_usd: 303_000, volume_24h_usd: 463, change_24h_pct: -2.6 };
    },
    balance: async () => ({ balance_sompi: 0 }),
    inferencesServed: async () => ({ served: 0 }),
    transaction: async () => ({}),
    block: async () => ({ timestamp_ms: 0 }),
  };
}

const base = { budgetBytes: 80_000, webMode: "off" as const, threadOnWeb: false, providers: null, now: NOW };

afterEach(() => vi.unstubAllGlobals());

describe("chat prompt", () => {
  it("opens with the date and ends with the question, without facts for a general question", async () => {
    const f = facts();
    const p = await buildChatPrompt({ ...base, draft: "What is the capital of France?", history: [], facts: f });
    expect(p.prompt.startsWith("Current date and time: Mon, 09 Nov 2026 14:30 UTC (2026-11-09).")).toBe(true);
    expect(p.prompt).toContain("No web search was made for this message");
    expect(p.prompt.endsWith("What is the capital of France?\n\nReply in English.")).toBe(true);
    expect(p.factsBytes).toBe(0);
    expect(f.calls).toEqual([]);
    expect(questionOfPrompt(p.prompt)).toBe("What is the capital of France?");
  });

  it("adds the Keryx facts block for a question about Keryx", async () => {
    const f = facts();
    const p = await buildChatPrompt({ ...base, draft: "How is the Keryx supply emitted?", history: [], facts: f });
    expect(p.factsBytes).toBeGreaterThan(500);
    expect(p.prompt).toContain("KERYX FACTS");
    expect(p.prompt).toContain("7.83 % emitted");
    expect(f.calls.sort()).toEqual(["info", "market"]);
    expect(questionOfPrompt(p.prompt)).toBe("How is the Keryx supply emitted?");
  });

  it("carries earlier exchanges and a reply-language line, and the question is recovered from it", async () => {
    const history = [{ question: "Bonjour, qui es-tu ?", answer: "Je suis un modèle de langage." }];
    const p = await buildChatPrompt({ ...base, draft: "Peux-tu m'expliquer la photosynthèse en détail ?", history, facts: facts() });
    expect(p.used).toBe(1);
    expect(p.prompt).toContain("User: Bonjour, qui es-tu ?\nAssistant: Je suis un modèle de langage.");
    expect(questionOfPrompt(p.prompt)).toBe("Peux-tu m'expliquer la photosynthèse en détail ?");
  });

  it("asks to continue the last answer", async () => {
    const history = [{ question: "Write a long story", answer: "Once upon a time" }];
    const p = await buildChatPrompt({ ...base, draft: "", history, continuing: true, facts: facts() });
    expect(p.question).toBe(CONTINUE_PROMPT);
    expect(p.prompt).toContain("Once upon a time");
  });

  it("goes out without web results when the relay fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const p = await buildChatPrompt({ ...base, webMode: "on", draft: "latest news about GPUs", history: [], facts: facts() });
    expect(p.webError).toBeTruthy();
    expect(p.sources).toBeUndefined();
    expect(questionOfPrompt(p.prompt)).toBe("latest news about GPUs");
  });

  it("returns a plain prompt unchanged", () => {
    expect(questionOfPrompt("hello keryx")).toBe("hello keryx");
  });

  it("shows the ticker as KRX and spots cut answers", () => {
    expect(normalizeTicker("Buy K-R-X and KRYX, not KYC")).toBe("Buy KRX and KRX, not KYC");
    expect(looksTruncated("word ".repeat(200).trim(), 256)).toBe(true);
    expect(looksTruncated("A short answer.", 256)).toBe(false);
  });
});
