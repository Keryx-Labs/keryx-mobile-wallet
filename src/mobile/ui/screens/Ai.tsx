import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../WalletProvider";
import { Button, Card, Toast, copy } from "../kit";
import { AI_MODELS, modelById, fetchLiveModels, type AiModel } from "../../ai/models";
import { EscrowBanner } from "./EscrowBanner";
import { MIN_AI_REQUEST_PRIORITY_FEE } from "../../ai/payload";
import { formatKrx, krxNumber } from "../format";
import { ensureNotifPermission, notifyAiAnswer } from "../../notifications";
import { loadAiHistory, clearAiHistory, updateAiHistory, type AiHistoryEntry } from "../../ai/history";
import { majorityAnswer } from "../../ai/answers";
import type { AiProviders } from "../../chain";

type Stage = "compose" | "submitted" | "answered";

const POLL_MS = 4_000;
const PROVIDERS_REFRESH_MS = 60_000;
// After the first answer opens, how long the other miners get before the majority is picked.
const MAJORITY_WAIT_MS = 5_000;
const PENDING_TIMEOUT_MS = 15 * 60 * 1000;
// Legacy public requests: answers are looked up in the gateway feed, then on IPFS.
const LEGACY_POLL_MS = 12_000;
const LEGACY_MAX_POLLS = 30;

// Same bounds as the website chat: context each tier's engine holds, and the answer cap next to it.
const CONTEXT_TOKENS = 32_768;
const FLAT_CAP_TOKENS = 2_048;
const CONTEXT_MARGIN_TOKENS = 512;
const BYTES_PER_TOKEN = 3;
const PROMPT_BUDGET_BYTES = (CONTEXT_TOKENS - FLAT_CAP_TOKENS - CONTEXT_MARGIN_TOKENS) * BYTES_PER_TOKEN - 1_024;

const byteLength = (s: string) => new TextEncoder().encode(s).length;
const maxTokensFor = (promptBytes: number) =>
  Math.max(256, Math.min(FLAT_CAP_TOKENS, CONTEXT_TOKENS - Math.ceil(promptBytes / BYTES_PER_TOKEN) - 128));

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function minersFor(providers: AiProviders | null, modelId: string): number | null {
  if (!providers) return null;
  const id = modelId.toLowerCase();
  return new Set(providers.cohort.filter((p) => p.modelId === id).map((p) => p.escrowPubkey)).size;
}

const isLocked = (h: AiHistoryEntry) => !!h.seedHex && !h.secretHex;

export function Ai() {
  const app = useApp();
  const [modelId, setModelId] = useState(AI_MODELS[1].id);
  const modelChosen = useRef(false);
  const [prompt, setPrompt] = useState("");

  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [stage, setStage] = useState<Stage>("compose");
  const [active, setActive] = useState<AiHistoryEntry | null>(null);
  const [status, setStatus] = useState<string>("");
  const [answer, setAnswer] = useState<string | null>(null);
  const firstAnswerAt = useRef<number | null>(null);
  const legacyAttempts = useRef(0);

  const [history, setHistory] = useState<AiHistoryEntry[]>([]);
  const reloadHistory = useCallback(() => setHistory(loadAiHistory(app.receiveAddress)), [app.receiveAddress]);
  useEffect(() => {
    reloadHistory();
  }, [reloadHistory]);
  const lockedCount = history.filter(isLocked).length;
  const [unlockPw, setUnlockPw] = useState("");

  const [models, setModels] = useState<AiModel[]>(AI_MODELS);
  useEffect(() => {
    let alive = true;
    void fetchLiveModels().then((live) => {
      if (!alive || live.length === 0) return;
      setModels(live);
      setModelId((cur) => (live.some((m) => m.id === cur) ? cur : live[Math.min(1, live.length - 1)].id));
    });
    return () => {
      alive = false;
    };
  }, []);

  const [providers, setProviders] = useState<AiProviders | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      app
        .aiProviders()
        .then((p) => alive && setProviders(p))
        .catch(() => {
          /* keep the last read */
        });
    void load();
    const id = setInterval(load, PROVIDERS_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [app.aiProviders]);

  // Until the user picks, start on the lightest model that has a miner.
  useEffect(() => {
    if (modelChosen.current || !providers) return;
    const served = models.find((m) => (minersFor(providers, m.id) ?? 0) > 0);
    if (served) setModelId(served.id);
  }, [providers, models]);

  const model = models.find((m) => m.id === modelId) ?? models[0] ?? AI_MODELS[0];
  const miners = minersFor(providers, model.id);
  const promptBytes = byteLength(prompt);
  const tooLong = promptBytes > PROMPT_BUDGET_BYTES;
  const totalSompi = model.flatRewardSompi + MIN_AI_REQUEST_PRIORITY_FEE;
  const totalUsd = app.usd(krxNumber(totalSompi));

  const [showWarn, setShowWarn] = useState<boolean>(() => {
    try {
      return localStorage.getItem("keryx.ai.warn.hidden.v2") !== "1";
    } catch {
      return true;
    }
  });
  const hideWarn = () => {
    setShowWarn(false);
    try {
      localStorage.setItem("keryx.ai.warn.hidden.v2", "1");
    } catch {
      /* ignore */
    }
  };
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1400);
  };

  const onPickModel = (id: string) => {
    modelChosen.current = true;
    setModelId(id);
  };

  const submit = async () => {
    setErr(null);
    const text = prompt.trim();
    if (!text) return setErr("Enter a prompt.");
    if (tooLong) return setErr(`This message is too long for ${model.name}: ${promptBytes} bytes, about ${PROMPT_BUDGET_BYTES} fit.`);
    if (miners === 0) return setErr(`No miner is serving ${model.name} right now. Nothing has been sent.`);
    setBusy(true);
    try {
      const params = { modelId: model.id, prompt: text, maxTokens: maxTokensFor(byteLength(text)), rewardSompi: model.flatRewardSompi };
      const r = app.biometricEnabled ? await app.submitAiWithBiometric(params) : await app.submitAi(pw, params);
      setPw("");
      const entry: AiHistoryEntry = {
        txId: r.txId,
        requestHash: r.requestHash,
        modelId: model.id,
        prompt: text,
        ts: Date.now(),
        feeSompi: r.feeSompi.toString(),
        seedHex: r.seedHex,
        secretHex: r.secretHex,
        recipients: r.recipients,
      };
      setActive(entry);
      firstAnswerAt.current = null;
      setAnswer(null);
      setStatus(`Request sealed to ${r.recipients} miner${r.recipients === 1 ? "" : "s"} and sent. Waiting for an answer…`);
      setStage("submitted");
      void ensureNotifPermission(app.runtime?.native ?? false);
      reloadHistory();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const finish = useCallback(
    (entry: AiHistoryEntry, text: string, patch: Partial<AiHistoryEntry>) => {
      setAnswer(text);
      setStage("answered");
      updateAiHistory(app.receiveAddress, entry.txId, { answer: text, ...patch });
      reloadHistory();
      void notifyAiAnswer(app.runtime?.native ?? false, { model: modelById(entry.modelId)?.name ?? "" });
    },
    [app.receiveAddress, app.runtime, reloadHistory]
  );

  // Sealed requests: open every answer, give the other miners a moment, keep the majority.
  const checkSealed = useCallback(
    async (entry: AiHistoryEntry) => {
      const state = await app.readAiAnswers(entry);
      if (state.locked) return;
      if (state.opened.length > 0) {
        const firstAt = firstAnswerAt.current ?? Date.now();
        firstAnswerAt.current = firstAt;
        const expected = state.recipients ?? entry.recipients ?? 1;
        if (state.opened.length < expected && Date.now() - firstAt < MAJORITY_WAIT_MS) {
          setStatus(`${state.opened.length} answer${state.opened.length === 1 ? "" : "s"} opened, waiting for the others…`);
          return;
        }
        const best = majorityAnswer(state.opened);
        setStatus(`${best.count} of ${state.opened.length} miner${state.opened.length === 1 ? "" : "s"} gave this answer.`);
        finish(entry, best.text, { responder: best.responder });
        return;
      }
      if (Date.now() - entry.ts > PENDING_TIMEOUT_MS) {
        setStatus(
          state.unreadable
            ? `No answer could be opened. A miner replied: ${state.unreadable}`
            : "No miner answered in time."
        );
      }
    },
    [app, finish]
  );

  const checkLegacy = useCallback(
    async (entry: AiHistoryEntry) => {
      const found = await app.findAiResponse(entry.txId);
      if (!found) return;
      if (found.resultText) return finish(entry, found.resultText, {});
      if (found.cid) {
        setStatus("Answer found on-chain. Fetching result…");
        finish(entry, await app.fetchAiResult(found.cid), {});
      }
    },
    [app, finish]
  );

  const checkOnce = useCallback(async () => {
    if (!active) return;
    try {
      if (active.secretHex) await checkSealed(active);
      else if (!active.seedHex) await checkLegacy(active);
    } catch {
      /* keep polling; transient gateway errors are expected */
    }
  }, [active, checkSealed, checkLegacy]);

  useEffect(() => {
    if (stage !== "submitted" || !active || isLocked(active)) return;
    let alive = true;
    const sealed = !!active.secretHex;
    const tick = async () => {
      if (!alive) return;
      legacyAttempts.current += 1;
      await checkOnce();
      if (alive && !sealed && legacyAttempts.current >= LEGACY_MAX_POLLS) {
        setStatus("No answer yet. Miners may be busy — check again later.");
      }
    };
    void tick();
    const id = setInterval(tick, sealed ? POLL_MS : LEGACY_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [stage, active, checkOnce]);

  const openHistory = (h: AiHistoryEntry) => {
    setErr(null);
    setModelId(h.modelId);
    setActive(h);
    firstAnswerAt.current = null;
    legacyAttempts.current = 0;
    if (h.answer != null) {
      setAnswer(h.answer);
      setStatus("");
      setStage("answered");
      return;
    }
    setAnswer(null);
    setStatus(isLocked(h) ? "Restored from the chain. Unlock your requests to read it." : "Loading result…");
    setStage("submitted");
  };

  const unlock = async () => {
    setErr(null);
    setBusy(true);
    try {
      const n = app.biometricEnabled ? await app.unlockAiHistoryWithBiometric() : await app.unlockAiHistory(unlockPw);
      setUnlockPw("");
      reloadHistory();
      const fresh = active ? loadAiHistory(app.receiveAddress).find((e) => e.txId === active.txId) : undefined;
      if (fresh) setActive(fresh);
      flash(`${n} request${n === 1 ? "" : "s"} unlocked`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStage("compose");
    setActive(null);
    setAnswer(null);
    setStatus("");
    setErr(null);
    firstAnswerAt.current = null;
    legacyAttempts.current = 0;
    reloadHistory();
  };

  const inputClass =
    "border border-keryx-border w-full rounded bg-keryx-green/[0.03] px-4 py-3 text-keryx-ink outline-none ring-keryx-green/60 focus:ring-2";

  const unlockCard = (
    <Card>
      <div className="mb-1 font-semibold text-keryx-ink">Locked requests</div>
      <div className="text-sm text-keryx-dim">
        {lockedCount} request{lockedCount === 1 ? " was" : "s were"} restored from the chain. Unlock to read the prompts and
        answers on this device.
      </div>
      {!app.biometricEnabled && (
        <input type="password" value={unlockPw} onChange={(e) => setUnlockPw(e.target.value)} placeholder="Password" className={`${inputClass} mt-3`} />
      )}
      <div className="mt-3">
        <Button onClick={unlock} disabled={busy || (!app.biometricEnabled && unlockPw.length === 0)}>
          {busy ? "Unlocking…" : app.biometricEnabled ? "Unlock with fingerprint / face" : "Unlock"}
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-5 pb-28">
      <div className="glow text-lg font-semibold text-keryx-bright">AI Inference</div>

      {showWarn && (
        <div className="relative rounded bg-keryx-warn/10 px-4 py-3 pr-9 text-sm text-keryx-warn">
          Your request is sealed end to end: only the miners serving the model can read it, and the answer comes back
          sealed to you. Each request pays real KRX: the fixed price of the model goes to the miner that answers, and a{" "}
          {formatKrx(MIN_AI_REQUEST_PRIORITY_FEE)} KRX priority fee is burned. Neither is refundable.
          <button
            aria-label="Dismiss notice"
            onClick={hideWarn}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-keryx-warn hover:bg-keryx-warn/20"
          >
            {"✕"}
          </button>
        </div>
      )}

      <EscrowBanner />

      {stage === "compose" && (
        <>
          <Card>
            <div className="mb-2 font-semibold text-keryx-ink">Model</div>
            <div className="flex flex-col gap-2">
              {models.map((m) => {
                const on = m.id === modelId;
                const n = minersFor(providers, m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => onPickModel(m.id)}
                    className={`flex items-center justify-between rounded px-4 py-3 text-left ${
                      on ? "bg-keryx-green/15 ring-1 ring-keryx-green/60" : "bg-keryx-green/[0.03]"
                    }`}
                  >
                    <div>
                      <div className="font-medium text-keryx-ink">{m.name}</div>
                      <div className={`text-xs ${n === 0 ? "text-keryx-error" : "text-keryx-dim"}`}>
                        {n === null ? "…" : n === 0 ? "no miner right now" : `${n} miner${n === 1 ? "" : "s"}`}
                      </div>
                    </div>
                    <div className="text-right text-xs text-keryx-dim">{formatKrx(m.flatRewardSompi)} KRX</div>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <label className="block">
              <span className="mb-1.5 block text-sm text-keryx-dim">Prompt</span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                placeholder="Ask the model anything…"
                className={`${inputClass} resize-y`}
              />
            </label>
            {tooLong && (
              <div className="mt-2 text-xs text-keryx-error">
                {promptBytes} bytes: too long for this model (about {PROMPT_BUDGET_BYTES} fit).
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <span className="text-keryx-dim">Total cost</span>
              <span className="font-semibold text-keryx-ink">
                {formatKrx(totalSompi)} KRX{totalUsd ? ` · ${totalUsd}` : ""}
              </span>
            </div>
            <div className="mt-1 text-xs text-keryx-dim">
              {formatKrx(model.flatRewardSompi)} KRX to the miner + {formatKrx(MIN_AI_REQUEST_PRIORITY_FEE)} KRX priority fee
            </div>
            {!app.biometricEnabled && (
              <label className="mt-3 block">
                <span className="mb-1.5 block text-sm text-keryx-dim">Password</span>
                <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputClass} />
              </label>
            )}
            <div className="mt-3">
              <Button
                onClick={submit}
                disabled={busy || !prompt.trim() || tooLong || miners === 0 || (!app.biometricEnabled && pw.length === 0)}
              >
                {busy ? "Sealing and sending…" : app.biometricEnabled ? "Confirm with fingerprint / face" : "Send request"}
              </Button>
            </div>
            {err && <div className="mt-3 rounded-sm bg-keryx-error/10 px-3 py-2 text-sm text-keryx-error">{err}</div>}
          </Card>

          {lockedCount > 0 && unlockCard}

          {history.length > 0 && (
            <Card>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-keryx-ink">Recent requests</span>
                <button
                  className="text-xs text-keryx-dim hover:text-keryx-text"
                  onClick={() => {
                    clearAiHistory();
                    reloadHistory();
                  }}
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {history.map((h) => (
                  <button
                    key={h.txId}
                    onClick={() => openHistory(h)}
                    className="border border-keryx-border rounded bg-keryx-green/[0.03] px-4 py-3 text-left hover:border-keryx-borderHi"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium text-keryx-green">
                        {modelById(h.modelId)?.name ?? "AI request"}
                      </span>
                      <span className="shrink-0 text-xs text-keryx-dim">{timeAgo(h.ts)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-sm text-keryx-dim">
                      {isLocked(h) ? "Locked request" : h.prompt}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {stage !== "compose" && active && (
        <>
          <Card>
            <div className="mb-1 font-semibold text-keryx-ink">{modelById(active.modelId)?.name ?? model.name}</div>
            {active.prompt && (
              <div className="mb-2 whitespace-pre-wrap break-words text-sm text-keryx-text">{active.prompt}</div>
            )}
            {status && <div className="text-sm text-keryx-dim">{status}</div>}
            {stage === "submitted" && !isLocked(active) && (
              <div className="mt-3 flex items-center gap-2 text-sm text-keryx-green">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-keryx-cta" />
                Listening for the answer…
              </div>
            )}
            <button
              className="mt-3 w-full text-left font-mono text-xs text-keryx-dim"
              onClick={() => {
                copy(active.txId);
                flash("Request tx id copied");
              }}
            >
              request tx: {active.txId.slice(0, 20)}… — tap to copy
            </button>
          </Card>

          {isLocked(active) && unlockCard}

          {answer != null && (
            <Card>
              <div className="mb-2 font-semibold text-keryx-ink">Answer</div>
              <div className="whitespace-pre-wrap break-words text-sm text-keryx-ink">{answer}</div>
              <button
                className="mt-3 text-sm text-keryx-green"
                onClick={() => {
                  copy(answer);
                  flash("Answer copied");
                }}
              >
                Copy answer
              </button>
            </Card>
          )}

          {err && (
            <div className="rounded-sm bg-keryx-error/10 px-3 py-2 text-sm text-keryx-error">{err}</div>
          )}

          <div className="flex flex-col gap-2">
            {stage === "submitted" && !isLocked(active) && (
              <Button variant="ghost" onClick={() => checkOnce()}>
                Check now
              </Button>
            )}
            <Button variant="ghost" onClick={reset}>
              New request
            </Button>
          </div>
        </>
      )}

      <Toast msg={toast} />
    </div>
  );
}
