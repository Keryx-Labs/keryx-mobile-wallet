// HD derivation — the exact recipe the desktop wallet uses, isolated as pure functions so the mobile
// wallet-core can derive addresses (public) and signing keys (private) without the wss-coupled SDK
// `Wallet` object. Verified against the desktop `deriveKeyMap` and covered by real-WASM tests.
//
//   mnemonic → Mnemonic.toSeed() → XPrv(seed) → PrivateKeyGenerator(xprv, is_multisig=false, acct=0)
//   receiveKey(i)/changeKey(i) → PrivateKey → toAddress(networkId)
//
// The mnemonic/keys exist only for the duration of a call; callers must not retain or log them.

import * as kaspa from "../../sdk/kaspa.js";

export interface DerivedKey {
  address: string;
  key: { toString(): string }; // kaspa.PrivateKey; hex via toString()
}

function generatorFor(mnemonicPhrase: string): any {
  const seed = new kaspa.Mnemonic(mnemonicPhrase).toSeed(); // no bip39 passphrase
  const xprv = new kaspa.XPrv(seed);
  // Pass xprv as a STRING (the wasm union-coercion rejects the instance) — matches desktop.
  return new kaspa.PrivateKeyGenerator(xprv.toString(), false, 0n);
}

/** Derive the receive + change address windows (public strings) for display/scan. */
export function deriveAddresses(
  mnemonicPhrase: string,
  networkId: string,
  count: number
): { receive: string[]; change: string[] } {
  const gen = generatorFor(mnemonicPhrase);
  const receive: string[] = [];
  const change: string[] = [];
  for (let i = 0; i < count; i++) {
    receive.push(gen.receiveKey(i).toAddress(networkId).toString());
    change.push(gen.changeKey(i).toAddress(networkId).toString());
  }
  return { receive, change };
}

/** The primary receive address (index 0). */
export function firstReceiveAddress(mnemonicPhrase: string, networkId: string): string {
  return generatorFor(mnemonicPhrase).receiveKey(0).toAddress(networkId).toString();
}

/**
 * Build an address→PrivateKey map over the receive+change windows, for signing. Private keys are
 * held only in the returned map; the caller must drop it after signing and never log it.
 */
export function deriveKeyMap(
  mnemonicPhrase: string,
  networkId: string,
  count: number
): Map<string, { toString(): string }> {
  const gen = generatorFor(mnemonicPhrase);
  const map = new Map<string, { toString(): string }>();
  for (let i = 0; i < count; i++) {
    const rk = gen.receiveKey(i);
    map.set(rk.toAddress(networkId).toString(), rk);
    const ck = gen.changeKey(i);
    map.set(ck.toAddress(networkId).toString(), ck);
  }
  return map;
}
// end of derivation.ts
