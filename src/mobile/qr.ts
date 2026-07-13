// QR scanning for Send — pure-JS decode (jsQR) over the WebView camera. No native scanner library
// (keeps the APK small and avoids the 16 KB page-alignment issue MLKit's .so files caused). The
// actual camera preview + decode loop lives in the QrScanner React component; here we keep the pure,
// testable parser and the camera-permission helper. Scanning NEVER sends — it only returns a target.

export interface ScannedTarget {
  address: string;
  amountKrx?: string;
}

/** Parse a scanned string into a Keryx target: bare address or `keryx:<addr>?amount=…`. Pure/testable. */
export function parseKeryxTarget(raw: string): ScannedTarget {
  let s = (raw || "").trim();
  let amountKrx: string | undefined;
  const q = s.indexOf("?");
  if (q >= 0) {
    const query = s.slice(q + 1);
    s = s.slice(0, q);
    try {
      const a = new URLSearchParams(query).get("amount");
      if (a && /^\d*\.?\d*$/.test(a)) amountKrx = a;
    } catch {
      /* ignore malformed query */
    }
  }
  if (/^keryx:/i.test(s)) s = "keryx:" + s.slice(6);
  return { address: s, amountKrx };
}

/** Request camera permission (native runtime prompt) before opening getUserMedia. */
export async function ensureCameraPermission(isNative: boolean): Promise<boolean> {
  if (!isNative) return true; // web: getUserMedia prompts on its own
  try {
    const { Camera } = await import("@capacitor/camera");
    const cur = await Camera.checkPermissions();
    if (cur.camera === "granted" || cur.camera === "limited") return true;
    const req = await Camera.requestPermissions({ permissions: ["camera"] });
    return req.camera === "granted" || req.camera === "limited";
  } catch {
    return true; // fall through to the getUserMedia prompt
  }
}
