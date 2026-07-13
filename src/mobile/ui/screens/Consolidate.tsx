import { useEffect, useState } from "react";
import { useApp } from "../WalletProvider";
import { Button, Card, copy, formatKrx, Toast } from "../kit";
import type { ConsolidateInfo, ConsolidateResult } from "../../wallet/mobileWallet";

// Consolidate (compound) UTXOs — reproduces the official desktop wallet: a self-send that sweeps the
// largest mature UTXOs into one, honoring coinbase maturity. One authorization consolidates the WHOLE
// eligible set — it auto-loops batch by batch (waiting for each to confirm) like the desktop wallet.
export function Consolidate({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [info, setInfo] = useState<ConsolidateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ConsolidateResult | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);

  const loadInfo = async () => {
    setLoading(true);
    try {
      setInfo(await app.consolidatePreview());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canRun = !!info && info.matureCount >= 2;

  const run = async () => {
    setErr(null);
    setBusy(true);
    setProgress("");
    const onProgress = (pr: { batch: number; remaining: number }) =>
      setProgress(`Batch ${pr.batch} · ${pr.remaining.toLocaleString()} left`);
    try {
      const r = app.biometricEnabled
        ? await app.consolidateWithBiometric(onProgress)
        : await app.consolidate(pw, onProgress);
      setPw("");
      setResult(r);
      void loadInfo(); // refresh the live count
    } catch (e) {
      setPw("");
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-3xl bg-slate-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-semibold text-emerald-400">Consolidate coins</div>
          <button className="text-sm text-slate-400" onClick={onClose}>
            Close
          </button>
        </div>

        <Card className="mb-4 bg-slate-800/60">
          {loading ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="h-3 w-28 animate-pulse rounded bg-slate-700" />
                <div className="h-3 w-10 animate-pulse rounded bg-slate-700" />
              </div>
              <div className="flex items-center justify-between">
                <div className="h-3 w-14 animate-pulse rounded bg-slate-700" />
                <div className="h-3 w-24 animate-pulse rounded bg-slate-700" />
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-emerald-400">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                Checking your coins…
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Coins (UTXOs)</span>
                <span className="font-mono text-emerald-400">{info?.matureCount ?? 0}</span>
              </div>
              {info && (
                <>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>Total</span>
                    <span className="font-mono">{formatKrx(info.totalMatureSompi)} KRX</span>
                  </div>
                  {info.immatureCount > 0 && (
                    <div className="mt-1 text-xs text-slate-500">
                      {info.immatureCount} mining coin{info.immatureCount === 1 ? "" : "s"} still maturing —
                      will be included on a later run.
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </Card>

        {!result ? (
          <>
            <p className="mb-4 text-sm text-slate-400">
              Combines your many small coins into one by sending them back to your own address. Handy
              if you receive lots of small mining payouts. Only the network fee is spent — your balance
              stays yours. One tap consolidates your whole eligible set automatically, one confirmed
              batch at a time — keep this open until it finishes.
            </p>
            {!app.biometricEnabled && (
              <label className="mb-3 block">
                <span className="mb-1.5 block text-sm text-slate-400">Confirm with your password</span>
                <input
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  className="w-full rounded-2xl bg-slate-800 px-4 py-3 text-slate-100 outline-none ring-emerald-500/60 focus:ring-2"
                />
              </label>
            )}
            {err && (
              <div className="mb-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</div>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={run}
                disabled={busy || !canRun || (!app.biometricEnabled && pw.length === 0)}
              >
                {busy
                  ? progress || "Consolidating…"
                  : !canRun
                    ? "Nothing to do"
                    : app.biometricEnabled
                      ? "Confirm"
                      : "Consolidate"}
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center">
            <div className="mb-2 text-lg font-semibold text-emerald-400">Submitted ✓</div>
            <p className="mb-3 text-sm text-slate-400">
              Swept {result.totalInputs.toLocaleString()} coins in {result.batches} batch
              {result.batches === 1 ? "" : "es"} (total fee {formatKrx(result.totalFeeSompi)} KRX).{" "}
              {result.remaining > 1
                ? `${result.remaining.toLocaleString()} coins remain — run again to finish.`
                : "Everything is consolidated. It becomes spendable after it matures."}
            </p>
            {result.txids.length > 0 && (
              <button
                className="mb-4 block w-full break-all rounded-lg bg-slate-800 p-2 text-xs text-emerald-400/80"
                onClick={() => {
                  copy(result.txids.join("\n"));
                  setToast(result.txids.length === 1 ? "Tx id copied" : "Tx ids copied");
                  setTimeout(() => setToast(null), 1400);
                }}
              >
                {result.txids[result.txids.length - 1]}
                {result.txids.length > 1 ? ` +${result.txids.length - 1} more` : ""}
              </button>
            )}
            <div className="flex gap-2">
              {result.remaining > 1 && (
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    setResult(null);
                    setErr(null);
                  }}
                >
                  Run again
                </Button>
              )}
              <Button className="flex-1" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        )}
        <Toast msg={toast} />
      </div>
    </div>
  );
}
