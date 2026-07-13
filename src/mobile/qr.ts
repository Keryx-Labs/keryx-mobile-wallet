// QR scanning for the Send screen. Uses the native camera (MLKit) to read a QR, then parses a raw
// Keryx address or a `keryx:<addr>?amount=…` payment URI. Scanning NEVER sends — it only returns the
// parsed target; the caller validates it and fills the recipient field, and the normal confirm flow
// (password / biometric) still applies. Native-only; the plugin is dynamically imported.

export interface ScannedTarget {
  address: string;
  amountKrx?: string;
}

/**
 * Parse a scanned string into a Keryx target. Accepts a bare address ("keryx:q…") or a payment URI
 * ("keryx:q…?amount=1.5"). Pure + testable; validation of the address itself is done by the caller.
 */
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
  // Normalize an uppercase scheme (KERYX:...) to lowercase scheme only; leave the payload untouched.
  if (/^keryx:/i.test(s)) s = "keryx:" + s.slice(6);
  return { address: s, amountKrx };
}

/**
 * Open the native camera and scan one QR. Returns the raw string, or null if the user cancelled.
 * Throws a friendly error if scanning is unavailable or camera permission is denied.
 */
export async function scanQrCode(isNative: boolean): Promise<string | null> {
  if (!isNative) throw new Error("QR scanning is only available on a device.");
  const mod = await import("@capacitor-mlkit/barcode-scanning");
  const { BarcodeScanner, BarcodeFormat } = mod;
  const supported = await BarcodeScanner.isSupported().catch(() => ({ supported: false } as any));
  if (!(supported as any).supported) throw new Error("QR scanning isn't available on this device.");

  const perm = await BarcodeScanner.requestPermissions();
  if (perm.camera !== "granted" && perm.camera !== "limited") {
    throw new Error("Camera access is needed to scan. Enable it in Settings, then try again.");
  }
  const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
  return barcodes[0]?.rawValue ?? null;
}
