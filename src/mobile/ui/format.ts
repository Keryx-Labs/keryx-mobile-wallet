// Pure formatting helpers (no React/DOM deps) so they can be unit-tested and reused anywhere.

const SOMPI = 100_000_000n; // 1 KRX = 1e8 sompi

/** Format sompi as a KRX string (up to `dp` decimals, trailing zeros trimmed). */
export function formatKrx(sompi: bigint, dp = 4): string {
  const neg = sompi < 0n;
  const v = neg ? -sompi : sompi;
  const whole = v / SOMPI;
  const frac = v % SOMPI;
  const fracStr = frac.toString().padStart(8, "0").slice(0, dp).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${fracStr ? "." + fracStr : ""}`;
}

export function krxNumber(sompi: bigint): number {
  return Number(sompi) / 1e8;
}

/** Parse a user KRX amount string into sompi (bigint). Throws on invalid input. */
export function krxToSompi(input: string): bigint {
  const t = input.trim();
  if (t === "" || t === "." || !/^\d*(\.\d{0,8})?$/.test(t)) throw new Error("Invalid amount.");
  const [w, f = ""] = t.split(".");
  return BigInt(w || "0") * SOMPI + BigInt((f + "00000000").slice(0, 8));
}

export function shortAddr(a: string, n = 10): string {
  if (!a) return "";
  const [pre, body = ""] = a.split(":");
  return body.length > n * 2 ? `${pre}:${body.slice(0, n)}…${body.slice(-n)}` : a;
}
