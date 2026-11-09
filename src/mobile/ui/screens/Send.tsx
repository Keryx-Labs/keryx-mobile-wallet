import { useState } from "react";
import { useApp } from "../WalletProvider";
import { Button, Card, Field, formatKrx, krxToSompi } from "../kit";
import { parseKeryxTarget } from "../../qr";
import { QrScanner } from "./QrScanner";
import { Recipients } from "./Recipients";
import { saveContact } from "../../addressBook";

const MIN_FEE = 30_000_000n; // 0.3 KRX display estimate (enforced by the signer)

type Stage = "form" | "confirm" | "done";

export function Send({ onDone }: { onDone: () => void }) {
  const app = useApp();
  const [stage, setStage] = useState<Stage>("form");
  const [dest, setDest] = useState("");
  const [amount, setAmount] = useState("");
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

  // Signed with the unlocked wallet: no password once it is open.
  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const { txId } = await app.send("", dest.trim(), krxToSompi(amount));
      finish(txId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
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
        <button onClick={onDone} aria-label="Back" className="text-xl text-keryx-dim">←</button>
        <div className="glow text-lg font-semibold text-keryx-bright">Send KRX</div>
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
                className="text-sm text-keryx-green"
              >
                Scan QR code
              </button>
              <button onClick={() => setShowRecipients(true)} className="text-sm text-keryx-green">
                Recipients
              </button>
            </div>
            <Field label="Amount (KRX)" value={amount} onChange={setAmount} placeholder="0.0" />
            <div className="text-xs text-keryx-dim">
              Available: {formatKrx(app.balanceSompi)} KRX · network fee ≈ {formatKrx(MIN_FEE)} KRX
            </div>
            <Button onClick={review}>Review</Button>
          </div>
        </Card>
      )}

      {stage === "confirm" && (
        <Card>
          <div className="mb-3 font-semibold text-keryx-ink">Confirm — this is exactly what you sign</div>
          <Row k="To" v={dest} mono />
          <Row k="Amount" v={`${amount} KRX`} />
          <Row k="Network fee" v={`≈ ${formatKrx(MIN_FEE)} KRX`} />
          <div className="mt-4 flex flex-col gap-2">
            <Button onClick={submit} disabled={busy}>
              {busy ? "Signing & broadcasting…" : "Sign & send"}
            </Button>
            <Button variant="ghost" onClick={() => setStage("form")}>
              Back
            </Button>
          </div>
        </Card>
      )}

      {stage === "done" && (
        <Card className="text-center">
          <div className="glow text-lg font-semibold text-keryx-bright">Sent ✓</div>
          <div className="mt-2 break-all font-mono text-xs text-keryx-dim">{txId}</div>
          {!savedContact ? (
            <div className="mt-4 flex flex-col gap-2 text-left">
              <input
                value={saveLabel}
                onChange={(e) => setSaveLabel(e.target.value)}
                placeholder="Label this address to save it (optional)"
                className="border border-keryx-border w-full rounded bg-keryx-green/[0.03] px-4 py-3 text-sm text-keryx-ink outline-none ring-keryx-green/60 focus:ring-2"
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
            <div className="mt-3 text-sm text-keryx-green">Saved to address book</div>
          )}
          <div className="mt-4">
            <Button onClick={onDone}>Done</Button>
          </div>
        </Card>
      )}

      {err && <div className="rounded bg-keryx-error/10 px-4 py-3 text-sm text-keryx-error">{err}</div>}

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
    <div className="flex justify-between gap-3 border-b border-keryx-border py-2 last:border-0">
      <span className="text-keryx-dim">{k}</span>
      <span className={`text-right text-keryx-ink ${mono ? "break-all font-mono text-sm" : ""}`}>{v}</span>
    </div>
  );
}
