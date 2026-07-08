// App state + actions for the mobile shell. Wires the runtime (initMobile) and the REST-backed
// MobileWallet into a small React context the screens consume. No secrets are held in state — only
// public addresses, balances and the (optional) transient password passed straight into an action.

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { initMobile, MobileRuntime, buildSendConfirmation, krxToUsd } from "../index";
import type { KrxPrice } from "../index";
import { secureStore } from "../secureStore";
import { isNative } from "../platform";
import { initWasm, verifyAddressPrefix } from "../wallet/wasm";
import { MobileWallet } from "../wallet/mobileWallet";
import type { AiRequestParams, AiRequestResult, AiResponseFound } from "../wallet/mobileWallet";
import { fetchIpfsText } from "../ai/ipfs";
import {
  biometricAvailable,
  isBiometricUnlockEnabled,
  enableBiometricUnlock,
  unlockWithBiometrics,
  promptBiometric,
  friendlyBiometryError,
} from "../biometric";
import type { HistoryEntry } from "../chain";

export type Phase = "boot" | "onboarding" | "locked" | "home" | "error";

interface AppState {
  phase: Phase;
  error: string | null;
  balanceSompi: bigint;
  price: KrxPrice | null;
  receiveAddress: string | null;
  history: HistoryEntry[];
  refreshing: boolean;
  biometricReady: boolean;
  biometricEnabled: boolean;
}

interface AppCtx extends AppState {
  runtime: MobileRuntime | null;
  wallet: MobileWallet | null;
  newMnemonic: () => string;
  validateMnemonic: (p: string) => boolean;
  createOrImport: (password: string, phrase: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  unlockBiometric: () => Promise<void>;
  enableBiometric: (password: string) => Promise<void>;
  lock: () => void;
  refresh: () => Promise<void>;
  send: (password: string, dest: string, amountSompi: bigint) => Promise<{ txId: string }>;
  sendWithBiometric: (dest: string, amountSompi: bigint) => Promise<{ txId: string }>;
  reviewSend: typeof buildSendConfirmation;
  usd: (krx: number) => string | null;
  openTrade: () => Promise<void>;
  donateAddress: string;
  submitAi: (password: string, params: AiRequestParams) => Promise<AiRequestResult>;
  submitAiWithBiometric: (params: AiRequestParams) => Promise<AiRequestResult>;
  findAiResponse: (requestHash: string) => Promise<AiResponseFound | null>;
  fetchAiResult: (cid: string) => Promise<string>;
  wipe: () => Promise<void>;
}

const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
};

// Time-box a boot step so a hanging native/WASM call surfaces as a visible error instead of an
// infinite splash. The label tells us exactly which step got stuck.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
    ),
  ]);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [runtime, setRuntime] = useState<MobileRuntime | null>(null);
  const [wallet, setWallet] = useState<MobileWallet | null>(null);
  const [s, setS] = useState<AppState>({
    phase: "boot",
    error: null,
    balanceSompi: 0n,
    price: null,
    receiveAddress: null,
    history: [],
    refreshing: false,
    biometricReady: false,
    biometricEnabled: false,
  });
  const patch = (p: Partial<AppState>) => setS((prev) => ({ ...prev, ...p }));

  const lock = useCallback(() => {
    wallet?.lock();
    patch({ phase: "locked", balanceSompi: 0n, history: [], receiveAddress: null });
  }, [wallet]);

  // Boot: only WASM + a localStorage read gate the first screen. Native plugin calls are kept OFF
  // the critical path so they can never freeze the splash; essential steps are time-boxed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await withTimeout(initWasm(), 25000, "Loading wallet engine");
        if (verifyAddressPrefix() !== "keryx") {
          // eslint-disable-next-line no-console
          console.warn("[wallet] unexpected address prefix");
        }
        const rt = await withTimeout(
          initMobile({ inactivityMinutes: 5, onLock: () => lock() }),
          15000,
          "Initializing"
        );
        const store = secureStore(isNative());
        const w = new MobileWallet(rt.chain, store, { networkId: "mainnet" });
        if (cancelled) return;
        setRuntime(rt);
        setWallet(w);
        patch({ phase: w.exists() ? "locked" : "onboarding", price: rt.price.current });
        rt.price.subscribe((p) => patch({ price: p }));
        // Biometric probes run in the background, INDEPENDENTLY, so a slow/hanging checkBiometry can
        // never hide the persisted "enabled" flag (which decides whether unlock offers biometrics).
        isBiometricUnlockEnabled(store)
          .then((on) => {
            if (!cancelled) patch({ biometricEnabled: on });
          })
          .catch(() => {});
        biometricAvailable(rt.native)
          .then((bio) => {
            if (!cancelled) patch({ biometricReady: bio.available });
          })
          .catch(() => {});
      } catch (e) {
        if (!cancelled) patch({ phase: "error", error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    if (!wallet || !wallet.isUnlocked) return;
    patch({ refreshing: true });
    try {
      const { balanceSompi, history } = await wallet.overview(50);
      patch({
        balanceSompi,
        history,
        receiveAddress: wallet.receiveAddress,
        refreshing: false,
      });
    } catch (e) {
      patch({ refreshing: false, error: e instanceof Error ? e.message : String(e) });
    }
  }, [wallet]);

  const afterUnlock = useCallback(async () => {
    patch({ phase: "home", receiveAddress: wallet?.receiveAddress ?? null, error: null });
    runtime?.autoLock.notifyActivity();
    await refresh();
  }, [wallet, runtime, refresh]);

  const createOrImport = useCallback(
    async (password: string, phrase: string) => {
      if (!wallet) return;
      await wallet.createOrImport(password, phrase);
      await runtime?.backupSeed();
      await afterUnlock();
    },
    [wallet, runtime, afterUnlock]
  );

  const unlock = useCallback(
    async (password: string) => {
      if (!wallet) return;
      wallet.unlock(password); // throws "Wrong password."
      await afterUnlock();
    },
    [wallet, afterUnlock]
  );

  const unlockBiometric = useCallback(async () => {
    if (!wallet || !runtime) return;
    const store = secureStore(runtime.native);
    let pw: string | null;
    try {
      pw = await unlockWithBiometrics(store, runtime.native);
    } catch (e) {
      throw new Error(friendlyBiometryError(e));
    }
    if (!pw) throw new Error("Biometric unlock unavailable.");
    wallet.unlock(pw);
    await afterUnlock();
  }, [wallet, runtime, afterUnlock]);

  const enableBiometric = useCallback(
    async (password: string) => {
      if (!wallet || !runtime) throw new Error("Wallet not ready.");
      wallet.revealMnemonic(password); // verifies the password (throws "Wrong password.")
      // Each step is time-boxed so a hang surfaces as a named error instead of silently doing nothing.
      try {
        await withTimeout(
          promptBiometric(runtime.native, "Enable fingerprint / face unlock"),
          45000,
          "Biometric prompt"
        );
      } catch (e) {
        throw new Error(friendlyBiometryError(e));
      }
      const store = secureStore(runtime.native);
      await withTimeout(enableBiometricUnlock(store, password), 8000, "Saving to secure storage");
      patch({ biometricEnabled: true, biometricReady: true });
    },
    [wallet, runtime]
  );

  const send = useCallback(
    async (password: string, dest: string, amountSompi: bigint) => {
      if (!wallet) throw new Error("Wallet not ready.");
      const r = await wallet.send(password, dest, amountSompi);
      await refresh();
      return { txId: r.txId };
    },
    [wallet, refresh]
  );

  const sendWithBiometric = useCallback(
    async (dest: string, amountSompi: bigint) => {
      if (!wallet || !runtime) throw new Error("Wallet not ready.");
      const store = secureStore(runtime.native);
      let pw: string | null;
      try {
        pw = await unlockWithBiometrics(store, runtime.native);
      } catch (e) {
        throw new Error(friendlyBiometryError(e));
      }
      if (!pw) throw new Error("Biometric authorization is unavailable — use your password.");
      const r = await wallet.send(pw, dest, amountSompi);
      await refresh();
      return { txId: r.txId };
    },
    [wallet, runtime, refresh]
  );

  const submitAi = useCallback(
    async (password: string, params: AiRequestParams) => {
      if (!wallet) throw new Error("Wallet not ready.");
      const r = await wallet.submitAiRequest(password, params);
      await refresh();
      return r;
    },
    [wallet, refresh]
  );

  const submitAiWithBiometric = useCallback(
    async (params: AiRequestParams) => {
      if (!wallet || !runtime) throw new Error("Wallet not ready.");
      const store = secureStore(runtime.native);
      let pw: string | null;
      try {
        pw = await unlockWithBiometrics(store, runtime.native);
      } catch (e) {
        throw new Error(friendlyBiometryError(e));
      }
      if (!pw) throw new Error("Biometric authorization is unavailable — use your password.");
      const r = await wallet.submitAiRequest(pw, params);
      await refresh();
      return r;
    },
    [wallet, runtime, refresh]
  );

  const findAiResponse = useCallback(
    async (requestHash: string) => {
      if (!wallet) return null;
      return wallet.findAiResponse(requestHash);
    },
    [wallet]
  );

  const fetchAiResult = useCallback(
    async (cid: string) => fetchIpfsText(cid, runtime?.native ?? false),
    [runtime]
  );

  const wipe = useCallback(async () => {
    await wallet?.wipe();
    patch({ phase: "onboarding", balanceSompi: 0n, history: [], receiveAddress: null });
  }, [wallet]);

  const value: AppCtx = {
    ...s,
    runtime,
    wallet,
    newMnemonic: () => wallet?.newMnemonic() ?? "",
    validateMnemonic: (p) => wallet?.validateMnemonic(p) ?? false,
    createOrImport,
    unlock,
    unlockBiometric,
    enableBiometric,
    lock,
    refresh,
    send,
    sendWithBiometric,
    reviewSend: buildSendConfirmation,
    usd: (krx: number) => krxToUsd(krx, s.price),
    openTrade: async () => runtime?.openTrade(),
    donateAddress: runtime?.donateAddress ?? "",
    submitAi,
    submitAiWithBiometric,
    findAiResponse,
    fetchAiResult,
    wipe,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
