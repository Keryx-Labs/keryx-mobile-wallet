// wRPC (Borsh over wss://) client for a single Keryx node. Only public data crosses it: addresses,
// UTXO queries and already-signed transactions.

import * as kaspa from "../../sdk/kaspa.js";
import type { BroadcastTx } from "./broadcast";
import type { BroadcastResult, Utxo } from "./types";
import type { ProbeResult } from "../nodes";

const CONNECT_TIMEOUT_MS = 8000;
const CALL_TIMEOUT_MS = 10000;

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.finally(() => timer && clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what}: timed out after ${ms} ms`)), ms);
    }),
  ]);
}

function toHex(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Uint8Array) return Array.from(v, (b) => b.toString(16).padStart(2, "0")).join("");
  return String(v ?? "");
}

/** Rebuilds the SDK transaction from the gateway broadcast body (inverse of `buildBroadcastBody`). */
export function toSdkTransaction(b: BroadcastTx): kaspa.Transaction {
  return new kaspa.Transaction({
    version: b.version,
    inputs: b.inputs.map((i) => ({
      previousOutpoint: { transactionId: i.transaction_id, index: i.index },
      signatureScript: i.signature_script,
      sequence: BigInt(i.sequence),
      sigOpCount: i.sig_op_count,
    })),
    outputs: b.outputs.map((o) => ({
      value: BigInt(o.amount),
      scriptPublicKey: new kaspa.ScriptPublicKey(o.script_version, o.script_public_key),
    })),
    lockTime: BigInt(b.lock_time),
    subnetworkId: b.subnetwork_id,
    gas: BigInt(b.gas),
    payload: b.payload,
  } as never);
}

/** Maps a node UTXO entry (wRPC `getUtxosByAddresses`) to the wallet's `Utxo`. */
export function fromNodeEntry(r: any, fallbackAddress: string): Utxo {
  const op = r.outpoint ?? {};
  const spk = r.scriptPublicKey ?? {};
  return {
    address: r.address?.toString?.() ?? fallbackAddress,
    transactionId: toHex(op.transactionId ?? op.getId?.()),
    index: Number(op.index ?? 0),
    amountSompi: BigInt(r.amount),
    scriptVersion: Number(spk.version ?? 0),
    scriptPublicKey: toHex(spk.script),
    blockDaaScore: BigInt(r.blockDaaScore ?? 0),
    isCoinbase: Boolean(r.isCoinbase),
  };
}

export class NodeRpc {
  private client: kaspa.RpcClient | null = null;
  private connecting: Promise<kaspa.RpcClient> | null = null;

  constructor(
    readonly url: string,
    readonly networkId: string
  ) {}

  private async rpc(): Promise<kaspa.RpcClient> {
    if (this.client) return this.client;
    if (!this.connecting) {
      this.connecting = (async () => {
        const client = new kaspa.RpcClient({ url: this.url, encoding: kaspa.Encoding.Borsh, networkId: this.networkId });
        try {
          await withTimeout(
            client.connect({ strategy: kaspa.ConnectStrategy.Fallback, timeoutDuration: CONNECT_TIMEOUT_MS } as never),
            CONNECT_TIMEOUT_MS + 2000,
            "connect"
          );
        } catch (e) {
          void client.disconnect().catch(() => {});
          throw e;
        }
        this.client = client;
        return client;
      })().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  /** Runs one call; a failed call drops the connection so the next one reconnects. */
  private async call<T>(what: string, f: (c: kaspa.RpcClient) => Promise<T>): Promise<T> {
    const c = await this.rpc();
    try {
      return await withTimeout(f(c), CALL_TIMEOUT_MS, what);
    } catch (e) {
      this.close();
      throw e;
    }
  }

  async probe(): Promise<ProbeResult> {
    try {
      const info: any = await this.call("getServerInfo", (c) => c.getServerInfo());
      return { ok: true, synced: Boolean(info.isSynced), utxoIndex: Boolean(info.hasUtxoIndex), networkId: info.networkId };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async virtualDaaScore(): Promise<bigint> {
    const info: any = await this.call("getServerInfo", (c) => c.getServerInfo());
    return BigInt(info.virtualDaaScore);
  }

  async getUtxos(address: string): Promise<Utxo[]> {
    const res: any = await this.call("getUtxosByAddresses", (c) => c.getUtxosByAddresses([address]));
    return (res?.entries ?? []).map((r: any) => fromNodeEntry(r, address));
  }

  async getUtxosMany(addresses: string[]): Promise<Utxo[]> {
    if (addresses.length === 0) return [];
    const res: any = await this.call("getUtxosByAddresses", (c) => c.getUtxosByAddresses(addresses));
    return (res?.entries ?? []).map((r: any) => fromNodeEntry(r, ""));
  }

  async getBalanceSompi(address: string): Promise<bigint> {
    const res: any = await this.call("getBalanceByAddress", (c) => c.getBalanceByAddress({ address } as never));
    return BigInt(res?.balance ?? 0);
  }

  /** Throws only when the node is unreachable; a rejection by the node comes back as `ok: false`. */
  async submit(body: BroadcastTx): Promise<BroadcastResult> {
    const transaction = toSdkTransaction(body);
    const c = await this.rpc();
    try {
      const res: any = await withTimeout(
        c.submitTransaction({ transaction, allowOrphan: false } as never),
        CALL_TIMEOUT_MS,
        "submitTransaction"
      );
      return { ok: true, transactionId: res?.transactionId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/timed out|disconnect|not connected|websocket|closed/i.test(msg)) {
        this.close();
        throw e;
      }
      return { ok: false, error: msg };
    }
  }

  close(): void {
    const c = this.client;
    this.client = null;
    if (c) void c.disconnect().catch(() => {});
  }
}
