// Mobile integration layer — the single entry point the app shell calls.
//
// Keeps all Capacitor/native concerns out of the shared wallet-core. Mobile behavior is composed
// here and injected. The shared wallet-core never imports Capacitor.

import { isNative, allowLoopbackWs, platformName } from "./platform";
import { secureStore } from "./secureStore";
import { restoreSeedFromVault, mirrorSeedToVault, clearVaultSeed } from "./seedVault";
import { AutoLock } from "./autoLock";
import { validateNodeUrl } from "./nodeValidation";
import { PriceService } from "./price";
import { candidateNodes, selectHealthyNode, Probe, NodeSelection } from "./nodes";
import { DEFAULT_FLAGS, FeatureFlags, visibleSections } from "./features";
import { openTradeKrx, DONATE_ADDRESS } from "./externalLinks";
import { createChainProvider, ChainProvider, HybridProvider, NodeStatus } from "./chain";
import type { NodeCandidate } from "./nodes";

const CUSTOM_NODE_KEY = "keryx.mobile.customNode";

function loadCustomNode(): string | null {
  try {
    return localStorage.getItem(CUSTOM_NODE_KEY) || null;
  } catch {
    return null;
  }
}

function withCustom(custom: string | null, defaults: NodeCandidate[]): NodeCandidate[] {
  if (!custom) return defaults;
  return [{ url: custom, networkId: defaults[0]?.networkId ?? "mainnet" }, ...defaults.filter((n) => n.url !== custom)];
}

export interface MobileRuntime {
  native: boolean;
  platform: ReturnType<typeof platformName>;
  flags: FeatureFlags;
  autoLock: AutoLock;
  price: PriceService;
  donateAddress: string;
  chain: ChainProvider;
  validateNode: (url: string) => ReturnType<typeof validateNodeUrl>;
  pickNode: (probe: Probe) => Promise<NodeSelection>;
  /** Node in use by the chain provider, or null when only the gateway answers. */
  nodeStatus: () => NodeStatus;
  /** Probes the node list now; resolves with the resulting status. */
  checkNode: () => Promise<NodeStatus>;
  customNode: () => string | null;
  /** Validates, stores and switches to a user node; `null` restores the official list. */
  setCustomNode: (url: string | null) => { ok: boolean; error?: string };
  sections: () => ReturnType<typeof visibleSections>;
  openTrade: () => Promise<void>;
  backupSeed: () => Promise<void>;
  wipeSeedBackup: () => Promise<void>;
}

export interface InitMobileOptions {
  inactivityMinutes: number;
  onLock: () => void;
  flags?: Partial<FeatureFlags>;
  gatewayBase?: string;
}

export async function initMobile(opts: InitMobileOptions): Promise<MobileRuntime> {
  const native = isNative();
  const flags: FeatureFlags = { ...DEFAULT_FLAGS, ...(opts.flags ?? {}) };
  const store = secureStore(native);

  // Native secure storage can be slow to initialize on a cold start — never block boot.
  void restoreSeedFromVault(store).catch(() => {});

  const autoLock = new AutoLock({
    inactivityMinutes: flags.autoLock ? opts.inactivityMinutes : 0,
    lockOnBackground: native && flags.lockOnBackground,
    backgroundGraceMs: 0,
    onLock: opts.onLock,
  });
  // Registering the native app-state listener must not block boot either.
  void autoLock.start(native).catch(() => {});

  const price = new PriceService(native);
  if (flags.marketPrice) price.start();

  const envNodes = import.meta.env.VITE_KERYX_NODES as string | undefined;
  const defaults = candidateNodes(envNodes);
  let custom = loadCustomNode();
  const chain = createChainProvider("hybrid", {
    isNative: native,
    gatewayBase: opts.gatewayBase,
    nodes: withCustom(custom, defaults),
  }) as HybridProvider;
  const validate = (url: string) => validateNodeUrl(url, { allowLoopbackWs: allowLoopbackWs() });

  return {
    native,
    platform: platformName(),
    flags,
    autoLock,
    price,
    donateAddress: DONATE_ADDRESS,
    chain,
    validateNode: validate,
    pickNode: (probe: Probe) => selectHealthyNode(candidateNodes(envNodes), probe),
    nodeStatus: () => chain.status(),
    checkNode: () => chain.connect(),
    customNode: () => custom,
    setCustomNode: (url: string | null) => {
      let next: string | null = null;
      if (url && url.trim()) {
        const v = validate(url);
        if (!v.ok || !v.url) return { ok: false, error: v.error ?? "Invalid node address." };
        next = v.url;
      }
      try {
        if (next) localStorage.setItem(CUSTOM_NODE_KEY, next);
        else localStorage.removeItem(CUSTOM_NODE_KEY);
      } catch {
        /* kept for this session only */
      }
      custom = next;
      chain.setCandidates(withCustom(custom, defaults));
      return { ok: true };
    },
    sections: () => visibleSections(flags),
    openTrade: () => openTradeKrx(native),
    backupSeed: () => mirrorSeedToVault(store),
    wipeSeedBackup: () => clearVaultSeed(store),
  };
}

export { validateNodeUrl } from "./nodeValidation";
export { buildSendConfirmation } from "./sendConfirmation";
export type { SendConfirmation } from "./sendConfirmation";
export { krxToUsd } from "./price";
export type { KrxPrice } from "./price";
export { explorerTxUrl, explorerAddressUrl, openExplorerTx, openExplorerAddress } from "./externalLinks";
export { visibleSections, DEFAULT_FLAGS } from "./features";
export type { FeatureFlags, NavSection, SectionId } from "./features";
export { createChainProvider, RestGatewayProvider, signSpend } from "./chain";
export type { ChainProvider, Utxo, AddressSummary, TxDetail, BroadcastResult, SignedSpend, SpendRequest } from "./chain";
