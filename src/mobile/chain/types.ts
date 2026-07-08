// ChainProvider — the network abstraction. The wallet talks to the chain ONLY through this
// interface, so the read/broadcast transport can be swapped without touching wallet logic.
//
//   RestGatewayProvider  — DEFAULT. Uses the Keryx REST Gateway (https://keryx-labs.com/api/v1/*).
//                          No node endpoint for the user; balances/utxos/history over HTTPS,
//                          broadcast of a locally-signed tx.
//   DirectNodeProvider   — FUTURE/Advanced. Talks wRPC (Borsh, wss://) directly to a node, for
//                          power users or offline-of-gateway resilience.
//
// SECURITY: a provider only ever receives PUBLIC data — addresses, UTXO queries, and an
// already-signed transaction. Seed, private keys and password never reach any provider.

import type { BroadcastTx } from "./broadcast";

export interface NetworkInfo {
  network: string; // e.g. "keryx-mainnet"
  lastDaaScore: bigint;
  syncedHint?: boolean;
}

export interface Utxo {
  address: string;
  transactionId: string;
  index: number;
  amountSompi: bigint;
  scriptVersion: number;
  scriptPublicKey: string; // raw script hex (no version prefix)
  blockDaaScore: bigint;
  isCoinbase: boolean;
}

export interface HistoryEntry {
  txId: string;
  amountSompi: bigint; // signed: negative = spend from this address, positive = receive
  isSpend: boolean;
  daaScore: bigint;
  blockHash: string;
}

export interface AddressSummary {
  address: string;
  totalReceivedSompi: bigint;
  totalTxCount: number;
  transactions: HistoryEntry[];
}

export interface TxIo {
  address: string;
  amountSompi: bigint;
  index: number;
}
export interface TxDetail {
  txId: string;
  blockHash: string;
  confirmations: number;
  isAccepted: boolean;
  isCoinbase: boolean;
  inputs: TxIo[];
  outputs: TxIo[];
  totalOutSompi: bigint;
  timestampMs?: number;
}

export interface BroadcastResult {
  ok: boolean;
  transactionId?: string;
  error?: string;
}

/** A lightweight recent-transaction record from the gateway's `/transactions` feed. */
export interface RecentTx {
  txId: string;
  payloadHex: string;
  outputsCount: number;
  isCoinbase: boolean;
}

/** An AI inference record from the gateway's `/api/v1/infer` feed (request + its answer, if any). */
export interface InferenceRecord {
  txId: string; // the AiRequest tx id
  model: string; // model name, e.g. "dolphin-llama3-8b"
  prompt: string;
  maxTokens: number;
  inferenceRewardSompi: bigint;
  priorityFeeSompi: bigint;
  resultCid: string | null; // IPFS CID of the answer; null until a miner responds
  resultText: string | null; // inline answer text if the gateway provides it
  resultDaaScore: bigint;
}

export interface ChainProvider {
  readonly kind: "rest" | "direct";
  getInfo(): Promise<NetworkInfo>;
  getBalanceSompi(address: string): Promise<bigint>;
  getUtxos(address: string): Promise<Utxo[]>;
  getAddress(address: string): Promise<AddressSummary>;
  getTransaction(txid: string): Promise<TxDetail>;
  /** Recent transactions (newest first). */
  listRecentTransactions(limit: number): Promise<RecentTx[]>;
  /** AI inference feed (newest first) — the request + its answer once a miner responds. */
  listInferences(limit: number): Promise<InferenceRecord[]>;
  /** Broadcast a locally-signed transaction. Body is public (signed tx only). */
  broadcast(tx: BroadcastTx): Promise<BroadcastResult>;
}
