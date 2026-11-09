// Prompt assembly for the chat, in the website's order: date, Keryx facts, web results, guidance,
// earlier exchanges, the question, then the reply-language line.

import { byteLength, composePrompt } from "./compose";
import { buildKeryxContext, fetchLiveFacts, isKeryxQuestion, namesKeryx } from "./keryxContext";
import { replyLanguageLine } from "./language";
import { buildWebContext, isLongMessage, isSearchRequest, isWebQuestion, searchWeb, stripWebPrefix, type WebMode } from "./webSearch";
import type { AiProviders, FactsApi, NetworkInfo } from "./factsApi";

export const CONTINUE_PROMPT = "Continue exactly where you stopped.";
const FACTS_BUDGET_BYTES = 3_500;
const WEB_BUDGET_BYTES = 2_600;
const WEB_MIN_BYTES = 700;

export interface Exchange {
  question: string;
  answer: string;
}

export interface ChatPromptArgs {
  /** What the user typed (may carry a web prefix). */
  draft: string;
  /** Earlier answered exchanges of the conversation, oldest first. */
  history: Exchange[];
  /** The Continue button: resume the last answer instead of asking `draft`. */
  continuing?: boolean;
  /** Prompt bytes the model's context takes next to a full-length answer. */
  budgetBytes: number;
  webMode: WebMode;
  webEndpoint?: string;
  /** The last message of the thread carried web results. */
  threadOnWeb: boolean;
  lastQuestion?: string;
  facts: FactsApi;
  providers: AiProviders | null;
  info?: NetworkInfo | null;
  now?: Date;
}

export interface ChatPrompt {
  question: string;
  prompt: string;
  /** Earlier exchanges that fit. */
  used: number;
  factsBytes: number;
  sources?: { title: string; url: string }[];
  /** The web search failed; the prompt went out without it. */
  webError?: string;
}

export async function buildChatPrompt(a: ChatPromptArgs): Promise<ChatPrompt> {
  const continuing = !!a.continuing;
  const draft = a.draft.trim();
  const question = continuing ? CONTINUE_PROMPT : stripWebPrefix(draft).trim();
  let budget = a.budgetBytes;

  let factsBlock = "";
  if (!continuing && isKeryxQuestion(question, a.history[a.history.length - 1])) {
    const live = await fetchLiveFacts(a.facts, question, a.providers, a.info ?? null);
    factsBlock = buildKeryxContext(question, live, Math.min(FACTS_BUDGET_BYTES, budget - byteLength(question) - 256));
    budget -= byteLength(factsBlock);
  }

  let webBlock = "";
  let sources: ChatPrompt["sources"];
  let webError: string | undefined;
  const keryxOnly = namesKeryx(draft) && !isSearchRequest(draft) && stripWebPrefix(draft) === draft;
  const withWeb =
    !continuing &&
    a.webMode !== "off" &&
    (a.webMode === "on" || (!keryxOnly && (isWebQuestion(draft) || (a.threadOnWeb && !isLongMessage(draft)))));
  if (withWeb) {
    const cap = Math.min(WEB_BUDGET_BYTES, budget - byteLength(question) - 256);
    if (cap >= WEB_MIN_BYTES) {
      try {
        const followUp = a.threadOnWeb || isSearchRequest(draft);
        const found = await searchWeb(draft, a.webEndpoint, followUp ? a.lastQuestion : undefined);
        const built = buildWebContext(found, cap);
        webBlock = built.block;
        if (built.sources.length > 0) sources = built.sources;
      } catch (e) {
        webError = e instanceof Error ? e.message : String(e);
      }
      budget -= byteLength(webBlock);
    }
  }

  // The miner is stateless and the model has no clock: every prompt opens with the time.
  const clock = a.now ?? new Date();
  const dateLine =
    `Current date and time: ${clock.toUTCString().replace(/:\d\d GMT$/, " UTC")} (${clock.toISOString().slice(0, 10)}). ` +
    "Mention it only when the question is about the date, the day or the time.\n\n";
  const guidance =
    "Reply in the language of the user's message below, whatever the language of the material above. " +
    "Do not introduce yourself and do not describe the Keryx network unless the user asks about it. " +
    (webBlock
      ? "\n\n"
      : "No web search was made for this message: never claim you searched the web, cite online sources " +
        "or give live figures you do not have.\n\n");
  const replyIn = replyLanguageLine(question);
  const tail = replyIn ? `\n\n${replyIn}` : "";
  budget -= byteLength(dateLine) + byteLength(guidance) + byteLength(tail);

  const composed = composePrompt(a.history, question, budget, continuing);
  return {
    question,
    prompt: dateLine + factsBlock + webBlock + guidance + composed.prompt + tail,
    used: composed.used,
    factsBytes: byteLength(factsBlock),
    sources,
    webError,
  };
}

const GUIDANCE_MARK = "Do not introduce yourself and do not describe the Keryx network unless the user asks about it. ";
const HISTORY_FOOTER = "Continue the conversation. The user's new message:\n";

/** The user's question inside a prompt built by `buildChatPrompt` (a plain prompt comes back as is). */
export function questionOfPrompt(prompt: string): string {
  const at = prompt.indexOf(GUIDANCE_MARK);
  if (at < 0) return prompt;
  const bodyAt = prompt.indexOf("\n\n", at + GUIDANCE_MARK.length);
  if (bodyAt < 0) return prompt;
  let body = prompt.slice(bodyAt + 2);
  const footerAt = body.lastIndexOf(HISTORY_FOOTER);
  if (footerAt >= 0) body = body.slice(footerAt + HISTORY_FOOTER.length);
  const tailAt = body.lastIndexOf("\n\n");
  if (tailAt >= 0) {
    const head = body.slice(0, tailAt);
    if (body.slice(tailAt + 2) === replyLanguageLine(head)) body = head;
  }
  return body;
}

// The models respell the ticker when it recurs in the prompt (KRC, KRIX, KRYX, KXR, KTX…); shown as KRX.
const TICKER_RESPELLINGS = /(?<![\p{L}\d])(T?)K(?:R[A-Z]{1,2}|[A-Z]?X|[A-Z]R[A-Z]?)(?![\p{L}\d])/gu;
const KNOWN_ACRONYMS = new Set(["KYC", "KPI", "KVM", "KHZ", "KWH", "KMH", "KGS", "KEY", "KIT"]);

export function normalizeTicker(text: string): string {
  return text
    .replace(/\b(T-)?K-R-X\b/g, (_m: string, t: string | undefined) => (t ? "TKRX" : "KRX"))
    .replace(TICKER_RESPELLINGS, (word: string, t: string) =>
      KNOWN_ACRONYMS.has(word.replace(/^T/, "")) || word === `${t}KRX` ? word : `${t}KRX`
    );
}

/** An answer that used most of its cap and does not end on closing punctuation was likely cut. */
export function looksTruncated(answer: string, maxTokens: number): boolean {
  const a = answer.trim();
  if (!a) return false;
  return a.split(/\s+/).length >= maxTokens * 0.5 && !/[.!?…。:;»"'”’)\]`*|]$/.test(a);
}
