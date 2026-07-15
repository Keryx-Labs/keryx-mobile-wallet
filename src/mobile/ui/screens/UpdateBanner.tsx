import { useEffect, useState } from "react";
import { isNative } from "../../platform";
import { openExternalUrl } from "../../externalLinks";
import {
  checkForUpdate,
  currentAppVersion,
  dismissUpdate,
  isUpdateDismissed,
  type UpdateInfo,
} from "../../update";

// A dismissible "update available" banner for the sideloaded Android build. It checks the public
// GitHub Releases API on mount (native only), and if a newer version is published it offers a link to
// the release page. It never installs anything — "Update" opens the release page in the system
// browser. Dismissal is per-version, so a newer release will surface again.
export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let alive = true;
    if (!isNative()) return; // update checks only make sense for the sideloaded native app
    void (async () => {
      const upd = await checkForUpdate();
      if (alive && upd && !isUpdateDismissed(upd.version)) setInfo(upd);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!info) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-emerald-300">Update available — v{info.version}</div>
        <div className="text-xs text-slate-400">A newer version is on GitHub. Tap update to download.</div>
      </div>
      <button
        className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-300 active:scale-95"
        onClick={() => void openExternalUrl(info.url)}
      >
        Update
      </button>
      <button
        aria-label="Dismiss"
        className="px-1 text-slate-500 hover:text-slate-300"
        onClick={() => {
          dismissUpdate(info.version);
          setInfo(null);
        }}
      >
        ✕
      </button>
    </div>
  );
}

type CheckState = "idle" | "checking" | "latest" | "available";

// Settings card: shows the installed version and a manual "Check for updates" button.
export function VersionCard() {
  const [version, setVersion] = useState<string | null>(null);
  const [state, setState] = useState<CheckState>("idle");
  const [found, setFound] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let alive = true;
    void currentAppVersion().then((v) => {
      if (alive) setVersion(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const check = async () => {
    setState("checking");
    const upd = await checkForUpdate();
    if (upd) {
      setFound(upd);
      setState("available");
    } else {
      setFound(null);
      setState("latest");
    }
  };

  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-400">
          Version{" "}
          <span className="font-mono text-slate-300">{version ? `v${version}` : "—"}</span>
        </div>
        {state === "available" && found ? (
          <button
            className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-300"
            onClick={() => void openExternalUrl(found.url)}
          >
            Update to v{found.version}
          </button>
        ) : (
          <button
            className="text-xs text-emerald-400 disabled:text-slate-500"
            onClick={() => void check()}
            disabled={state === "checking"}
          >
            {state === "checking" ? "Checking…" : "Check for updates"}
          </button>
        )}
      </div>
      {state === "latest" && (
        <div className="mt-1 text-xs text-slate-500">You're on the latest version.</div>
      )}
    </div>
  );
}
