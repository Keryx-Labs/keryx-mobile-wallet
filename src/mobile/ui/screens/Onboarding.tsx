import { useState } from "react";
import { useApp } from "../WalletProvider";
import { Button, Card, Field, copy } from "../kit";

type Step = "choose" | "show" | "backup" | "import" | "password";

export function Onboarding() {
  const app = useApp();
  const [step, setStep] = useState<Step>("choose");
  const [phrase, setPhrase] = useState("");
  const [importText, setImportText] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"create" | "import">("create");

  const startCreate = () => {
    setMode("create");
    setPhrase(app.newMnemonic());
    setStep("show");
  };
  const startImport = () => {
    setMode("import");
    setStep("import");
  };

  const finish = async () => {
    setErr(null);
    if (pw.length < 8) return setErr("Use a password of at least 8 characters.");
    if (pw !== pw2) return setErr("Passwords do not match.");
    const src = mode === "create" ? phrase : importText.trim().replace(/\s+/g, " ");
    if (!app.validateMnemonic(src)) return setErr("That recovery phrase is not valid.");
    setBusy(true);
    try {
      await app.createOrImport(pw, src);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6">
      <div className="pt-8 text-center">
        <div className="glow text-3xl font-bold text-keryx-bright">Keryx Wallet</div>
        <div className="mt-1 text-keryx-dim">Self-custodial · your keys stay on this device</div>
      </div>

      {step === "choose" && (
        <div className="mt-6 flex flex-col gap-3">
          <Button onClick={startCreate}>Create a new wallet</Button>
          <Button variant="ghost" onClick={startImport}>
            Import recovery phrase (12 or 24 words)
          </Button>
        </div>
      )}

      {step === "show" && (
        <Card>
          <div className="mb-3 font-semibold text-keryx-ink">Your recovery phrase</div>
          <p className="mb-3 text-sm text-keryx-dim">
            Write these 24 words down and keep them offline. Anyone with them controls your funds.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {phrase.split(" ").map((w, i) => (
              <div key={i} className="whitespace-nowrap rounded-sm border border-keryx-border bg-keryx-green/[0.03] px-1.5 py-2 text-xs text-keryx-ink">
                <span className="text-[10px] text-keryx-dim">{i + 1}.</span> {w}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Button variant="ghost" onClick={() => copy(phrase)}>
              Copy
            </Button>
            <Button onClick={() => setStep("password")}>I saved it — continue</Button>
          </div>
        </Card>
      )}

      {step === "import" && (
        <Card>
          <div className="mb-2 font-semibold text-keryx-ink">Import wallet</div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Enter your 12 or 24-word recovery phrase, separated by spaces"
            rows={4}
            className="border border-keryx-border w-full rounded bg-keryx-green/[0.03] px-4 py-3 font-mono text-sm text-keryx-ink outline-none focus:ring-2 focus:ring-keryx-green/60"
          />
          <div className="mt-3">
            <Button onClick={() => setStep("password")} disabled={importText.trim().length < 10}>
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === "password" && (
        <Card>
          <div className="mb-3 font-semibold text-keryx-ink">Set a password</div>
          <p className="mb-3 text-sm text-keryx-dim">
            This encrypts your wallet on this device. It is required to unlock and to send.
          </p>
          <div className="flex flex-col gap-3">
            <Field label="Password" type="password" value={pw} onChange={setPw} />
            <Field label="Confirm password" type="password" value={pw2} onChange={setPw2} />
            <Button onClick={finish} disabled={busy}>
              {busy ? "Setting up…" : "Finish"}
            </Button>
          </div>
        </Card>
      )}

      {err && <div className="rounded bg-keryx-error/10 px-4 py-3 text-sm text-keryx-error">{err}</div>}
    </div>
  );
}
