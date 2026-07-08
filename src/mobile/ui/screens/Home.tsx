import { useState } from "react";
import { useApp } from "../WalletProvider";
import { Button, Card, copy, formatKrx, krxNumber, shortAddr, Toast, PullToRefresh } from "../kit";

export function Home({ go }: { go: (id: "send" | "receive") => void }) {
  const app = useApp();
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1400);
  };
  const usd = app.usd(krxNumber(app.balanceSompi));

  return (
    <PullToRefresh onRefresh={() => app.refresh()} refreshing={app.refreshing}>
      <div className="mx-auto flex max-w-md flex-col gap-4 p-5 pb-28">
        <Card className="text-center">
          <div className="text-sm text-slate-400">Balance</div>
          <div className="mt-1 text-4xl font-bold text-slate-50">
            {formatKrx(app.balanceSompi)} <span className="text-xl text-slate-400">KRX</span>
          </div>
          {usd && <div className="mt-1 text-slate-400">≈ {usd}</div>}
          {app.price && (
            <div className="mt-2 text-xs text-slate-500">
              1 KRX ≈ ${app.price.usd.toPrecision(3)}
              {app.price.changePercent != null && (
                <span className={app.price.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {" "}
                  {app.price.changePercent >= 0 ? "▲" : "▼"} {Math.abs(app.price.changePercent).toFixed(2)}%
                </span>
              )}
            </div>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => go("send")}>Send</Button>
          <Button variant="ghost" onClick={() => go("receive")}>
            Receive
          </Button>
        </div>

        {app.receiveAddress && (
          <Card>
            <div className="text-sm text-slate-400">Your address</div>
            <button
              className="mt-1 w-full text-left font-mono text-sm text-slate-200"
              onClick={() => {
                copy(app.receiveAddress!);
                flash("Address copied");
              }}
            >
              {shortAddr(app.receiveAddress, 14)}
            </button>
          </Card>
        )}

        <Button variant="ghost" onClick={() => app.openTrade()}>
          Trade KRX ↗
        </Button>

        <div className="flex items-center justify-between px-1">
          <div className="text-sm font-semibold text-slate-300">Recent activity</div>
          <button className="text-xs text-emerald-400" onClick={() => app.refresh()}>
            {app.refreshing ? "…" : "Refresh"}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {app.history.length === 0 && (
            <div className="rounded-2xl bg-slate-900/60 px-4 py-6 text-center text-sm text-slate-500">
              No transactions yet
            </div>
          )}
          {app.history.slice(0, 5).map((h) => (
            <div key={h.txId} className="flex items-center justify-between rounded-2xl bg-slate-900/60 px-4 py-3">
              <div className="font-mono text-xs text-slate-400">{shortAddr("tx:" + h.txId, 6).slice(3)}</div>
              <div className={h.amountSompi >= 0n ? "text-emerald-400" : "text-slate-200"}>
                {h.amountSompi >= 0n ? "+" : ""}
                {formatKrx(h.amountSompi)} KRX
              </div>
            </div>
          ))}
        </div>
        <Toast msg={toast} />
      </div>
    </PullToRefresh>
  );
}
