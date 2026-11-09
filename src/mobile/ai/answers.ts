// Opening the sealed answers of a private request (requester side), as the website chat does.

import type { SealedResponse } from "../chain";
import { hexToBytes, openResponse } from "./privateInference";

export interface OpenedAnswer {
  text: string;
  responder: string;
}

export interface OpenedAnswers {
  opened: OpenedAnswer[];
  /** What a miner returned when it could not open the request (not an envelope), if any. */
  unreadable: string | null;
}

/** Opens every answer with the request secret; bodies that are not envelopes are reported as text. */
export function openAnswers(secret: Uint8Array, requestTxId: string, responses: SealedResponse[]): OpenedAnswers {
  const opened: OpenedAnswer[] = [];
  let unreadable: string | null = null;
  for (const r of responses) {
    try {
      opened.push({ text: openResponse(secret, requestTxId, r.responderPubkey, hexToBytes(r.bodyHex)), responder: r.responderPubkey });
    } catch {
      try {
        unreadable = new TextDecoder().decode(hexToBytes(r.bodyHex)).slice(0, 300);
      } catch {
        unreadable = "?";
      }
    }
  }
  return { opened, unreadable };
}

/** The most frequent answer text; on a tie, the one that arrived first. */
export function majorityAnswer(answers: OpenedAnswer[]): OpenedAnswer & { count: number } {
  if (answers.length === 0) throw new Error("no answers");
  const counts = new Map<string, number>();
  for (const a of answers) counts.set(a.text.trim(), (counts.get(a.text.trim()) ?? 0) + 1);
  let best = { ...answers[0], count: 0 };
  for (const a of answers) {
    const count = counts.get(a.text.trim())!;
    if (count > best.count) best = { ...a, count };
  }
  return best;
}
