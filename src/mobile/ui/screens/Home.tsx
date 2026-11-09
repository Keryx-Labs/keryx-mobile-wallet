import { useState } from "react";
import { useApp } from "../WalletProvider";
import { Button, Card, copy, formatKrx, krxNumber, shortAddr, Toast, PullToRefresh } from "../kit";
import { Consolidate } from "./Consolidate";
import { ConsolidateRow } from "./ConsolidateRow";
import { UpdateBanner } from "./UpdateBanner";

export function Home({ go }: { go: (id: "send" | "receive") => void }) {
  const app = useApp();
  const [toast, setToast] = useState<string | null>(null);
  const [showConsolidate, setShowConsolidate] = useState(false);
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1400);
  };
  const usd = app.usd(krxNumber(app.balanceSompi));

  return (
    <PullToRefresh onRefresh={() => app.refresh(true)} refreshing={app.refreshing}>
      <div className="mx-auto flex max-w-md flex-col gap-4 p-5 pb-28">
        <UpdateBanner />
        <Card className="text-center">
          <div className="text-sm text-keryx-dim">Balance</div>
          <div className="mt-1 text-4xl font-bold text-keryx-ink">
            {formatKrx(app.balanceSompi)} <span className="text-xl text-keryx-dim">KRX</span>
          </div>
          {usd && <div className="mt-1 text-keryx-dim">≈ {usd}</div>}
          {app.price && (
            <div className="mt-2 text-xs text-keryx-dim">
              1 KRX ≈ ${app.price.usd.toPrecision(3)}
              {app.price.changePercent != null && (
                <span className={app.price.changePercent >= 0 ? "text-keryx-green" : "text-keryx-error"}>
                  {" "}
                  {app.price.changePercent >= 0 ? "▲" : "▼"} {Math.abs(app.price.changePercent).toFixed(2)}%
                </span>
              )}
            </div>
          )}
          {app.syncing && (
            <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-keryx-dim">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-keryx-cta" />
              Syncing…
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
            <div className="text-sm text-keryx-dim">Your address</div>
            <button
              className="mt-1 w-full text-left font-mono text-sm text-keryx-ink"
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

        <ConsolidateRow onOpenModal={() => setShowConsolidate(true)} />

        <div className="flex items-center justify-between px-1">
          <div className="text-sm font-semibold text-keryx-text">Recent activity</div>
          <button className="text-xs text-keryx-green" onClick={() => app.refresh(true)}>
            {app.refreshing || app.syncing ? "Updating…" : "Refresh"}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {app.history.length === 0 && (
            <div className="border border-keryx-border rounded bg-keryx-surface px-4 py-6 text-center text-sm text-keryx-dim">
              No transactions yet
            </div>
          )}
          {app.history.slice(0, 5).map((h) => (
            <div key={h.txId} className="border border-keryx-border flex items-center justify-between rounded bg-keryx-surface px-4 py-3">
              <div className="font-mono text-xs text-keryx-dim">{shortAddr("tx:" + h.txId, 6).slice(3)}</div>
              <div className={h.amountSompi >= 0n ? "text-keryx-green" : "text-keryx-ink"}>
                {h.amountSompi >= 0n ? "+" : ""}
                {formatKrx(h.amountSompi)} KRX
              </div>
            </div>
          ))}
        </div>
        <Toast msg={toast} />
      </div>
      {showConsolidate && <Consolidate onClose={() => setShowConsolidate(false)} />}
    </PullToRefresh>
  );
}
