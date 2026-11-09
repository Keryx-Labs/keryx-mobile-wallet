import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../WalletProvider";

// Wallet-screen Consolidate row (miner mode): "Consolidate" + merge icon + a live UTXO-count pill.
// Always visible when miner mode is on. The count is refreshed lightly in the background (on mount,
// every 2 min while the wallet screen is open, and after a consolidate). Tapping opens the Consolidate
// modal, which explains it and asks for a tap to confirm.

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

export function ConsolidateRow({ onOpenModal }: { onOpenModal: () => void }) {
  const app = useApp();
  const [count, setCount] = useState<number | null>(null);
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


  const Pill = () => {
    if (app.resumableConsolidation)
      return (
        <span className="rounded-full bg-keryx-warn/20 px-3 py-1 text-xs font-medium text-keryx-warn">
          Resume
        </span>
      );
    return (
      <span className="rounded-full bg-keryx-border/60 px-3 py-1 font-mono text-xs text-keryx-dim">
        {count == null ? "…" : `${count.toLocaleString()} UTXOs`}
      </span>
    );
  };

  return (
    <button
      onClick={onOpenModal}
      className="border border-keryx-border flex items-center gap-3 rounded bg-keryx-surface px-4 py-3 text-left active:scale-[0.99] hover:border-keryx-borderHi"
    >
      <span className="text-sm font-medium text-keryx-green">Consolidate</span>
      <span className="text-keryx-green">
        <MergeIcon />
      </span>
      <span className="flex-1" />
      <Pill />
    </button>
  );
}
