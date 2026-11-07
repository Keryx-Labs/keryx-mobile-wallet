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
    "w-full rounded-sm border px-4 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] transition-all active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100";
  const styles = {
    primary: "border-keryx-cta bg-keryx-cta text-keryx-onCta active:bg-[#21f04f] active:shadow-cta",
    ghost: "border-keryx-border bg-keryx-green/[0.03] text-keryx-text active:border-keryx-green active:text-keryx-green",
    danger: "border-keryx-error/60 bg-keryx-error/10 text-keryx-error active:bg-keryx-error/20",
  }[variant];
  return <button className={`${base} ${styles} ${className}`} {...p} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
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
      <span className="label">{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className={`input py-3 ${props.mono ? "text-sm" : "text-base"}`}
      />
    </label>
  );
}

export function Qr({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: "#04120a", light: "#b9f0c5" } })
      .then((d) => alive && setSrc(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value, size]);
  return src ? (
    <img src={src} width={size} height={size} alt="QR" className="rounded" />
  ) : (
    <div style={{ width: size, height: size }} className="border border-keryx-border rounded bg-keryx-green/[0.03]" />
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
        className="flex items-center justify-center overflow-hidden text-xs text-keryx-dim transition-[height] duration-150"
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
    <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-sm border border-keryx-green bg-keryx-surface px-4 py-2 text-xs font-semibold uppercase tracking-label text-keryx-green shadow-cta">
      {msg}
    </div>
  );
}
