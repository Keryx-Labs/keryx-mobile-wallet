import { useApp } from "../WalletProvider";
import { formatKrx, shortAddr } from "../kit";

export function History() {
  const app = useApp();
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-5 pb-28">
      <div className="flex items-center justify-between">
        <div className="glow text-lg font-semibold text-keryx-bright">Activity</div>
        <button className="text-xs text-keryx-green" onClick={() => app.refresh()}>
          {app.refreshing ? "…" : "Refresh"}
        </button>
      </div>
      {app.history.length === 0 && (
        <div className="border border-keryx-border rounded bg-keryx-surface px-4 py-8 text-center text-sm text-keryx-dim">
          No transactions yet
        </div>
      )}
      {app.history.map((h) => (
        <button
          key={h.txId}
          onClick={() => app.openExplorerTx(h.txId)}
          className="border border-keryx-border flex items-center justify-between rounded bg-keryx-surface px-4 py-3 text-left active:scale-[0.99]"
        >
          <div>
            <div className={`font-semibold ${h.amountSompi >= 0n ? "text-keryx-green" : "text-keryx-ink"}`}>
              {h.amountSompi >= 0n ? "Received" : "Sent"}
            </div>
            <div className="font-mono text-xs text-keryx-dim">{shortAddr("tx:" + h.txId, 8).slice(3)} ↗</div>
          </div>
          <div className={`text-right ${h.amountSompi >= 0n ? "text-keryx-green" : "text-keryx-ink"}`}>
            {h.amountSompi >= 0n ? "+" : ""}
            {formatKrx(h.amountSompi)} KRX
          </div>
        </button>
      ))}
    </div>
  );
}
