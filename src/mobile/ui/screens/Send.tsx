import { useState } from "react";
import { useApp } from "../WalletProvider";
import { Button, Card, Field, formatKrx, krxToSompi } from "../kit";
import { parseKeryxTarget } from "../../qr";
import { QrScanner } from "./QrScanner";
import { Recipients } from "./Recipients";
import { saveContact } from "../../addressBook";

const MIN_FEE = 30_000_000n; // 0.3 KRX display estimate (enforced by the signer)

type Stage = "form" | "confirm" | "password" | "done";

export function Send({ onDone }: { onDone: () => void }) {
  const app = useApp();
  const [stage, setStage] = useState<Stage>("form");
  const [dest, setDest] = useState("");
  const [amount, setAmount] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [txId, setTxId] = useState("");
  const [showRecipients, setShowRecipients] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [savedContact, setSavedContact] = useState(false);

  const review = () => {
    setErr(null);
    let amountSompi: bigint;
    try {
      amountSompi = krxToSompi(amount);
    } catch {
      return setErr("Enter a valid amount.");
    }
    const r = app.reviewSend({
      destAddress: dest,
      amountSompi,
      feeSompi: MIN_FEE,
      availableSompi: app.balanceSompi,
      addressPrefix: "keryx",
    });
    if (!r.ok) return setErr(r.error);
    setStage("confirm");
  };

  const finish = (id: string) => {
    setTxId(id);
    setStage("done");
  };

  // Authorize with fingerprint / face (no password typing).
  const submitBiometric = async () => {
    setErr(null);
    setBusy(true);
    try {
      const { txId } = await app.sendWithBiometric(dest.trim(), krxToSompi(amount));
      finish(txId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStage("password"); // fall back to password on any biometric failure
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async () => {
    setErr(null);
    setBusy(true);
    try {
      const { txId } = await app.send(pw, dest.trim(), krxToSompi(amount));
      finish(txId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setPw("");
    }
  };

  const handleScan = (raw: string) => {
    setShowScanner(false);
    const t = parseKeryxTarget(raw);
    if (!app.wallet?.validateAddress(t.address)) {
      setErr("That QR code isn't a valid Keryx address.");
      return;
    }
    setErr(null);
    setDest(t.address);
    if (t.amountKrx) setAmount(t.amountKrx);
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-5 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={onDone} aria-label="Back" className="text-xl text-slate-400">←</button>
        <div className="text-lg font-semibold text-slate-100">Send KRX</div>
      </div>

      {stage === "form" && (
        <Card>
          <div className="flex flex-col gap-3">
            <Field label="To address" value={dest} onChange={setDest} placeholder="keryx:…" mono />
            <div className="flex gap-5">
              <button
                onClick={() => {
                  setErr(null);
                  setShowScanner(true);
                }}
                className="text-sm text-emerald-400"
              >
                Scan QR code
              </button>
              <button onClick={() => setShowRecipients(true)} className="text-sm text-emerald-400">
                Recipients
              </button>
            </div>
            <Field label="Amount (KRX)" value={amount} onChange={setAmount} placeholder="0.0" />
            <div className="text-xs text-slate-500">
              Available: {formatKrx(app.balanceSompi)} KRX · network fee ≈ {formatKrx(MIN_FEE)} KRX
            </div>
            <Button onClick={review}>Review</Button>
          </div>
        </Card>
      )}

      {stage === "confirm" && (
        <Card>
          <div className="mb-3 font-semibold text-slate-100">Confirm — this is exactly what you sign</div>
          <Row k="To" v={dest} mono />
          <Row k="Amount" v={`${amount} KRX`} />
          <Row k="Network fee" v={`≈ ${formatKrx(MIN_FEE)} KRX`} />
          <div className="mt-4 flex flex-col gap-2">
            {app.biometricEnabled ? (
              <>
                <Button onClick={submitBiometric} disabled={busy}>
                  {busy ? "Authorizing…" : "Confirm with fingerprint / face"}
                </Button>
                <Button variant="ghost" onClick={() => setStage("password")}>
                  Use password instead
                </Button>
              </>
            ) : (
              <Button onClick={() => setStage("password")}>Confirm</Button>
            )}
            <Button variant="ghost" onClick={() => setStage("form")}>
              Back
            </Button>
          </div>
        </Card>
      )}

      {stage === "password" && (
        <Card>
          <div className="mb-2 font-semibold text-slate-100">Enter password to sign</div>
          <p className="mb-3 text-sm text-slate-400">
            The transaction is signed on this device. Your password never leaves it.
          </p>
          <div className="flex flex-col gap-3">
            <Field label="Password" type="password" value={pw} onChange={setPw} />
            <Button onClick={submitPassword} disabled={busy || pw.length === 0}>
              {busy ? "Signing & broadcasting…" : "Sign & send"}
            </Button>
            <Button variant="ghost" onClick={() => setStage("confirm")}>
              Back
            </Button>
          </div>
        </Card>
      )}

      {stage === "done" && (
        <Card className="text-center">
          <div className="text-lg font-semibold text-emerald-400">Sent ✓</div>
          <div className="mt-2 break-all font-mono text-xs text-slate-400">{txId}</div>
          {!savedContact ? (
            <div className="mt-4 flex flex-col gap-2 text-left">
              <input
                value={saveLabel}
                onChange={(e) => setSaveLabel(e.target.value)}
                placeholder="Label this address to save it (optional)"
                className="w-full rounded-2xl bg-slate-800 px-4 py-3 text-sm text-slate-100 outline-none ring-emerald-500/60 focus:ring-2"
              />
              <Button
                variant="ghost"
                onClick={() => {
                  saveContact(app.receiveAddress, dest, saveLabel);
                  setSavedContact(true);
                }}
                disabled={!saveLabel.trim()}
              >
                Save to address book
              </Button>
            </div>
          ) : (
            <div className="mt-3 text-sm text-emerald-400">Saved to address book</div>
          )}
          <div className="mt-4">
            <Button onClick={onDone}>Done</Button>
          </div>
        </Card>
      )}

      {err && <div className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{err}</div>}

      {showRecipients && (
        <Recipients
          onSelect={(a) => {
            setDest(a);
            setShowRecipients(false);
          }}
          onClose={() => setShowRecipients(false)}
        />
      )}

      {showScanner && <QrScanner onResult={handleScan} onClose={() => setShowScanner(false)} />}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-800 py-2 last:border-0">
      <span className="text-slate-400">{k}</span>
      <span className={`text-right text-slate-100 ${mono ? "break-all font-mono text-sm" : ""}`}>{v}</span>
    </div>
  );
}
