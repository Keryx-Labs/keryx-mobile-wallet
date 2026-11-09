import { useState, type ReactNode } from "react";
import { WalletProvider, useApp } from "./WalletProvider";
import type { SectionId } from "../index";
import { Onboarding } from "./screens/Onboarding";
import { Unlock } from "./screens/Unlock";
import { Home } from "./screens/Home";
import { Send } from "./screens/Send";
import { Receive } from "./screens/Receive";
import { History } from "./screens/History";
import { Ai } from "./screens/Ai";
import { Mining } from "./screens/Mining";
import { Settings } from "./screens/Settings";

function PickaxeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="inline-block"
    >
      <path d="M3.5 9.5C7 5 13 3.5 18 5" />
      <path d="M14.5 20.5C19 17 20.5 11 19 6" />
      <path d="M18.5 5.5L5 19" />
    </svg>
  );
}

const ICON: Record<SectionId, ReactNode> = {
  home: "◈",
  send: "↑",
  receive: "↓",
  history: "≡",
  mining: <PickaxeIcon />,
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

  const sections = (app.runtime?.sections() ?? []).filter((sec) => sec.id !== "mining" || !!app.minerAddress);
  const screen = (() => {
    switch (tab) {
      case "send":
        return <Send onDone={() => setTab("home")} />;
      case "receive":
        return <Receive onBack={() => setTab("home")} />;
      case "history":
        return <History />;
      case "mining":
        return <Mining />;
      case "ai":
        return <Ai />;
      case "settings":
        return <Settings />;
      default:
        return <Home go={(id) => setTab(id)} />;
    }
  })();

  return (
    <div className="min-h-screen bg-keryx-bg text-keryx-text">
      {screen}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-keryx-border bg-keryx-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {sections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => setTab(sec.id)}
              className={`relative flex flex-1 flex-col items-center gap-1 py-3 text-[10px] uppercase tracking-[0.12em] ${
                tab === sec.id ? "text-keryx-bright glow" : "text-keryx-dim"
              }`}
            >
              {tab === sec.id && <span className="absolute inset-x-4 top-0 h-px bg-keryx-bright shadow-cta" />}
              <span className="flex h-[18px] items-center text-lg leading-none">{ICON[sec.id]}</span>
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-keryx-bg p-6 text-center">
      <div className="glow text-2xl font-bold tracking-[0.2em] text-keryx-bright">KERYX</div>
      <div className="label">// wallet</div>
      <div className={error ? "text-keryx-error" : "text-keryx-dim"}>{text}</div>
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
