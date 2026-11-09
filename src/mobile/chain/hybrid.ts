// Hybrid provider: balances, UTXOs and plain broadcasts go to a node over wRPC; history, transaction
// detail and the inference feed stay on the REST gateway (a node keeps no address history). Every
// node call falls back to the gateway when no healthy node answers.

import type { BroadcastTx } from "./broadcast";
import type {
  AddressSummary,
  BroadcastResult,
  ChainProvider,
  InferenceRecord,
  NetworkInfo,
  RecentTx,
  RichTx,
  TxDetail,
  Utxo,
} from "./types";
import { NodeRpc } from "./nodeRpc";
import { AI_REQUEST_SUBNETWORK_ID } from "../ai/payload";
import { NodeCandidate, selectHealthyNode } from "../nodes";

const RETRY_AFTER_MS = 60_000;

export interface NodeStatus {
  /** URL of the node in use, or null while only the gateway is reachable. */
  url: string | null;
  lastError: string | null;
}

export class HybridProvider implements ChainProvider {
  readonly kind = "hybrid" as const;
  private node: NodeRpc | null = null;
  private selecting: Promise<NodeRpc | null> | null = null;
  private failedAt = 0;
  private lastError: string | null = null;

  constructor(
    private readonly rest: ChainProvider,
    private candidates: NodeCandidate[]
  ) {}

  /** Replaces the candidate list (e.g. a node chosen in Settings) and drops the current connection. */
  setCandidates(candidates: NodeCandidate[]): void {
    this.candidates = candidates;
    this.node?.close();
    this.node = null;
    this.failedAt = 0;
  }

  status(): NodeStatus {
    return { url: this.node?.url ?? null, lastError: this.lastError };
  }

  /** Connects to the first healthy candidate now instead of on the next node call. */
  async connect(): Promise<NodeStatus> {
    this.failedAt = 0;
    await this.pickNode().catch(() => null);
    return this.status();
  }

  private async pickNode(): Promise<NodeRpc | null> {
    if (this.node) return this.node;
    if (this.candidates.length === 0) return null;
    if (this.failedAt && Date.now() - this.failedAt < RETRY_AFTER_MS) return null;
    if (!this.selecting) {
      this.selecting = (async () => {
        const clients = new Map<string, NodeRpc>();
        const sel = await selectHealthyNode(this.candidates, async (url, networkId) => {
          const c = new NodeRpc(url, networkId);
          clients.set(url, c);
          return c.probe();
        });
        for (const [url, c] of clients) if (url !== sel.selected?.url) c.close();
        if (!sel.selected) {
          this.failedAt = Date.now();
          this.lastError = sel.attempts.map((a) => `${a.node.url}: ${a.result.error ?? "not synced / no utxoindex"}`).join("; ");
          return null;
        }
        this.node = clients.get(sel.selected.url) ?? null;
        this.lastError = null;
        return this.node;
      })().finally(() => {
        this.selecting = null;
      });
    }
    return this.selecting;
  }

  /** Runs `f` on the node, or `fallback` on the gateway when no node is usable or the call fails. */
  private async viaNode<T>(f: (n: NodeRpc) => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    const node = await this.pickNode().catch(() => null);
    if (!node) return fallback();
    try {
      return await f(node);
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      node.close();
      this.node = null;
      this.failedAt = Date.now();
      return fallback();
    }
  }

  async getInfo(): Promise<NetworkInfo> {
    try {
      const info = await this.rest.getInfo();
      // The node's height is authoritative; the gateway's lags while its indexer catches up.
      const daa = await this.viaNode((n) => n.virtualDaaScore(), async () => info.lastDaaScore);
      return { ...info, lastDaaScore: daa > info.lastDaaScore ? daa : info.lastDaaScore };
    } catch (e) {
      const daa = await this.viaNode(
        (n) => n.virtualDaaScore(),
        () => Promise.reject(e)
      );
      return { network: "", lastDaaScore: daa, syncedHint: true };
    }
  }

  getBalanceSompi(address: string): Promise<bigint> {
    return this.viaNode((n) => n.getBalanceSompi(address), () => this.rest.getBalanceSompi(address));
  }

  getUtxosForAddresses(addresses: string[]): Promise<Utxo[]> {
    return this.viaNode(
      (n) => n.getUtxosMany(addresses),
      () => Promise.reject(new Error("No node reachable."))
    );
  }

  getUtxos(address: string): Promise<Utxo[]> {
    return this.viaNode((n) => n.getUtxos(address), () => this.rest.getUtxos(address));
  }

  broadcast(tx: BroadcastTx): Promise<BroadcastResult> {
    // Inference requests keep going through the gateway, which enforces the operator's pauses.
    if (tx.subnetwork_id.toLowerCase() === AI_REQUEST_SUBNETWORK_ID) return this.rest.broadcast(tx);
    return this.viaNode((n) => n.submit(tx), () => this.rest.broadcast(tx));
  }

  getAddress(address: string): Promise<AddressSummary> {
    return this.rest.getAddress(address);
  }

  getTransaction(txid: string): Promise<TxDetail> {
    return this.rest.getTransaction(txid);
  }

  getRichTransaction(txid: string): Promise<RichTx> {
    return this.rest.getRichTransaction(txid);
  }

  listRecentTransactions(limit: number): Promise<RecentTx[]> {
    return this.rest.listRecentTransactions(limit);
  }

  getAiProviders(): Promise<import("./types").AiProviders> {
    if (!this.rest.getAiProviders) return Promise.reject(new Error("The gateway does not list AI providers."));
    return this.rest.getAiProviders();
  }

  getInferenceResult(txid: string): Promise<import("./types").InferenceResult> {
    if (!this.rest.getInferenceResult) return Promise.reject(new Error("The gateway does not serve inference results."));
    return this.rest.getInferenceResult(txid);
  }

  listInferences(limit: number): Promise<InferenceRecord[]> {
    return this.rest.listInferences(limit);
  }
}
