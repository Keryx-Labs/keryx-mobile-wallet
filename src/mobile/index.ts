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
import { createChainProvider, ChainProvider } from "./chain";

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

  const chain = createChainProvider("rest", { isNative: native, gatewayBase: opts.gatewayBase });
  const envNodes = import.meta.env.VITE_KERYX_NODES as string | undefined;

  return {
    native,
    platform: platformName(),
    flags,
    autoLock,
    price,
    donateAddress: DONATE_ADDRESS,
    chain,
    validateNode: (url: string) => validateNodeUrl(url, { allowLoopbackWs: allowLoopbackWs() }),
    pickNode: (probe: Probe) => selectHealthyNode(candidateNodes(envNodes), probe),
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
