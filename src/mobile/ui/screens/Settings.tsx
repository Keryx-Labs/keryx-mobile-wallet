import { useEffect, useState } from "react";
import { useApp } from "../WalletProvider";
import { Button, Card, Field, copy, shortAddr, Toast } from "../kit";
import { RESOURCE_LINKS } from "../../externalLinks";
import { ResIcon } from "../ResourceIcons";
import { VersionCard } from "./UpdateBanner";

export function Settings() {
  const app = useApp();
  const [toast, setToast] = useState<string | null>(null);
  const [bioPw, setBioPw] = useState("");
  const [showBio, setShowBio] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [bioErr, setBioErr] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [showAdv, setShowAdv] = useState(false);
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1400);
  };

  const enableBio = async () => {
    setBioErr(null);
    setBioBusy(true);
    try {
      await app.enableBiometric(bioPw);
      setShowBio(false);
      setBioPw("");
      flash("Biometric unlock enabled");
    } catch (e) {
      setBioErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBioBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-5 pb-28">
      <div className="glow text-lg font-semibold text-keryx-bright">Settings</div>

      <Card>
        <div className="mb-1 font-semibold text-keryx-ink">Security</div>
        <button
          className="flex w-full items-center justify-between py-2 text-left"
          onClick={() => app.lock()}
        >
          <span className="text-keryx-text">Lock wallet now</span>
          <span className="text-keryx-dim">›</span>
        </button>
        {!app.biometricEnabled && (
          <div className="border-t border-keryx-border pt-2">
            {!showBio ? (
              <button className="py-2 text-left text-keryx-text" onClick={() => setShowBio(true)}>
                Enable biometric unlock
              </button>
            ) : (
              <div className="flex flex-col gap-2 py-2">
                <div className="text-sm text-keryx-dim">
                  Confirm your password, then verify with biometrics to enable.
                </div>
                <Field label="Password" type="password" value={bioPw} onChange={setBioPw} />
                <Button onClick={enableBio} disabled={bioBusy || bioPw.length === 0}>
                  {bioBusy ? "Enabling…" : "Enable"}
                </Button>
                {bioErr && (
                  <div className="rounded-sm bg-keryx-error/10 px-3 py-2 text-sm text-keryx-error">{bioErr}</div>
                )}
              </div>
            )}
          </div>
        )}
        {app.biometricEnabled && (
          <div className="border-t border-keryx-border py-2 text-sm text-keryx-green">
            Biometric unlock enabled
          </div>
        )}
      </Card>

      <Card>
        <button
          className="flex w-full items-center justify-between text-left"
          onClick={() => setShowAdv((v) => !v)}
        >
          <span className="font-semibold text-keryx-ink">Advanced</span>
          <span className="text-keryx-dim">{showAdv ? "▾" : "›"}</span>
        </button>
        {showAdv && (
          <div className="mt-2 border-t border-keryx-border pt-3">
            <NodeSettings onSaved={flash} />
            <label className="mt-3 flex items-center justify-between border-t border-keryx-border py-2">
              <span className="text-keryx-text">I own a miner</span>
              <input
                type="checkbox"
                checked={app.minerMode}
                onChange={(e) => app.setMinerMode(e.target.checked)}
                className="h-5 w-5 accent-[#2ee358]"
              />
            </label>
            <div className="text-xs text-keryx-dim">
              Adds a subtle Consolidate action on the wallet screen to combine many small mining payouts.
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-2 font-semibold text-keryx-ink">Community &amp; resources</div>
        <div className="flex flex-wrap gap-3">
          {RESOURCE_LINKS.map((r) => (
            <button
              key={r.kind}
              onClick={() => app.openLink(r.url)}
              aria-label={r.label}
              title={r.label}
              className="border border-keryx-border flex h-11 w-11 items-center justify-center rounded bg-keryx-green/[0.03] text-keryx-text hover:border-keryx-borderHi hover:text-keryx-green"
            >
              <ResIcon kind={r.kind} />
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="mb-1 font-semibold text-keryx-ink">About · Support development</div>
        <p className="text-sm text-keryx-dim">
          Keryx Wallet is free and open source. Donations are optional and appreciated.
        </p>
        {app.donateAddress && (
          <button
            className="mt-2 w-full text-left font-mono text-xs text-keryx-text"
            onClick={() => {
              copy(app.donateAddress);
              flash("Donate address copied");
            }}
          >
            {shortAddr(app.donateAddress, 12)} — tap to copy
          </button>
        )}
        <VersionCard />
      </Card>

      <Card>
        <div className="mb-1 font-semibold text-keryx-error">Danger zone</div>
        <p className="text-sm text-keryx-dim">
          Remove this wallet from the device. You can only restore it with your recovery phrase.
        </p>
        {!confirmWipe ? (
          <div className="mt-2">
            <Button variant="danger" onClick={() => setConfirmWipe(true)}>
              Remove wallet
            </Button>
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            <div className="text-sm text-keryx-error">Are you sure? Make sure you have your recovery phrase.</div>
            <Button variant="danger" onClick={() => app.wipe()}>
              Yes, remove
            </Button>
            <Button variant="ghost" onClick={() => setConfirmWipe(false)}>
              Cancel
            </Button>
          </div>
        )}
      </Card>

      <Toast msg={toast} />
    </div>
  );
}

function NodeSettings({ onSaved }: { onSaved: (m: string) => void }) {
  const app = useApp();
  const rt = app.runtime;
  const [draft, setDraft] = useState(rt?.customNode() ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState(() => rt?.nodeStatus() ?? { url: null, lastError: null });

  const check = async () => {
    if (!rt) return;
    setChecking(true);
    setStatus(await rt.checkNode());
    setChecking(false);
  };
  useEffect(() => {
    void check();
  }, [rt]);
  if (!rt) return null;

  const apply = (url: string | null) => {
    const res = rt.setCustomNode(url);
    if (!res.ok) return setErr(res.error ?? "Invalid node address.");
    setErr(null);
    if (!url) setDraft("");
    onSaved(url ? "Node saved" : "Official node restored");
    void check().then(() => app.refresh());
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="label">Node</div>
      <div className="break-all text-sm text-keryx-text">
        {checking ? "Checking…" : status.url ? `Connected · ${status.url}` : "Gateway only — no node reachable right now"}
      </div>
      {!checking && !status.url && status.lastError && (
        <div className="break-all text-xs text-keryx-dim">{status.lastError}</div>
      )}
      <div className="text-xs text-keryx-dim">
        Balance, coins and sends go to this node; history comes from the Keryx gateway. If the node does
        not answer, the wallet uses the gateway.
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="wss://your-node:23110"
        autoCapitalize="off"
        autoCorrect="off"
        className="input mt-1 text-sm"
      />
      {err && <div className="text-sm text-keryx-error">{err}</div>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => apply(draft)} disabled={!draft.trim()}>
          Use this node
        </Button>
        {rt.customNode() && (
          <Button className="flex-1" variant="ghost" onClick={() => apply(null)}>
            Official node
          </Button>
        )}
      </div>
    </div>
  );
}
