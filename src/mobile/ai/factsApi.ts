// Gateway reads behind the Keryx facts block (same shapes as the explorer API).

import { DEFAULT_GATEWAY, httpGetJson } from "../chain/restGateway";
import type { AiProviders as WalletAiProviders } from "../chain";

export interface NetworkInfo {
  network: string;
  last_daa_score: number;
  total_blocks: number;
  total_txs: number;
  hashrate_hps: number;
  total_supply_krx: number;
  circulating_supply_krx?: number;
  block_reward_krx: number;
  max_supply_krx: number;
  mined_pct: number;
  burned_krx: number;
  total_escrow_krx: number;
  total_real_inferences: number;
}

export interface MarketData {
  price_usd: number;
  market_cap_usd: number;
  volume_24h_usd: number;
  change_24h_pct: number;
}

export interface ServiceProvider {
  tier: number;
  model_id: string;
  escrow_pubkey: string;
}

export interface AiProviders {
  cohort: ServiceProvider[];
  window: ServiceProvider[];
}

export interface FactsApi {
  info(): Promise<NetworkInfo>;
  market(): Promise<MarketData>;
  balance(address: string): Promise<{ balance_sompi: number }>;
  inferencesServed(address: string): Promise<{ served: number; answered?: number }>;
  transaction(hash: string): Promise<unknown>;
  block(hash: string): Promise<{ timestamp_ms: number; parents?: unknown[] }>;
}

export const formatHashrate = (hps: number): string => {
  if (hps <= 0) return "0 H/s";
  const units = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s"];
  let i = 0;
  let v = hps;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v.toFixed(2)} ${units[i]}`;
};

/** FactsApi over the wallet's gateway. */
export function gatewayFactsApi(isNative: boolean, base: string = DEFAULT_GATEWAY): FactsApi {
  const get = (path: string) => httpGetJson(`${base}${path}`, isNative);
  const enc = encodeURIComponent;
  return {
    info: () => get("/info"),
    market: () => get("/market"),
    balance: (a) => get(`/addresses/${enc(a)}/balance`),
    inferencesServed: (a) => get(`/addresses/${enc(a)}/inferences-served`),
    transaction: (h) => get(`/transactions/${enc(h)}`),
    block: (h) => get(`/blocks/${enc(h)}`),
  };
}

/** The wallet's provider list in the explorer's shape. */
export function toFactsProviders(p: WalletAiProviders | null): AiProviders | null {
  if (!p) return null;
  const map = (l: WalletAiProviders["cohort"]) => l.map((x) => ({ tier: x.tier, model_id: x.modelId, escrow_pubkey: x.escrowPubkey }));
  return { cohort: map(p.cohort), window: map(p.window) };
}
