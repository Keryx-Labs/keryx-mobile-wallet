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

export async function httpGetJson(url: string, isNative: boolean): Promise<any> {
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
      blockRewardSompi:
        j.block_reward_krx != null ? BigInt(Math.round(Number(j.block_reward_krx) * 1e8)) : undefined,
      syncedHint: true,
    };
  }

  async getAiProviders(): Promise<import("./types").AiProviders> {
    const j = await httpGetJson(this.url("/ai/providers"), this.isNative);
    const list = (arr: any): import("./types").AiProvider[] =>
      (Array.isArray(arr) ? arr : [])
        .filter((p: any) => typeof p?.escrow_pubkey === "string" && /^[0-9a-f]{64}$/i.test(p.escrow_pubkey))
        .map((p: any) => ({
          escrowPubkey: String(p.escrow_pubkey).toLowerCase(),
          modelId: String(p.model_id ?? "").toLowerCase(),
          tier: Number(p.tier ?? -1),
        }));
    return { virtualDaaScore: toBig(j.virtual_daa_score), cohort: list(j.cohort), window: list(j.window) };
  }

  async getInferenceResult(txid: string): Promise<import("./types").InferenceResult> {
    const j = await httpGetJson(this.url(`/inference/${encodeURIComponent(txid)}`), this.isNative);
    const list = Array.isArray(j.sealed_responses) ? j.sealed_responses : [];
    return {
      txId: String(j.tx_id ?? txid),
      sealed: Boolean(j.sealed),
      sealedRecipients: j.sealed_recipients != null ? Number(j.sealed_recipients) : null,
      sealedResponses: list
        .filter((r: any) => typeof r?.responder_pubkey === "string" && typeof r?.body === "string")
        .map((r: any) => ({
          responderPubkey: String(r.responder_pubkey).toLowerCase(),
          bodyHex: String(r.body),
          daaScore: toBig(r.daa_score),
        })),
      resultCid: j.result_cid ? String(j.result_cid) : null,
      resultText: j.result_text != null ? String(j.result_text) : null,
    };
  }

  async getHolderReward(address: string): Promise<import("./types").HolderRewardStatus> {
    const j = await httpGetJson(this.url(`/addresses/${encodeURIComponent(address)}/holder-reward`), this.isNative);
    const inc = j.income;
    return {
      address: String(j.address ?? address),
      isMiner: Boolean(j.is_miner),
      balanceSompi: toBig(j.balance_sompi),
      production24hSompi: toBig(j.production_24h_sompi),
      ratio: Number(j.ratio ?? 0),
      bracketBps: Number(j.bracket_bps ?? 0),
      fullBracketRatio: Number(j.full_bracket_ratio ?? 120),
      fullBracketBalanceSompi: toBig(j.full_bracket_balance_sompi),
      next: j.next_bracket
        ? {
            bps: Number(j.next_bracket.bps),
            needSompi: toBig(j.next_bracket.need_sompi),
            targetBalanceSompi: toBig(j.next_bracket.target_balance_sompi),
          }
        : null,
      income: inc
        ? {
            baseSompi: toBig(inc.base_sompi),
            paidSompi: toBig(inc.paid_sompi),
            burnedSompi: toBig(inc.burned_sompi),
            escrowSompi: toBig(inc.escrow_sompi),
            inferenceSompi: toBig(inc.inference_sompi),
            chainBlocks: Number(inc.chain_blocks ?? 0),
            windowDaa: Number(inc.income_window_daa ?? 0),
            tierBaseSompi: (Array.isArray(inc.tier_base_sompi) ? inc.tier_base_sompi : []).map(toBig),
          }
        : null,
    };
  }

  async getServiceStanding(address: string): Promise<import("./types").ServiceStanding> {
    const j = await httpGetJson(this.url(`/addresses/${encodeURIComponent(address)}/service-strikes`), this.isNative);
    const burns = Array.isArray(j.pending_burns) ? j.pending_burns : [];
    return {
      consecutiveMisses: Number(j.consecutive_misses ?? 0),
      lifetimeStrikes: Number(j.lifetime_strikes ?? 0),
      lastStrikeDaaScore: j.last_strike_daa_score != null ? toBig(j.last_strike_daa_score) : null,
      suspendedUntilDaaScore: j.suspended_until_daa_score != null ? toBig(j.suspended_until_daa_score) : null,
      virtualDaaScore: toBig(j.virtual_daa_score),
      pendingBurnCount: burns.length,
      pendingBurnSompi: burns.reduce((n: bigint, b: any) => n + toBig(b.burned_sompi), 0n),
    };
  }

  async getInferencesServed(address: string): Promise<{ served: number; answered: number }> {
    const j = await httpGetJson(this.url(`/addresses/${encodeURIComponent(address)}/inferences-served`), this.isNative);
    return { served: Number(j.served ?? 0), answered: Number(j.answered ?? j.served ?? 0) };
  }

  async getRichTransaction(txid: string): Promise<import("./types").RichTx> {
    const j = await httpGetJson(this.url(`/transactions/${encodeURIComponent(txid)}`), this.isNative);
    const outs = Array.isArray(j.outputs) ? j.outputs : [];
    const ins = Array.isArray(j.inputs) ? j.inputs : [];
    return {
      txId: String(j.tx_id ?? txid),
      isAccepted: Boolean(j.is_accepted),
      blockDaaScore: toBig(j.block?.daa_score ?? j.accepting_daa_score ?? 0),
      timestampMs: Number(j.block?.timestamp_ms ?? 0),
      payloadHex: String(j.payload_hex ?? ""),
      outputs: outs.map((o: any, i: number) => ({
        index: Number(o.output_index ?? i),
        address: String(o.address ?? ""),
        amountSompi: toBig(o.amount_sompi),
      })),
      inputs: [...ins]
        .sort((a: any, b: any) => Number(a.input_index ?? 0) - Number(b.input_index ?? 0))
        .map((x: any) => ({
          prevTxId: String(x.prev_tx_id ?? ""),
          prevIndex: Number(x.prev_output_index ?? 0),
          address: String(x.address ?? ""),
        })),
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
