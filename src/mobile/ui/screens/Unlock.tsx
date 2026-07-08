import { useState, useEffect, useRef } from "react";
import { useApp } from "../WalletProvider";
import { Button, Card, Field } from "../kit";

export function Unlock() {
  const app = useApp();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoPrompted = useRef(false);

  const doUnlock = async () => {
    setErr(null);
    setBusy(true);
    try {
      await app.unlock(pw);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
      setPw("");
    }
  };

  const doBiometric = async () => {
    setErr(null);
    try {
      await app.unlockBiometric();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (!/cancel|user/i.test(m)) setErr(m);
    }
  };

  // If biometric unlock is enabled and available, offer it immediately (fingerprint / face).
  useEffect(() => {
    if (app.biometricReady && app.biometricEnabled && !autoPrompted.current) {
      autoPrompted.current = true;
      void doBiometric();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.biometricReady, app.biometricEnabled]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6">
      <div className="text-center">
        <div className="text-2xl font-bold text-emerald-400">Welcome back</div>
        <div className="mt-1 text-slate-400">Unlock to continue</div>
      </div>
      <Card>
        <div className="flex flex-col gap-3">
          <Field label="Password" type="password" value={pw} onChange={setPw} />
          <Button onClick={doUnlock} disabled={busy || pw.length === 0}>
            {busy ? "Unlocking…" : "Unlock"}
          </Button>
          {app.biometricEnabled && (
            <Button variant="ghost" onClick={doBiometric}>
              Use biometrics
            </Button>
          )}
        </div>
      </Card>
      {err && <div className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{err}</div>}
    </div>
  );
}
