// Prompt composition helpers shared with the website and desktop chat (keryx-desktop-wallet src/lib/chatStore.ts).


const HEADER = "Conversation so far:\n\n";
const FOOTER = "Continue the conversation. The user's new message:\n";
const ELLIPSIS = " […]";
/** Below this many bytes left, a truncated answer carries too little to be worth sending. */
const MIN_TRUNCATED_ANSWER_BYTES = 160;

const encoder = new TextEncoder();
export const byteLength = (s: string) => encoder.encode(s).length;

function truncateToBytes(s: string, maxBytes: number): string {
  let used = 0;
  let out = "";
  for (const ch of s) {
    const n = byteLength(ch);
    if (used + n > maxBytes) break;
    used += n;
    out += ch;
  }
  return out;
}

function tailToBytes(s: string, maxBytes: number): string {
  const chars = Array.from(s);
  let used = 0;
  let from = chars.length;
  while (from > 0) {
    const n = byteLength(chars[from - 1]);
    if (used + n > maxBytes) break;
    used += n;
    from--;
  }
  return chars.slice(from).join("");
}

const formatExchange = (question: string, answer: string) => `User: ${question}\nAssistant: ${answer}\n\n`;

/**
 * Prepends as many earlier exchanges as fit in `maxBytes`, most recent first. The miner wraps
 * the whole prompt in a single user turn, so the history travels as plain text. The new question
 * is always kept whole; with no usable history the prompt is the question unchanged.
 * `continuing`: the question asks to resume the last answer, so when that answer does not fit
 * its end is kept rather than its beginning.
 */
export function composePrompt(
  history: { question: string; answer: string }[],
  question: string,
  maxBytes: number,
  continuing = false
): { prompt: string; used: number } {
  let budget = maxBytes - byteLength(HEADER) - byteLength(FOOTER) - byteLength(question);
  const kept: string[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const block = formatExchange(history[i].question, history[i].answer);
    const n = byteLength(block);
    if (n <= budget) {
      kept.unshift(block);
      budget -= n;
      continue;
    }
    const room = budget - byteLength(formatExchange(history[i].question, "")) - byteLength(ELLIPSIS);
    if (room >= MIN_TRUNCATED_ANSWER_BYTES) {
      const answer =
        continuing && i === history.length - 1
          ? ELLIPSIS.trimStart() + " " + tailToBytes(history[i].answer, room)
          : truncateToBytes(history[i].answer, room) + ELLIPSIS;
      kept.unshift(formatExchange(history[i].question, answer));
    }
    break;
  }
  if (kept.length === 0) return { prompt: question, used: 0 };
  return { prompt: HEADER + kept.join("") + FOOTER + question, used: kept.length };
}
