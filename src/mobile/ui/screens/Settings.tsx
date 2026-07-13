import { useState } from "react";
import { useApp } from "../WalletProvider";
import { Button, Card, Field, copy, shortAddr, Toast } from "../kit";
import { RESOURCE_LINKS } from "../../externalLinks";
import { ResIcon } from "../ResourceIcons";

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
      <div className="text-lg font-semibold text-slate-100">Settings</div>

      <Card>
        <div className="mb-1 font-semibold text-slate-100">Security</div>
        <button
          className="flex w-full items-center justify-between py-2 text-left"
          onClick={() => app.lock()}
        >
          <span className="text-slate-300">Lock wallet now</span>
          <span className="text-slate-500">›</span>
        </button>
        {!app.biometricEnabled && (
          <div className="border-t border-slate-800 pt-2">
            {!showBio ? (
              <button className="py-2 text-left text-slate-300" onClick={() => setShowBio(true)}>
                Enable biometric unlock
              </button>
            ) : (
              <div className="flex flex-col gap-2 py-2">
                <div className="text-sm text-slate-400">
                  Confirm your password, then verify with biometrics to enable.
                </div>
                <Field label="Password" type="password" value={bioPw} onChange={setBioPw} />
                <Button onClick={enableBio} disabled={bioBusy || bioPw.length === 0}>
                  {bioBusy ? "Enabling…" : "Enable"}
                </Button>
                {bioErr && (
                  <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">{bioErr}</div>
                )}
              </div>
            )}
          </div>
        )}
        {app.biometricEnabled && (
          <div className="border-t border-slate-800 py-2 text-sm text-emerald-400">
            Biometric unlock enabled
          </div>
        )}
      </Card>

      <Card>
        <button
          className="flex w-full items-center justify-between text-left"
          onClick={() => setShowAdv((v) => !v)}
        >
          <span className="font-semibold text-slate-100">Advanced</span>
          <span className="text-slate-500">{showAdv ? "▾" : "›"}</span>
        </button>
        {showAdv && (
          <div className="mt-2 border-t border-slate-800 pt-3">
            <div className="text-sm text-slate-400">
              Network: connected via the Keryx public gateway. No node setup required.
            </div>
            <label className="mt-3 flex items-center justify-between border-t border-slate-800 py-2">
              <span className="text-slate-300">I own a miner</span>
              <input
                type="checkbox"
                checked={app.minerMode}
                onChange={(e) => app.setMinerMode(e.target.checked)}
                className="h-5 w-5 accent-emerald-500"
              />
            </label>
            <div className="text-xs text-slate-500">
              Adds a subtle Consolidate action on the wallet screen to combine many small mining payouts.
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-2 font-semibold text-slate-100">Community &amp; resources</div>
        <div className="flex flex-wrap gap-3">
          {RESOURCE_LINKS.map((r) => (
            <button
              key={r.kind}
              onClick={() => app.openLink(r.url)}
              aria-label={r.label}
              title={r.label}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-emerald-400"
            >
              <ResIcon kind={r.kind} />
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="mb-1 font-semibold text-slate-100">About · Support development</div>
        <p className="text-sm text-slate-400">
          Keryx Wallet is free and open source. Donations are optional and appreciated.
        </p>
        {app.donateAddress && (
          <button
            className="mt-2 w-full text-left font-mono text-xs text-slate-300"
            onClick={() => {
              copy(app.donateAddress);
              flash("Donate address copied");
            }}
          >
            {shortAddr(app.donateAddress, 12)} — tap to copy
          </button>
        )}
      </Card>

      <Card>
        <div className="mb-1 font-semibold text-red-300">Danger zone</div>
        <p className="text-sm text-slate-400">
          Remove this wallet from the device. You can only restore it with your 24-word phrase.
        </p>
        {!confirmWipe ? (
          <div className="mt-2">
            <Button variant="danger" onClick={() => setConfirmWipe(true)}>
              Remove wallet
            </Button>
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            <div className="text-sm text-red-300">Are you sure? Make sure you have your 24 words.</div>
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
