import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Button } from "../kit";
import { ensureCameraPermission } from "../../qr";
import { useApp } from "../WalletProvider";

// In-app QR scanner: WebView camera preview + jsQR decode loop. Pure JS (no native scanner lib). On a
// successful decode it calls onResult(rawText) once and stops the camera. It NEVER sends — the caller
// validates the result and fills the recipient field; the normal confirm flow still applies.
export function QrScanner({
  onResult,
  onClose,
}: {
  onResult: (raw: string) => void;
  onClose: () => void;
}) {
  const app = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const [err, setErr] = useState<string | null>(null);

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c || doneRef.current) return;
      if (v.readyState >= 2 && v.videoWidth > 0) {
        const w = v.videoWidth;
        const h = v.videoHeight;
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(v, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const res = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
          if (res && res.data) {
            doneRef.current = true;
            stop();
            onResult(res.data);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        const ok = await ensureCameraPermission(app.runtime?.native ?? false);
        if (!ok) {
          setErr("Camera access is needed to scan. Enable it in Settings, then try again.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
        setErr(
          /denied|NotAllowed/i.test(m)
            ? "Camera permission was denied. Enable it in your phone's Settings, then try again."
            : "Couldn't open the camera."
        );
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-60 w-60 rounded-3xl border-2 border-emerald-400/80" />
      </div>
      <div className="absolute inset-x-0 top-0 p-6 text-center text-sm text-white/90">
        Scan a Keryx address QR code
      </div>
      {err && (
        <div className="absolute inset-x-6 top-1/3 rounded-2xl bg-red-500/20 p-3 text-center text-sm text-red-100">
          {err}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 p-6">
        <Button
          variant="ghost"
          onClick={() => {
            stop();
            onClose();
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
