import { useState } from "react";
import { useApp } from "../WalletProvider";
import { Button, shortAddr } from "../kit";
import { loadBook, saveContact, removeContact, type Contact } from "../../addressBook";

// Recipient picker + manager: saved contacts (with labels) and recent recipients. Local-only.
// Tapping a row selects it (fills the Send field). Never sends anything itself.
export function Recipients({
  onSelect,
  onClose,
}: {
  onSelect: (address: string) => void;
  onClose: () => void;
}) {
  const app = useApp();
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);
  void tick;
  const { contacts, recents } = loadBook(app.receiveAddress);

  const [editing, setEditing] = useState<string | null>(null); // address being labeled
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [newAddr, setNewAddr] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const commitAdd = () => {
    const addr = newAddr.trim();
    if (!app.wallet?.validateAddress(addr)) {
      setErr("That isn't a valid Keryx address.");
      return;
    }
    saveContact(app.receiveAddress, addr, label);
    setAdding(false);
    setNewAddr("");
    setLabel("");
    setErr(null);
    reload();
  };

  const startSave = (address: string, existing?: Contact) => {
    setEditing(address);
    setLabel(existing?.label ?? "");
  };
  const commitSave = () => {
    if (editing) {
      saveContact(app.receiveAddress, editing, label);
      setEditing(null);
      setLabel("");
      reload();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
      <div className="border border-keryx-border max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t bg-keryx-surface p-5 sm:rounded">
        <div className="mb-3 flex items-center justify-between">
          <div className="glow text-lg font-semibold text-keryx-bright">Recipients</div>
          <button className="text-sm text-keryx-dim" onClick={onClose}>
            Close
          </button>
        </div>

        {!adding && !editing && (
          <button
            onClick={() => {
              setAdding(true);
              setNewAddr("");
              setLabel("");
              setErr(null);
            }}
            className="border border-keryx-border mb-4 flex w-full items-center justify-center gap-2 rounded bg-keryx-green/[0.03] py-2.5 text-sm text-keryx-green hover:border-keryx-borderHi"
          >
            <span className="text-base leading-none">+</span> Add recipient
          </button>
        )}

        {adding && (
          <div className="border border-keryx-border mb-4 rounded bg-keryx-green/[0.03] p-3">
            <input
              autoFocus
              value={newAddr}
              onChange={(e) => setNewAddr(e.target.value)}
              placeholder="keryx:\u2026 wallet address"
              className="mb-2 w-full rounded-sm bg-keryx-border px-3 py-2 font-mono text-sm text-keryx-ink outline-none"
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Name (e.g. Valera, NonKYC exchange)"
              className="mb-2 w-full rounded-sm bg-keryx-border px-3 py-2 text-sm text-keryx-ink outline-none"
            />
            {err && <div className="mb-2 text-xs text-keryx-error">{err}</div>}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button className="flex-1" disabled={!newAddr.trim() || !label.trim()} onClick={commitAdd}>
                Save
              </Button>
            </div>
          </div>
        )}

        {editing && (
          <div className="border border-keryx-border mb-4 rounded bg-keryx-green/[0.03] p-3">
            <div className="mb-1 truncate font-mono text-xs text-keryx-dim">{shortAddr(editing, 14)}</div>
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (e.g. NonKYC exchange, Valera)"
              className="mb-2 w-full rounded-sm bg-keryx-border px-3 py-2 text-sm text-keryx-ink outline-none"
            />
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={commitSave} disabled={!label.trim()}>
                Save
              </Button>
            </div>
          </div>
        )}

        {contacts.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-keryx-dim">Saved</div>
            <div className="flex flex-col gap-2">
              {contacts.map((c) => (
                <div key={c.address} className="border border-keryx-border flex items-center gap-2 rounded bg-keryx-green/[0.03] px-4 py-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => onSelect(c.address)}>
                    <div className="truncate text-sm font-medium text-keryx-green">{c.label}</div>
                    <div className="truncate font-mono text-xs text-keryx-dim">{shortAddr(c.address, 12)}</div>
                  </button>
                  <button className="text-xs text-keryx-dim" onClick={() => startSave(c.address, c)}>
                    Edit
                  </button>
                  <button
                    className="text-xs text-keryx-error"
                    onClick={() => {
                      removeContact(app.receiveAddress, c.address);
                      reload();
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {recents.length > 0 && (
          <div className="mb-2">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-keryx-dim">Recent</div>
            <div className="flex flex-col gap-2">
              {recents.map((r) => (
                <div key={r.address} className="border border-keryx-border flex items-center gap-2 rounded bg-keryx-green/[0.03] px-4 py-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => onSelect(r.address)}>
                    <div className="truncate font-mono text-sm text-keryx-ink">{shortAddr(r.address, 12)}</div>
                  </button>
                  <button className="text-xs text-keryx-green" onClick={() => startSave(r.address)}>
                    Save
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {contacts.length === 0 && recents.length === 0 && (
          <div className="border border-keryx-border rounded bg-keryx-green/[0.03] px-4 py-8 text-center text-sm text-keryx-dim">
            No saved or recent recipients yet.
          </div>
        )}
      </div>
    </div>
  );
}
