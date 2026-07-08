// KRX market price — automatic, single source (NonKYC), no manual selection.
//
// KRX currently trades on one main venue (NonKYC), whose public REST API needs no auth or key:
//   GET https://api.nonkyc.io/api/v2/ticker/KRX_USDT
//   → { last_price, bid, ask, change_percent, base_volume, ... }  (CoinGecko-style ticker)
//
// Design:
//   * On native we call through Capacitor's native HTTP (CapacitorHttp) so the request bypasses
//     WebView CORS and never touches the SDK's fetch. On web we fall back to fetch().
//   * Price is advisory display only — it never gates or influences signing. A failure returns the
//     last cached value (or null) and is non-fatal.
//   * Source is fixed in code (no user-facing picker) per product decision; when KRX lists elsewhere
//     this module is the single place to add a fallback/aggregate.

const TICKER_URL = "https://api.nonkyc.io/api/v2/ticker/KRX_USDT";
const REFRESH_MS = 60_000; // once a minute is plenty for a wallet

export interface KrxPrice {
  usd: number; // last price in USD (USDT ~ USD)
  changePercent: number | null; // 24h change %
  at: number; // epoch ms when fetched
}

export interface RawTicker {
  last_price?: string;
  change_percent?: string;
}

export function parseTicker(raw: RawTicker, at: number): KrxPrice | null {
  const usd = Number(raw.last_price);
  if (!Number.isFinite(usd) || usd <= 0) return null;
  const chg = raw.change_percent != null ? Number(raw.change_percent) : NaN;
  return { usd, changePercent: Number.isFinite(chg) ? chg : null, at };
}

/** Convert a KRX amount (whole KRX, not sompi) to a formatted USD string using a fetched price. */
export function krxToUsd(krx: number, price: KrxPrice | null): string | null {
  if (!price) return null;
  const v = krx * price.usd;
  // Small unit price → show enough precision but cap it.
  return v >= 1 ? `$${v.toFixed(2)}` : `$${v.toPrecision(3)}`;
}

async function fetchRaw(isNative: boolean): Promise<RawTicker> {
  if (isNative) {
    const { CapacitorHttp } = await import("@capacitor/core");
    const res = await CapacitorHttp.get({ url: TICKER_URL, headers: { Accept: "application/json" } });
    return typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  }
  const res = await fetch(TICKER_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`price http ${res.status}`);
  return res.json();
}

export class PriceService {
  private cache: KrxPrice | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(p: KrxPrice | null) => void>();

  constructor(private isNative: boolean) {}

  get current(): KrxPrice | null {
    return this.cache;
  }

  subscribe(fn: (p: KrxPrice | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async refresh(): Promise<KrxPrice | null> {
    try {
      const raw = await fetchRaw(this.isNative);
      const p = parseTicker(raw, Date.now());
      if (p) {
        this.cache = p;
        this.listeners.forEach((l) => l(p));
      }
      return this.cache;
    } catch {
      // Non-fatal: keep the last cached value.
      return this.cache;
    }
  }

  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
// end of price.ts
