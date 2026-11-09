// Chain layer entry point + provider factory.
//
// Default is the REST Gateway. DirectNode (wRPC over wss://) is reserved for Advanced/Developer or a
// future offline-of-gateway mode; it is intentionally a stub in the MVP so the abstraction is real.

import type { ChainProvider } from "./types";
import { RestGatewayProvider, DEFAULT_GATEWAY } from "./restGateway";
import { HybridProvider } from "./hybrid";
import type { NodeCandidate } from "../nodes";

export type ProviderKind = "rest" | "direct" | "hybrid";

export interface ChainProviderOptions {
  isNative: boolean;
  gatewayBase?: string;
  nodeUrl?: string;
  networkId?: string;
  /** Nodes tried in order by the hybrid provider. */
  nodes?: NodeCandidate[];
}

/** Reserved future provider: talks wRPC (Borsh, wss://) directly to a node. Not in the MVP. */
class DirectNodeProvider implements ChainProvider {
  readonly kind = "direct" as const;
  // Params reserved for the future wRPC implementation; unused today.
  constructor(_url: string, _networkId: string) {}
  private fail(): never {
    throw new Error("DirectNodeProvider is reserved for a future release; use the REST gateway.");
  }
  getInfo() { return this.fail(); }
  getBalanceSompi() { return this.fail(); }
  getUtxos() { return this.fail(); }
  getAddress() { return this.fail(); }
  getTransaction() { return this.fail(); }
  getRichTransaction() { return this.fail(); }
  listRecentTransactions() { return this.fail(); }
  listInferences() { return this.fail(); }
  broadcast() { return this.fail(); }
}

export function createChainProvider(
  kind: ProviderKind,
  opts: ChainProviderOptions
): ChainProvider {
  if (kind === "direct") {
    return new DirectNodeProvider(opts.nodeUrl ?? "", opts.networkId ?? "mainnet");
  }
  const rest = new RestGatewayProvider(opts.isNative, opts.gatewayBase ?? DEFAULT_GATEWAY);
  if (kind === "hybrid") return new HybridProvider(rest, opts.nodes ?? []);
  return rest;
}

export { RestGatewayProvider, DEFAULT_GATEWAY } from "./restGateway";
export { HybridProvider } from "./hybrid";
export type { NodeStatus } from "./hybrid";
export { signSpend, signConsolidate, consolidateInfo, signEscrowReclaim, MAX_TX_INPUTS, KERYX_MIN_FEE, COINBASE_MATURITY } from "./signer";
export type { SpendRequest, SignedSpend, ConsolidateRequest, ConsolidateInfo, EscrowUtxo, EscrowReclaimRequest } from "./signer";
export { buildBroadcastBody, stringifyBroadcast, splitScriptPublicKey } from "./broadcast";
export type { BroadcastTx, BroadcastInput, BroadcastOutput, SerializableTx } from "./broadcast";
export type {
  ChainProvider,
  NetworkInfo,
  Utxo,
  HistoryEntry,
  AddressSummary,
  TxDetail,
  RecentTx,
  RichTx,
  InferenceRecord,
  BroadcastResult,
  AiProvider,
  AiProviders,
} from "./types";
