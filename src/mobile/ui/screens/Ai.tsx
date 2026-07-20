import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../WalletProvider";
import { Button, Card, Toast, copy } from "../kit";
import { AI_MODELS, modelById } from "../../ai/models";
import { MIN_AI_REQUEST_PRIORITY_FEE } from "../../ai/payload";
import { formatKrx, krxToSompi, krxNumber } from "../format";
import { ensureNotifPermission, notifyAiAnswer } from "../../notifications";
import type { AiRequestResult } from "../../wallet/mobileWallet";
import { loadAiHistory, clearAiHistory, type AiHistoryEntry } from "../../ai/history";

type Stage = "compose" | "submitted" | "answered";

const POLL_MS = 12_000;
const MAX_POLLS = 30; // ~6 min best-effort discovery

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function Ai() {
  const app = useApp();
  const [modelId, setModelId] = useState(AI_MODELS[2].id); // GLM-4-9B-0414 (default tier)
  const [prompt, setPrompt] = useState("");
  const [maxTokens, setMaxTokens] = useState("256");
  const [rewardKrx, setRewardKrx] = useState(formatKrx(AI_MODELS[2].minRewardSompi));
  const [advanced, setAdvanced] = useState(false);

  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [stage, setStage] = useState<Stage>("compose");
  const [req, setReq] = useState<AiRequestResult | null>(null);
  const [status, setStatus] = useState<string>("");
  const [answer, setAnswer] = useState<string | null>(null);
  const attempts = useRef(0);
  const [history, setHistory] = useState<AiHistoryEntry[]>([]);
  const reloadHistory = useCallback(() => setHistory(loadAiHistory(app.receiveAddress)), [app.receiveAddress]);
  useEffect(() => {
    reloadHistory();
  }, [reloadHistory]);

  const model = modelById(modelId) ?? AI_MODELS[0];
  const [showWarn, setShowWarn] = useState<boolean>(() => {
    try {
      return localStorage.getItem("keryx.ai.warn.hidden.v1") !== "1";
    } catch {
      return true;
    }
  });
  const hideWarn = () => {
    setShowWarn(false);
    try {
      localStorage.setItem("keryx.ai.warn.hidden.v1", "1");
    } catch {
      /* ignore */
    }
  };
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1400);
  };

  // Keep the reward at or above the selected model's minimum when switching models.
  const onPickModel = (id: string) => {
    setModelId(id);
    const m = modelById(id);
    if (m) {
      try {
        if (krxToSompi(rewardKrx) < m.minRewardSompi) setRewardKrx(formatKrx(m.minRewardSompi));
      } catch {
        setRewardKrx(formatKrx(m.minRewardSompi));
      }
    }
  };

  let rewardSompi = 0n;
  let rewardValid = false;
  try {
    rewardSompi = krxToSompi(rewardKrx);
    rewardValid = rewardSompi >= model.minRewardSompi;
  } catch {
    rewardValid = false;
  }
  const totalSompi = rewardSompi + MIN_AI_REQUEST_PRIORITY_FEE;
  const totalUsd = app.usd(krxNumber(totalSompi));

  const submit = async () => {
    setErr(null);
    if (!prompt.trim()) return setErr("Enter a prompt.");
    const mt = parseInt(maxTokens, 10);
    if (!Number.isFinite(mt) || mt <= 0) return setErr("Max tokens must be a positive number.");
    if (!rewardValid)
      return setErr(`Minimum reward for ${model.name} is ${formatKrx(model.minRewardSompi)} KRX.`);
    setBusy(true);
    try {
      const params = { modelId, prompt, maxTokens: mt, rewardSompi };
      const r = app.biometricEnabled
        ? await app.submitAiWithBiometric(params)
        : await app.submitAi(pw, params);
      setPw("");
      setReq(r);
      attempts.current = 0;
      setStatus("Request sent. Waiting for a miner to answer…");
      setStage("submitted");
      void ensureNotifPermission(app.runtime?.native ?? false);
      reloadHistory();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.warn("[AI_SUBMIT_ERROR]", msg);
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  // Best-effort discovery: scan the recent-tx feed for the AiResponse that carries our request_hash,
  // then fetch the result off IPFS. Runs on an interval while we're waiting.
  const checkOnce = useCallback(async () => {
    if (!req) return;
    try {
      const found = await app.findAiResponse(req.txId);
      if (!found) return;
      const isNat = app.runtime?.native ?? false;
      const mName = modelById(modelId)?.name ?? "";
      if (found.resultText != null && found.resultText !== "") {
        setAnswer(found.resultText);
        setStage("answered");
        void notifyAiAnswer(isNat, { model: mName });
        return;
      }
      if (found.cid) {
        setStatus("Answer found on-chain. Fetching result\u2026");
        const text = await app.fetchAiResult(found.cid);
        setAnswer(text);
        setStage("answered");
        void notifyAiAnswer(isNat, { model: mName });
      }
    } catch {
      /* keep polling; transient gateway/IPFS errors are expected */
    }
  }, [req, app, modelId]);

  useEffect(() => {
    if (stage !== "submitted" || !req) return;
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      attempts.current += 1;
      await checkOnce();
      if (alive && attempts.current >= MAX_POLLS) {
        setStatus("No answer yet. Miners may be busy — check again later.");
      }
    };
    const id = setInterval(tick, POLL_MS);
    const first = setTimeout(tick, 6000);
    return () => {
      alive = false;
      clearInterval(id);
      clearTimeout(first);
    };
  }, [stage, req, checkOnce]);

  const openHistory = (h: AiHistoryEntry) => {
    setErr(null);
    setModelId(h.modelId);
    setPrompt(h.prompt);
    setAnswer(null);
    setReq({ txId: h.txId, requestHash: h.requestHash, feeSompi: BigInt(h.feeSompi) });
    attempts.current = 0;
    setStatus("Loading result\u2026");
    setStage("submitted");
  };

  const reset = () => {
    setStage("compose");
    setReq(null);
    setAnswer(null);
    setStatus("");
    setErr(null);
    attempts.current = 0;
    reloadHistory();
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-5 pb-28">
      <div className="text-lg font-semibold text-slate-100">AI Inference</div>

      {showWarn && (
        <div className="relative rounded-2xl bg-amber-500/10 px-4 py-3 pr-9 text-sm text-amber-300">
          Experimental. Each request is paid in real KRX to the miner network and can’t be refunded.
        Prompts and results are published to a public network — don’t include anything private.
          <button
            aria-label="Dismiss warning"
            onClick={hideWarn}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-amber-300/80 hover:bg-amber-500/20"
          >
            {"\u2715"}
          </button>
        </div>
      )}

      {stage === "compose" && (
        <>
          <Card>
            <div className="mb-2 font-semibold text-slate-100">Model</div>
            <div className="flex flex-col gap-2">
              {AI_MODELS.map((m) => {
                const on = m.id === modelId;
                return (
                  <button
                    key={m.id}
                    onClick={() => onPickModel(m.id)}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left ${
                      on ? "bg-emerald-500/15 ring-1 ring-emerald-500/60" : "bg-slate-800"
                    }`}
                  >
                    <div>
                      <div className="font-medium text-slate-100">{m.name}</div>
                      <div className="text-xs text-slate-400">{m.tier}</div>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      from {formatKrx(m.minRewardSompi)} KRX
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <label className="block">
              <span className="mb-1.5 block text-sm text-slate-400">Prompt</span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                placeholder="Ask the model anything…"
                className="w-full resize-y rounded-2xl bg-slate-800 px-4 py-3 text-slate-100 outline-none ring-emerald-500/60 focus:ring-2"
              />
            </label>

            <button
              className="mt-3 text-sm text-emerald-400"
              onClick={() => setAdvanced((v) => !v)}
            >
              {advanced ? "Hide" : "Show"} advanced (reward, length)
            </button>

            {advanced && (
              <div className="mt-3 flex flex-col gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm text-slate-400">Max tokens</span>
                  <input
                    value={maxTokens}
                    inputMode="numeric"
                    onChange={(e) => setMaxTokens(e.target.value.replace(/[^\d]/g, ""))}
                    className="w-full rounded-2xl bg-slate-800 px-4 py-3 text-slate-100 outline-none ring-emerald-500/60 focus:ring-2"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-slate-400">
                    Inference reward (KRX) · min {formatKrx(model.minRewardSompi)}
                  </span>
                  <input
                    value={rewardKrx}
                    inputMode="decimal"
                    onChange={(e) => setRewardKrx(e.target.value.replace(/[^\d.]/g, ""))}
                    className="w-full rounded-2xl bg-slate-800 px-4 py-3 font-mono text-slate-100 outline-none ring-emerald-500/60 focus:ring-2"
                  />
                </label>
                <div className="text-xs text-slate-500">
                  A {formatKrx(MIN_AI_REQUEST_PRIORITY_FEE)} KRX priority fee is added on top.
                </div>
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Total cost</span>
              <span className="font-semibold text-slate-100">
                {formatKrx(totalSompi)} KRX{totalUsd ? ` · ${totalUsd}` : ""}
              </span>
            </div>
            {!app.biometricEnabled && (
              <label className="mt-3 block">
                <span className="mb-1.5 block text-sm text-slate-400">Password</span>
                <input
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  className="w-full rounded-2xl bg-slate-800 px-4 py-3 text-slate-100 outline-none ring-emerald-500/60 focus:ring-2"
                />
              </label>
            )}
            <div className="mt-3">
              <Button
                onClick={submit}
                disabled={busy || !prompt.trim() || (!app.biometricEnabled && pw.length === 0)}
              >
                {busy
                  ? "Sending…"
                  : app.biometricEnabled
                    ? "Confirm with fingerprint / face"
                    : "Send request"}
              </Button>
            </div>
            {err && (
              <div className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</div>
            )}
          </Card>

          {history.length > 0 && (
            <Card>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-slate-100">Recent requests</span>
                <button
                  className="text-xs text-slate-500 hover:text-slate-300"
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
                    className="rounded-2xl bg-slate-800 px-4 py-3 text-left hover:bg-slate-700"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium text-emerald-400">
                        {modelById(h.modelId)?.name ?? "AI request"}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">{timeAgo(h.ts)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-sm text-slate-400">{h.prompt}</div>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {stage !== "compose" && req && (
        <>
          <Card>
            <div className="mb-1 font-semibold text-slate-100">{model.name}</div>
            {prompt && (
              <div className="mb-2 whitespace-pre-wrap break-words text-sm text-slate-300">{prompt}</div>
            )}
            <div className="text-sm text-slate-400">{status}</div>
            {stage === "submitted" && (
              <div className="mt-3 flex items-center gap-2 text-sm text-emerald-400">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                Listening for the answer…
              </div>
            )}
            <button
              className="mt-3 w-full text-left font-mono text-xs text-slate-400"
              onClick={() => {
                copy(req.txId);
                flash("Request tx id copied");
              }}
            >
              request tx: {req.txId.slice(0, 20)}… — tap to copy
            </button>
          </Card>

          {answer != null && (
            <Card>
              <div className="mb-2 font-semibold text-slate-100">Result</div>
              <div className="whitespace-pre-wrap break-words text-sm text-slate-200">{answer}</div>
              <button
                className="mt-3 text-sm text-emerald-400"
                onClick={() => {
                  copy(answer);
                  flash("Result copied");
                }}
              >
                Copy result
              </button>
            </Card>
          )}

          <div className="flex flex-col gap-2">
            {stage === "submitted" && (
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
