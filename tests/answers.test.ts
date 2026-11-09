// @vitest-environment node

import { describe, it, expect } from "vitest";
import { openAnswers, majorityAnswer } from "../src/mobile/ai/answers";
import { bytesToHex, cohortSeed, deriveRequestSecret, sealRequest } from "../src/mobile/ai/privateInference";
import { minerKey, sealAnswer } from "./_minerSeal";

const TXID = "ab".repeat(32);
const WALLET = "12".repeat(32);

function request(schedule: 1 | 2, miners: { pubHex: string }[]) {
  const secret = deriveRequestSecret(WALLET, cohortSeed("cd".repeat(32), 2));
  const payloadHex = sealRequest({
    modelIdHex: "11".repeat(32),
    maxTokens: 256,
    inferenceRewardSompi: 50_000_000,
    priorityFeeSompi: 30_000_000,
    prompt: "2+2?",
    recipientsHex: miners.map((m) => m.pubHex),
    secret,
    schedule,
  });
  return { secret, payloadHex };
}

describe("sealed answers", () => {
  for (const schedule of [1, 2] as const) {
    it(`opens a miner's answer under key schedule ${schedule}`, () => {
      const miner = minerKey(1);
      const { secret, payloadHex } = request(schedule, [miner]);
      const body = sealAnswer({ schedule, requestSecret: secret, requestTxId: TXID, requestPayloadHex: payloadHex, miner, text: "4" });
      const { opened, unreadable } = openAnswers(secret, TXID, [{ responderPubkey: miner.pubHex, bodyHex: body, daaScore: 1n }]);
      expect(opened).toEqual([{ text: "4", responder: miner.pubHex }]);
      expect(unreadable).toBeNull();
    });
  }

  it("keeps the majority answer and reports a body that is not an envelope", () => {
    const [a, b, c] = [minerKey(1), minerKey(2), minerKey(3)];
    const { secret, payloadHex } = request(2, [a, b, c]);
    const seal = (m: typeof a, text: string) =>
      sealAnswer({ schedule: 2, requestSecret: secret, requestTxId: TXID, requestPayloadHex: payloadHex, miner: m, text });
    const { opened, unreadable } = openAnswers(secret, TXID, [
      { responderPubkey: a.pubHex, bodyHex: seal(a, "five"), daaScore: 1n },
      { responderPubkey: b.pubHex, bodyHex: seal(b, "4"), daaScore: 2n },
      { responderPubkey: c.pubHex, bodyHex: seal(c, "4 "), daaScore: 3n },
      { responderPubkey: c.pubHex, bodyHex: bytesToHex(new TextEncoder().encode("Unreadable")), daaScore: 4n },
    ]);
    expect(opened).toHaveLength(3);
    expect(unreadable).toBe("Unreadable");
    const best = majorityAnswer(opened);
    expect(best.text.trim()).toBe("4");
    expect(best.count).toBe(2);
  });

  it("does not open an answer sealed for another request", () => {
    const miner = minerKey(1);
    const { secret, payloadHex } = request(2, [miner]);
    const body = sealAnswer({ schedule: 2, requestSecret: secret, requestTxId: TXID, requestPayloadHex: payloadHex, miner, text: "4" });
    const { opened } = openAnswers(secret, "ef".repeat(32), [{ responderPubkey: miner.pubHex, bodyHex: body, daaScore: 1n }]);
    expect(opened).toHaveLength(0);
  });
});
