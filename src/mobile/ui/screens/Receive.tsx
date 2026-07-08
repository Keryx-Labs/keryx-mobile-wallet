import { useState } from "react";
import { useApp } from "../WalletProvider";
import { Button, Card, Qr, copy, Toast } from "../kit";

export function Receive({ onBack }: { onBack?: () => void }) {
  const app = useApp();
  const [toast, setToast] = useState<string | null>(null);
  const addr = app.receiveAddress;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-5 pb-28">
      <div className="flex w-full items-center gap-3">
        {onBack && (
          <button onClick={onBack} aria-label="Back" className="text-xl text-slate-400">←</button>
        )}
        <div className="text-lg font-semibold text-slate-100">Receive KRX</div>
      </div>
      {addr ? (
        <Card className="flex w-full flex-col items-center gap-4">
          <Qr value={addr} />
          <div className="break-all text-center font-mono text-sm text-slate-200">{addr}</div>
          <Button
            onClick={() => {
              copy(addr);
              setToast("Address copied");
              setTimeout(() => setToast(null), 1400);
            }}
          >
            Copy address
          </Button>
          <p className="text-center text-xs text-slate-500">
            Only send KRX (Keryx main chain) to this address.
          </p>
        </Card>
      ) : (
        <div className="text-slate-500">No address available.</div>
      )}
      <Toast msg={toast} />
    </div>
  );
}
