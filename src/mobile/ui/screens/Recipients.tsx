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
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-slate-900 p-5 sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-semibold text-slate-100">Recipients</div>
          <button className="text-sm text-slate-400" onClick={onClose}>
            Close
          </button>
        </div>

        {editing && (
          <div className="mb-4 rounded-2xl bg-slate-800 p-3">
            <div className="mb-1 truncate font-mono text-xs text-slate-500">{shortAddr(editing, 14)}</div>
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (e.g. NonKYC exchange, Valera)"
              className="mb-2 w-full rounded-xl bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none"
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
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Saved</div>
            <div className="flex flex-col gap-2">
              {contacts.map((c) => (
                <div key={c.address} className="flex items-center gap-2 rounded-2xl bg-slate-800 px-4 py-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => onSelect(c.address)}>
                    <div className="truncate text-sm font-medium text-emerald-400">{c.label}</div>
                    <div className="truncate font-mono text-xs text-slate-500">{shortAddr(c.address, 12)}</div>
                  </button>
                  <button className="text-xs text-slate-400" onClick={() => startSave(c.address, c)}>
                    Edit
                  </button>
                  <button
                    className="text-xs text-red-300"
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
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent</div>
            <div className="flex flex-col gap-2">
              {recents.map((r) => (
                <div key={r.address} className="flex items-center gap-2 rounded-2xl bg-slate-800 px-4 py-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => onSelect(r.address)}>
                    <div className="truncate font-mono text-sm text-slate-200">{shortAddr(r.address, 12)}</div>
                  </button>
                  <button className="text-xs text-emerald-400" onClick={() => startSave(r.address)}>
                    Save
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {contacts.length === 0 && recents.length === 0 && (
          <div className="rounded-2xl bg-slate-800/60 px-4 py-8 text-center text-sm text-slate-500">
            No saved or recent recipients yet.
          </div>
        )}
      </div>
    </div>
  );
}
