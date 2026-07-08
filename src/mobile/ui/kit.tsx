// Small presentational kit + helpers for the mobile screens. Framework-light, Tailwind-styled.

import { useEffect, useState, useRef, ReactNode, ButtonHTMLAttributes } from "react";
import QRCode from "qrcode";

export { formatKrx, krxNumber, krxToSompi, shortAddr } from "./format";

export async function copy(text: string): Promise<void> {
  try {
    const { Clipboard } = await import("@capacitor/clipboard");
    await Clipboard.write({ string: text });
    return;
  } catch {
    /* fall through */
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

export function Button({
  variant = "primary",
  className = "",
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const base =
    "w-full rounded-2xl px-4 py-3.5 font-semibold text-base transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100";
  const styles = {
    primary: "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
    ghost: "bg-slate-800 text-slate-100 hover:bg-slate-700",
    danger: "bg-red-500/90 text-white hover:bg-red-500",
  }[variant];
  return <button className={`${base} ${styles} ${className}`} {...p} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-slate-900/70 p-5 ${className}`}>{children}</div>;
}

export function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-slate-400">{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className={`w-full rounded-2xl bg-slate-800 px-4 py-3 text-slate-100 outline-none ring-emerald-500/60 focus:ring-2 ${
          props.mono ? "font-mono text-sm" : ""
        }`}
      />
    </label>
  );
}

export function Qr({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: "#0b1220", light: "#e2e8f0" } })
      .then((d) => alive && setSrc(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value, size]);
  return src ? (
    <img src={src} width={size} height={size} alt="QR" className="rounded-2xl" />
  ) : (
    <div style={{ width: size, height: size }} className="rounded-2xl bg-slate-800" />
  );
}

/** Simple pull-to-refresh wrapper (document-scroll based). Triggers onRefresh when pulled past ~50px. */
export function PullToRefresh({
  onRefresh,
  refreshing,
  children,
}: {
  onRefresh: () => void;
  refreshing?: boolean;
  children: ReactNode;
}) {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  return (
    <div
      onTouchStart={(e) => {
        startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
      }}
      onTouchMove={(e) => {
        if (startY.current === null) return;
        const dy = e.touches[0].clientY - startY.current;
        if (dy > 0) setPull(Math.min(dy * 0.5, 70));
      }}
      onTouchEnd={() => {
        if (pull > 50 && !refreshing) onRefresh();
        setPull(0);
        startY.current = null;
      }}
    >
      <div
        style={{ height: refreshing ? 32 : pull }}
        className="flex items-center justify-center overflow-hidden text-xs text-slate-400 transition-[height] duration-150"
      >
        {refreshing ? "Refreshing…" : pull > 50 ? "Release to refresh" : pull > 0 ? "Pull to refresh" : ""}
      </div>
      {children}
    </div>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 shadow-lg">
      {msg}
    </div>
  );
}
