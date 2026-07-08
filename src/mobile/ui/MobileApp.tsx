import { useState } from "react";
import { WalletProvider, useApp } from "./WalletProvider";
import type { SectionId } from "../index";
import { Onboarding } from "./screens/Onboarding";
import { Unlock } from "./screens/Unlock";
import { Home } from "./screens/Home";
import { Send } from "./screens/Send";
import { Receive } from "./screens/Receive";
import { History } from "./screens/History";
import { Ai } from "./screens/Ai";
import { Settings } from "./screens/Settings";

const ICON: Record<SectionId, string> = {
  home: "◈",
  send: "↑",
  receive: "↓",
  history: "≡",
  ai: "✦",
  settings: "⚙",
};

function Shell() {
  const app = useApp();
  const [tab, setTab] = useState<SectionId>("home");

  if (app.phase === "boot")
    return <Splash text="Loading wallet…" />;
  if (app.phase === "error")
    return <Splash text={app.error ?? "Something went wrong."} error />;
  if (app.phase === "onboarding") return <Onboarding />;
  if (app.phase === "locked") return <Unlock />;

  const sections = app.runtime?.sections() ?? [];
  const screen = (() => {
    switch (tab) {
      case "send":
        return <Send onDone={() => setTab("home")} />;
      case "receive":
        return <Receive onBack={() => setTab("home")} />;
      case "history":
        return <History />;
      case "ai":
        return <Ai />;
      case "settings":
        return <Settings />;
      default:
        return <Home go={(id) => setTab(id)} />;
    }
  })();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {screen}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {sections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => setTab(sec.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-3 text-xs ${
                tab === sec.id ? "text-emerald-400" : "text-slate-500"
              }`}
            >
              <span className="text-lg leading-none">{ICON[sec.id]}</span>
              {sec.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function Splash({ text, error }: { text: string; error?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center">
      <div className="text-2xl font-bold text-emerald-400">Keryx Wallet</div>
      <div className={error ? "text-red-300" : "text-slate-400"}>{text}</div>
    </div>
  );
}

export function MobileApp() {
  return (
    <WalletProvider>
      <Shell />
    </WalletProvider>
  );
}
