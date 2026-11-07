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
          <button onClick={onBack} aria-label="Back" className="text-xl text-keryx-dim">←</button>
        )}
        <div className="glow text-lg font-semibold text-keryx-bright">Receive KRX</div>
      </div>
      {addr ? (
        <Card className="flex w-full flex-col items-center gap-4">
          <Qr value={addr} />
          <div className="break-all text-center font-mono text-sm text-keryx-ink">{addr}</div>
          <Button
            onClick={() => {
              copy(addr);
              setToast("Address copied");
              setTimeout(() => setToast(null), 1400);
            }}
          >
            Copy address
          </Button>
          <p className="text-center text-xs text-keryx-dim">
            Only send KRX (Keryx main chain) to this address.
          </p>
        </Card>
      ) : (
        <div className="text-keryx-dim">No address available.</div>
      )}
      <Toast msg={toast} />
    </div>
  );
}
