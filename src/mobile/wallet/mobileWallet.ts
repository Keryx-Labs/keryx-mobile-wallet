// Mobile wallet-core (REST-backed). Uses the SDK only for crypto (mnemonic, encryption, key/address
// derivation, signing) and a `ChainProvider` for all networking. No secret is logged; the provider
// only ever receives public addresses and a signed tx.

import * as kaspa from "../../sdk/kaspa.js";
import type { ChainProvider, HistoryEntry, Utxo } from "../chain";
import { signSpend, signConsolidate, consolidateInfo, COINBASE_MATURITY } from "../chain";
import type { ConsolidateInfo } from "../chain";
export type { ConsolidateInfo } from "../chain";
import type { SecureStore } from "../secureStore";
import { deriveAddresses, deriveKeyMap, firstReceiveAddress } from "./derivation";
import { signAiRequest } from "../ai/tx";

// Same key the desktop wallet + seedVault use, so the encrypted blob is shared/mirrorable.
const SEED_KEY = "keryx.wallet.seed.v1";

export interface MobileWalletOptions {
  networkId?: string;
  /** How many receive/change indices to derive+scan. */
  scanWindow?: number;
}

export interface SendResult {
  txId: string;
  feeSompi: bigint;
}

export interface ConsolidateProgress {
  batch: number; // 1-based index of the batch that just confirmed
  remaining: number; // mature UTXOs still needing consolidation
  txid: string;
}

export interface ConsolidateResult {
  txids: string[]; // one per batch
  batches: number;
  remaining: number; // mature UTXOs left after the whole run (0/1 = fully consolidated)
  totalInputs: number; // total coins swept across all batches
  totalFeeSompi: bigint; // total network fee across all batches
}

// Backstop for the auto-loop (each batch nets ≥ −1 UTXO, so a real run terminates well before this).
const MAX_CONSOLIDATE_BATCHES = 200;

export interface AiRequestParams {
  modelId: string;
  prompt: string;
  maxTokens: number;
  rewardSompi: bigint;
  priorityFeeSompi?: bigint;
}

export interface AiRequestResult {
  txId: string;
  requestHash: string;
  feeSompi: bigint;
}

export interface AiResponseFound {
  requestTxId: string;
  model: string;
  cid: string | null; // IPFS CID of the answer (may be null if only inline text is provided)
  resultText: string | null; // inline answer text if the gateway already has it
}

/** Concurrency-limited parallel map that preserves input order. */
async function pmap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker)
  );
  return results;
}

export class MobileWallet {
  private networkId: string;
  private scanWindow: number;
  private addresses: { receive: string[]; change: string[] } | null = null;

  constructor(
    private chain: ChainProvider,
    private store: SecureStore,
    opts: MobileWalletOptions = {}
  ) {
    this.networkId = opts.networkId ?? "mainnet";
    this.scanWindow = opts.scanWindow ?? 12;
  }

  get isUnlocked(): boolean {
    return this.addresses !== null;
  }
  get receiveAddress(): string | null {
    return this.addresses?.receive[0] ?? null;
  }
  get allAddresses(): string[] {
    return this.addresses ? [...this.addresses.receive, ...this.addresses.change] : [];
  }

  exists(): boolean {
    try {
      return !!localStorage.getItem(SEED_KEY);
    } catch {
      return false;
    }
  }

  newMnemonic(): string {
    return kaspa.Mnemonic.random(24).phrase;
  }

  validateMnemonic(phrase: string): boolean {
    return kaspa.Mnemonic.validate(phrase.trim().replace(/\s+/g, " "));
  }

  async createOrImport(password: string, phrase: string): Promise<void> {
    const clean = phrase.trim().replace(/\s+/g, " ");
    if (!kaspa.Mnemonic.validate(clean)) throw new Error("Invalid recovery phrase.");
    if (!password) throw new Error("A password is required.");
    const blob = kaspa.encryptXChaCha20Poly1305(clean, password);
    this.setBlob(blob);
    try {
      await this.store.set("seed.blob.v1", blob);
    } catch {
      /* non-fatal */
    }
    this.addresses = deriveAddresses(clean, this.networkId, this.scanWindow);
  }

  unlock(password: string): void {
    const phrase = this.revealMnemonic(password);
    this.addresses = deriveAddresses(phrase, this.networkId, this.scanWindow);
  }

  lock(): void {
    this.addresses = null;
  }

  revealMnemonic(password: string): string {
    const blob = this.getBlob();
    if (!blob) throw new Error("No wallet on this device.");
    let phrase: string;
    try {
      phrase = kaspa.decryptXChaCha20Poly1305(blob, password);
    } catch {
      throw new Error("Wrong password.");
    }
    if (!phrase || !kaspa.Mnemonic.validate(phrase.trim())) {
      throw new Error("Stored recovery phrase is invalid or corrupted.");
    }
    return phrase;
  }

  validateAddress(str: string): boolean {
    try {
      if (!kaspa.Address.validate(str)) return false;
      return str.split(":")[0] === "keryx";
    } catch {
      return false;
    }
  }

  /**
   * Balance + history in one fast pass. `/addresses/:addr` is fast (~0.5-1.5s) and carries the
   * activity flag + history; the slow `/utxos` endpoint (~6-9s) is only hit for addresses that
   * actually have activity. All calls run in parallel. A fresh wallet does zero slow calls.
   */
  async overview(historyLimit = 50): Promise<{ balanceSompi: bigint; history: HistoryEntry[] }> {
    const addrs = this.allAddresses;
    const summaries = await pmap(addrs, 10, (a) => this.chain.getAddress(a).catch(() => null));

    const seen = new Map<string, HistoryEntry>();
    const active: string[] = [];
    summaries.forEach((s, i) => {
      if (!s) return;
      if (s.totalTxCount > 0 || s.totalReceivedSompi > 0n) active.push(addrs[i]);
      for (const t of s.transactions) {
        const prev = seen.get(t.txId);
        if (prev) prev.amountSompi += t.amountSompi;
        else seen.set(t.txId, { ...t });
      }
    });

    const utxoLists = await pmap(active, 8, (a) => this.chain.getUtxos(a).catch(() => []));
    let balanceSompi = 0n;
    for (const list of utxoLists) for (const u of list) balanceSompi += u.amountSompi;

    const history = [...seen.values()]
      .sort((a, b) => (a.daaScore < b.daaScore ? 1 : a.daaScore > b.daaScore ? -1 : 0))
      .slice(0, historyLimit);
    return { balanceSompi, history };
  }

  async getBalanceSompi(): Promise<bigint> {
    return (await this.overview(0)).balanceSompi;
  }

  async history(limit = 50): Promise<HistoryEntry[]> {
    return (await this.overview(limit)).history;
  }

  async send(
    password: string,
    destAddress: string,
    amountSompi: bigint,
    extraFeeSompi = 0n
  ): Promise<SendResult> {
    if (!this.addresses) throw new Error("Wallet is locked.");
    if (!this.validateAddress(destAddress)) throw new Error("Invalid destination address.");
    if (amountSompi <= 0n) throw new Error("Amount must be greater than zero.");

    const phrase = this.revealMnemonic(password); // wrong password throws here
    const keyMap = deriveKeyMap(phrase, this.networkId, this.scanWindow);

    const utxos = await this.gatherUtxos();
    if (utxos.length === 0) throw new Error("No spendable UTXOs found.");

    const keys = Array.from(keyMap.values());
    const changeAddress = this.addresses.receive[0];
    const signed = signSpend({
      utxos,
      keys,
      destinationAddress: destAddress,
      amountSompi,
      changeAddress,
      networkId: this.networkId,
      extraFeeSompi,
    });

    const res = await this.chain.broadcast(signed.broadcastBody);
    if (!res.ok) throw new Error(res.error ?? "Broadcast failed.");
    return { txId: res.transactionId || signed.txId, feeSompi: signed.feeSompi };
  }

  /** Read-only consolidate sizing for the confirm screen (no keys, no broadcast). */
  async consolidatePreview(): Promise<ConsolidateInfo> {
    if (!this.addresses) throw new Error("Wallet is locked.");
    const [utxos, info] = await Promise.all([this.gatherUtxos(), this.chain.getInfo()]);
    return consolidateInfo(utxos, info.lastDaaScore);
  }

  /**
   * Consolidate the WHOLE eligible set in ONE action — reproduces the official desktop wallet's
   * auto-loop. A single authorization derives the keys once; then it submits batch after batch (each
   * the largest ≤80 mature UTXOs swept into a single self-output), WAITING for each batch's inputs to
   * be consumed by the network before reading the next set, until ≤1 UTXO remains. If a batch times
   * out, the batches already submitted are real — it stops and reports. `onProgress` fires after each
   * confirmed batch so the UI can show the count dropping live. Coinbase maturity is honored per batch.
   */
  async consolidate(
    password: string,
    onProgress?: (p: ConsolidateProgress) => void
  ): Promise<ConsolidateResult> {
    if (!this.addresses) throw new Error("Wallet is locked.");
    const phrase = this.revealMnemonic(password); // one auth for the whole multi-batch run
    const keys = Array.from(deriveKeyMap(phrase, this.networkId, this.scanWindow).values());
    const changeAddress = this.addresses.receive[0];

    const matureOf = (utxos: Utxo[], daa: bigint) =>
      utxos.filter((u) => !u.isCoinbase || daa - u.blockDaaScore >= COINBASE_MATURITY);

    const txids: string[] = [];
    let totalFee = 0n;
    let totalInputs = 0;
    let remaining = 0;

    let info = await this.chain.getInfo();
    let utxos = await this.gatherUtxos();

    for (let batch = 0; batch < MAX_CONSOLIDATE_BATCHES; batch++) {
      const mature = matureOf(utxos, info.lastDaaScore);
      if (mature.length < 2) {
        if (batch === 0) throw new Error("Need at least 2 spendable coins (UTXOs) to consolidate.");
        remaining = mature.length; // done — nothing left to compound
        break;
      }

      const signed = signConsolidate({
        utxos,
        keys,
        changeAddress,
        networkId: this.networkId,
        currentDaaScore: info.lastDaaScore,
      });
      const res = await this.chain.broadcast(signed.broadcastBody);
      if (!res.ok) {
        if (batch === 0) throw new Error(res.error ?? "Broadcast failed.");
        break; // mid-run failure: keep the batches already done
      }
      const txid = res.transactionId || signed.txId;
      txids.push(txid);
      totalFee += signed.feeSompi;
      totalInputs += signed.inputCount;

      const spent = new Set(signed.broadcastBody.inputs.map((in_) => `${in_.transaction_id}:${in_.index}`));
      try {
        utxos = await this.waitForBatchConfirmed(spent);
      } catch {
        // Timed out waiting for this batch — the submitted batches are real; stop and report.
        remaining = Math.max(0, mature.length - signed.inputCount + 1);
        onProgress?.({ batch: batch + 1, remaining, txid });
        break;
      }
      info = await this.chain.getInfo();
      remaining = matureOf(utxos, info.lastDaaScore).length;
      onProgress?.({ batch: batch + 1, remaining, txid });
      if (remaining < 2) break;
    }

    return { txids, batches: txids.length, remaining, totalInputs, totalFeeSompi: totalFee };
  }

  /**
   * Poll the gateway UTXO set until NONE of the given input outpoints remain — i.e. the batch tx was
   * accepted into the DAG and its inputs consumed (the new compound output is then present too).
   * Returns the fresh UTXO set. Time-boxed so a tx that never confirms surfaces as an error.
   */
  private async waitForBatchConfirmed(
    spent: Set<string>,
    timeoutMs = 120_000,
    pollMs = 4_000
  ): Promise<Utxo[]> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { utxos, complete } = await this.gatherUtxosDetailed();
      // Only trust a COMPLETE read. A partial/failed fetch right after broadcast would show the spent
      // outpoints "gone" merely because some addresses failed to load — which previously made the
      // auto-loop stop after a single batch. Require a full read before declaring the batch done.
      if (complete && !utxos.some((u) => spent.has(`${u.transactionId}:${u.index}`))) return utxos;
      if (Date.now() > deadline) throw new Error("Consolidation batch did not confirm in time.");
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }

  /**
   * Gather spendable UTXOs from active addresses (fast summary pass, then parallel UTXO pulls).
   * `complete` is false if ANY address query failed — callers that must not mistake a partial or
   * failed read for an empty wallet (e.g. the consolidate confirmation wait) check this flag.
   */
  private async gatherUtxosDetailed(): Promise<{ utxos: Utxo[]; complete: boolean }> {
    let complete = true;
    const summaries = await pmap(this.allAddresses, 10, async (a) => {
      try {
        return await this.chain.getAddress(a);
      } catch {
        complete = false;
        return null;
      }
    });
    const active = this.allAddresses.filter(
      (_, i) => summaries[i] && (summaries[i]!.totalTxCount > 0 || summaries[i]!.totalReceivedSompi > 0n)
    );
    const lists = await pmap(active, 8, async (a) => {
      try {
        return await this.chain.getUtxos(a);
      } catch {
        complete = false;
        return [] as Utxo[];
      }
    });
    return { utxos: lists.flat(), complete };
  }

  /** Best-effort UTXO gather (partial reads tolerated) — used for balance / send / AI. */
  private async gatherUtxos(): Promise<Utxo[]> {
    return (await this.gatherUtxosDetailed()).utxos;
  }

  /**
   * Build, sign and broadcast a Keryx AI inference request (a special-subnetwork tx whose fee is the
   * miner's payment). Requires the password (verified by revealing the mnemonic). Returns the request
   * tx id + request_hash used later to find the answer. Never logs the prompt or any secret.
   */
  async submitAiRequest(password: string, params: AiRequestParams): Promise<AiRequestResult> {
    if (!this.addresses) throw new Error("Wallet is locked.");
    if (!params.prompt.trim()) throw new Error("Enter a prompt.");
    if (params.rewardSompi <= 0n) throw new Error("Set an inference reward.");

    const phrase = this.revealMnemonic(password); // wrong password throws here
    const keyMap = deriveKeyMap(phrase, this.networkId, this.scanWindow);

    const utxos = await this.gatherUtxos();
    if (utxos.length === 0) throw new Error("No spendable KRX found to pay for the request.");

    const signed = signAiRequest({
      utxos,
      keys: Array.from(keyMap.values()),
      changeAddress: this.addresses.receive[0],
      networkId: this.networkId,
      modelId: params.modelId,
      prompt: params.prompt,
      maxTokens: params.maxTokens,
      rewardSompi: params.rewardSompi,
      priorityFeeSompi: params.priorityFeeSompi,
    });

    const res = await this.chain.broadcast(signed.broadcastBody);
    if (!res.ok) throw new Error(res.error ?? "Broadcast failed.");
    return {
      txId: res.transactionId || signed.txId,
      requestHash: signed.requestHash,
      feeSompi: signed.feeSompi,
    };
  }

  /**
   * Look for the answer to a given AiRequest by its tx id, using the gateway's `/api/v1/infer` feed
   * (the same source the web wallet uses). Returns null while the request is unanswered (no result
   * CID / text yet) or not yet indexed. Never logs the prompt or result.
   */
  async findAiResponse(requestTxId: string, scanLimit = 50): Promise<AiResponseFound | null> {
    const id = requestTxId.toLowerCase();
    const feed = await this.chain.listInferences(scanLimit).catch(() => []);
    const hit = feed.find((r) => r.txId.toLowerCase() === id);
    if (!hit) return null;
    if (!hit.resultCid && !hit.resultText) return null; // request seen, but no answer yet
    return {
      requestTxId: hit.txId,
      model: hit.model,
      cid: hit.resultCid,
      resultText: hit.resultText,
    };
  }

  async wipe(): Promise<void> {
    this.lock();
    try {
      localStorage.removeItem(SEED_KEY);
    } catch {
      /* ignore */
    }
    try {
      await this.store.remove("seed.blob.v1");
    } catch {
      /* ignore */
    }
  }

  primaryAddressFor(phrase: string): string {
    return firstReceiveAddress(phrase, this.networkId);
  }

  private getBlob(): string | null {
    try {
      return localStorage.getItem(SEED_KEY);
    } catch {
      return null;
    }
  }
  private setBlob(blob: string): void {
    try {
      localStorage.setItem(SEED_KEY, blob);
    } catch {
      /* non-fatal */
    }
  }
}
// end of mobileWallet.ts
