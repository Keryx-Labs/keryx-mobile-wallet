// RestGatewayProvider — the DEFAULT network layer. Talks to the Keryx REST Gateway (the public
// indexer/gateway that also backs the official Explorer + Web Wallet). All endpoints and response
// shapes below were verified live against https://keryx-labs.com/api/v1.
//
//   GET  /info                          → { network, last_daa_score, ... }
//   GET  /addresses/:addr/balance       → { address, balance_sompi }
//   GET  /addresses/:addr/utxos         → [ { transaction_id, index, amount_sompi, script_version,
//                                             script_public_key, block_daa_score, is_coinbase } ]
//   GET  /addresses/:addr               → { total_received_sompi, total_tx_count, transactions[] }
//   GET  /transactions/:id              → { inputs[], outputs[], confirmations, is_accepted, ... }
//   GET  /transactions?limit=N          → [ { tx_id, payload_hex, outputs_count, is_coinbase, ... } ]
//   POST /broadcast   (snake_case tx)   → { transaction_id } | { error }
//
// On native we use CapacitorHttp (bypasses WebView CORS, keeps this off the SDK's fetch); on web we
// use fetch(). Amounts are parsed straight into bigint — never through a lossy JS number.

import type {
  ChainProvider,
  NetworkInfo,
  Utxo,
  AddressSummary,
  TxDetail,
  RecentTx,
  InferenceRecord,
  BroadcastResult,
} from "./types";
import { BroadcastTx, stringifyBroadcast } from "./broadcast";

export const DEFAULT_GATEWAY = "https://keryx-labs.com/api/v1";

function toBig(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (typeof v === "string" && v.trim() !== "") return BigInt(v);
  return 0n;
}

async function httpGetJson(url: string, isNative: boolean): Promise<any> {
  if (isNative) {
    const { CapacitorHttp } = await import("@capacitor/core");
    const res = await CapacitorHttp.get({ url, headers: { Accept: "application/json" } });
    if (res.status < 200 || res.status >= 300) throw new Error(`http ${res.status}`);
    return typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  }
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return res.json();
}

async function httpPostText(
  url: string,
  body: string,
  isNative: boolean
): Promise<{ status: number; text: string }> {
  if (isNative) {
    const { CapacitorHttp } = await import("@capacitor/core");
    const res = await CapacitorHttp.post({
      url,
      headers: { "Content-Type": "application/json" },
      data: body,
      // Send our pre-serialized (bigint-safe) string verbatim.
      dataType: "string" as any,
    });
    const text = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    return { status: res.status, text };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  return { status: res.status, text: await res.text() };
}

export class RestGatewayProvider implements ChainProvider {
  readonly kind = "rest" as const;

  constructor(
    private isNative: boolean,
    private base: string = DEFAULT_GATEWAY
  ) {}

  private url(path: string): string {
    return `${this.base}${path}`;
  }

  async getInfo(): Promise<NetworkInfo> {
    const j = await httpGetJson(this.url("/info"), this.isNative);
    return {
      network: String(j.network ?? ""),
      lastDaaScore: toBig(j.last_daa_score),
      syncedHint: true,
    };
  }

  async getBalanceSompi(address: string): Promise<bigint> {
    const j = await httpGetJson(this.url(`/addresses/${encodeURIComponent(address)}/balance`), this.isNative);
    return toBig(j.balance_sompi);
  }

  async getUtxos(address: string): Promise<Utxo[]> {
    const arr = await httpGetJson(this.url(`/addresses/${encodeURIComponent(address)}/utxos`), this.isNative);
    if (!Array.isArray(arr)) return [];
    return arr.map((u: any) => ({
      address: String(u.address ?? address),
      transactionId: String(u.transaction_id),
      index: Number(u.index),
      amountSompi: toBig(u.amount_sompi),
      scriptVersion: Number(u.script_version ?? 0),
      scriptPublicKey: String(u.script_public_key),
      blockDaaScore: toBig(u.block_daa_score),
      isCoinbase: Boolean(u.is_coinbase),
    }));
  }

  async getAddress(address: string): Promise<AddressSummary> {
    const j = await httpGetJson(this.url(`/addresses/${encodeURIComponent(address)}`), this.isNative);
    const txs = Array.isArray(j.transactions) ? j.transactions : [];
    return {
      address: String(j.address ?? address),
      totalReceivedSompi: toBig(j.total_received_sompi),
      totalTxCount: Number(j.total_tx_count ?? txs.length),
      transactions: txs.map((t: any) => ({
        txId: String(t.tx_id),
        amountSompi: toBig(t.amount_sompi),
        isSpend: Boolean(t.is_spend),
        daaScore: toBig(t.daa_score),
        blockHash: String(t.block_hash ?? ""),
      })),
    };
  }

  async getTransaction(txid: string): Promise<TxDetail> {
    const j = await httpGetJson(this.url(`/transactions/${encodeURIComponent(txid)}`), this.isNative);
    const io = (a: any[]): { address: string; amountSompi: bigint; index: number }[] =>
      (Array.isArray(a) ? a : []).map((x: any, i: number) => ({
        address: String(x.address ?? ""),
        amountSompi: toBig(x.amount_sompi),
        index: Number(x.output_index ?? x.input_index ?? i),
      }));
    return {
      txId: String(j.tx_id ?? txid),
      blockHash: String(j.block_hash ?? ""),
      confirmations: Number(j.confirmations ?? 0),
      isAccepted: Boolean(j.is_accepted),
      isCoinbase: Boolean(j.is_coinbase),
      inputs: io(j.inputs),
      outputs: io(j.outputs),
      totalOutSompi: toBig(j.total_out_sompi),
      timestampMs: j.block?.timestamp_ms != null ? Number(j.block.timestamp_ms) : undefined,
    };
  }

  async listRecentTransactions(limit: number): Promise<RecentTx[]> {
    const arr = await httpGetJson(this.url(`/transactions?limit=${Math.max(1, limit)}`), this.isNative);
    if (!Array.isArray(arr)) return [];
    return arr.map((t: any) => ({
      txId: String(t.tx_id ?? ""),
      payloadHex: String(t.payload_hex ?? ""),
      outputsCount: Number(t.outputs_count ?? 0),
      isCoinbase: String(t.is_coinbase).toLowerCase() === "true",
    }));
  }

  async listInferences(limit: number): Promise<InferenceRecord[]> {
    const arr = await httpGetJson(this.url(`/infer?limit=${Math.max(1, limit)}&offset=0`), this.isNative);
    if (!Array.isArray(arr)) return [];
    return arr.map((r: any) => ({
      txId: String(r.tx_id ?? ""),
      model: String(r.model ?? ""),
      prompt: String(r.prompt ?? ""),
      maxTokens: Number(r.max_tokens ?? 0),
      inferenceRewardSompi: toBig(r.inference_reward),
      priorityFeeSompi: toBig(r.priority_fee),
      resultCid: r.result ? String(r.result) : null,
      resultText: r.result_text != null ? String(r.result_text) : null,
      resultDaaScore: toBig(r.result_daa_score),
    }));
  }

  async broadcast(tx: BroadcastTx): Promise<BroadcastResult> {
    const body = stringifyBroadcast(tx); // bigint-safe
    const { status, text } = await httpPostText(this.url("/broadcast"), body, this.isNative);
    if (status >= 200 && status < 300) {
      let id: string | undefined;
      try {
        const j = JSON.parse(text);
        id = j.transaction_id ?? j.tx_id ?? j.id;
      } catch {
        id = text.trim() || undefined;
      }
      return { ok: true, transactionId: id };
    }
    let error = `broadcast failed (http ${status})`;
    try {
      error = JSON.parse(text).error ?? error;
    } catch {
      if (text) error = text.slice(0, 200);
    }
    // eslint-disable-next-line no-console
    console.warn("[AI_BROADCAST_REJECT]", status, text.slice(0, 400));
    return { ok: false, error };
  }
}
// end of restGateway.ts
