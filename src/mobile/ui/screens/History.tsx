import { useApp } from "../WalletProvider";
import { formatKrx, shortAddr } from "../kit";

export function History() {
  const app = useApp();
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-5 pb-28">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold text-slate-100">Activity</div>
        <button className="text-xs text-emerald-400" onClick={() => app.refresh()}>
          {app.refreshing ? "…" : "Refresh"}
        </button>
      </div>
      {app.history.length === 0 && (
        <div className="rounded-2xl bg-slate-900/60 px-4 py-8 text-center text-sm text-slate-500">
          No transactions yet
        </div>
      )}
      {app.history.map((h) => (
        <button
          key={h.txId}
          onClick={() => app.openExplorerTx(h.txId)}
          className="flex items-center justify-between rounded-2xl bg-slate-900/60 px-4 py-3 text-left active:scale-[0.99]"
        >
          <div>
            <div className={`font-semibold ${h.amountSompi >= 0n ? "text-emerald-400" : "text-slate-100"}`}>
              {h.amountSompi >= 0n ? "Received" : "Sent"}
            </div>
            <div className="font-mono text-xs text-slate-500">{shortAddr("tx:" + h.txId, 8).slice(3)} ↗</div>
          </div>
          <div className={`text-right ${h.amountSompi >= 0n ? "text-emerald-400" : "text-slate-200"}`}>
            {h.amountSompi >= 0n ? "+" : ""}
            {formatKrx(h.amountSompi)} KRX
          </div>
        </button>
      ))}
    </div>
  );
}
