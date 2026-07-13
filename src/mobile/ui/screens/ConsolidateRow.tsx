import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../WalletProvider";

// Wallet-screen Consolidate row (miner mode): "Consolidate" + merge icon + a live UTXO-count pill.
// Always visible when miner mode is on. The count is refreshed lightly in the background (on mount,
// every 2 min while the wallet screen is open, and after a consolidate). Tapping runs the consolidate
// inline: the pill becomes a loading indicator, biometrics confirm (explicit authorization), then it
// broadcasts. Without biometrics it opens the full Consolidate modal (password confirm) instead.

function MergeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6h5l4 4" />
      <path d="M4 18h5l4 -4" />
      <path d="M13 12h7" />
      <path d="M17 9l3 3 -3 3" />
    </svg>
  );
}

type Status = "idle" | "working" | "done" | "error";

export function ConsolidateRow({ onOpenModal }: { onOpenModal: () => void }) {
  const app = useApp();
  const [count, setCount] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState<string>("");
  const alive = useRef(true);

  const loadCount = useCallback(async () => {
    try {
      const info = await app.consolidatePreview();
      if (alive.current) setCount(info.matureCount);
    } catch {
      /* leave the last known count; background refresh will retry */
    }
  }, [app]);

  useEffect(() => {
    alive.current = true;
    void loadCount();
    const id = setInterval(() => void loadCount(), 120_000);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [loadCount]);

  const onTap = async () => {
    if (status === "working") return;
    if (!app.biometricEnabled) {
      onOpenModal(); // password confirm lives in the modal
      return;
    }
    setStatus("working");
    setMsg("");
    try {
      const r = await app.consolidateWithBiometric((pr) => {
        if (alive.current) {
          setStatus("working");
          setMsg(`${pr.remaining.toLocaleString()} left`);
        }
      });
      if (!alive.current) return;
      setStatus("done");
      setMsg(r.remaining <= 1 ? "Done" : `${r.remaining.toLocaleString()} left`);
      setCount(r.remaining);
      setTimeout(() => {
        if (alive.current) {
          setStatus("idle");
          setMsg("");
        }
      }, 3000);
    } catch (e) {
      if (!alive.current) return;
      const m = e instanceof Error ? e.message : String(e);
      if (/cancel/i.test(m)) {
        setStatus("idle");
        return;
      }
      setStatus("error");
      setMsg(m.length > 42 ? "Couldn't consolidate" : m);
      setTimeout(() => {
        if (alive.current) {
          setStatus("idle");
          setMsg("");
        }
      }, 4000);
    }
  };

  const Pill = () => {
    if (status === "working")
      return (
        <span className="inline-flex items-center gap-2 rounded-full bg-slate-700/60 px-3 py-1 text-xs text-slate-400">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          {msg || "Preparing…"}
        </span>
      );
    if (status === "done")
      return (
        <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-400">{msg}</span>
      );
    if (status === "error")
      return <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs text-red-300">{msg}</span>;
    return (
      <span className="rounded-full bg-slate-700/60 px-3 py-1 font-mono text-xs text-slate-400">
        {count == null ? "…" : `${count.toLocaleString()} UTXOs`}
      </span>
    );
  };

  return (
    <button
      onClick={onTap}
      className="flex items-center gap-3 rounded-2xl bg-slate-900/70 px-4 py-3 text-left active:scale-[0.99] hover:bg-slate-800/70"
    >
      <span className="text-sm font-medium text-emerald-400">Consolidate</span>
      <span className="text-emerald-400">
        <MergeIcon />
      </span>
      <span className="flex-1" />
      <Pill />
    </button>
  );
}
