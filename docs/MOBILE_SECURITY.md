# Keryx Wallet — Mobile Security

Self‑custodial. **Keys, seed and password never leave the device.** This document states the mobile
security model, what changed from desktop, and what still needs manual verification.

## Non‑negotiables (enforced in code)

1. **No secret ever logged.** No `console.*` / logger call may reference `password`, `mnemonic`,
   `phrase`, `walletSecret`, `privateKey`, `secretKey`, `rawTx`, or `signingData`. Enforced by
   `tests/noSecretsInLogs.test.ts` (fails the build on violation). The only logged wallet fact is the
   public **address prefix**.
2. **Seed encrypted at rest, always.** The 24‑word phrase is only ever persisted as
   XChaCha20‑Poly1305 ciphertext (Argon2 KDF), produced by the audited wallet‑core. No plaintext
   seed/mnemonic is written anywhere — not localStorage, not Keychain, not logs.
3. **Password is never stored in plaintext.** It is used to derive keys in memory and dropped. The
   optional biometric feature stores the password *inside the OS secure enclave*, released only
   behind a Face ID / Touch ID / fingerprint / device‑passcode prompt — never in app storage or JS
   variables at rest.
4. **Crypto is not re‑implemented.** All key/seed/signature operations call the existing WASM
   wallet‑core, identical to desktop.

## Secure storage

| Platform | Backing store | Accessibility |
| --- | --- | --- |
| iOS | **Keychain** (`kSecClassGenericPassword`) | `AfterFirstUnlockThisDeviceOnly` — device‑only, **not** iCloud‑synced |
| Android | **Keystore‑backed EncryptedSharedPreferences** (AES‑256‑GCM master key in TEE/StrongBox) | app‑private |
| web/dev | in‑memory only | never persisted in plaintext |

Implemented in `src/mobile/secureStore.ts` behind a `SecureStore` interface (plugin:
`@aparajita/capacitor-secure-storage`). What we put there is **ciphertext or non‑secret metadata
only**:

- `seed.blob.v1` — the *already‑encrypted* seed blob, mirrored from the WebView so it survives
  WKWebView storage eviction (`seedVault.ts`). Still requires the password to decrypt.
- `biometric.secret.v1` — the password, biometric‑gated (only if the user opts in).

### Why the seed mirror exists

On iOS, WKWebView localStorage/IndexedDB can be **evicted** under storage pressure. That would drop
the encrypted seed blob (and the SDK's wallet store). We mirror the ciphertext into the Keychain and
restore it on launch, so eviction doesn't strand the user. This is durability insurance, **not** a
second plaintext copy — the mirrored value is the same password‑protected ciphertext. Users are still
required to back up their 24 words.

## Transport security (the wss:// rule)

Single source of truth: `src/mobile/nodeValidation.ts`, enforced at **three** layers:

1. **App** — `validateNodeUrl()` rejects `ws://` to any non‑loopback host (`insecure-remote`), and by
   default rejects `ws://` even to loopback on mobile (`loopback-ws-disabled`), unless a dev flag
   (`VITE_ALLOW_LOOPBACK_WS=true`) is set.
2. **iOS** — App Transport Security: `NSAllowsArbitraryLoads=false`, cleartext only for `localhost`
   (dev). See `ios/Info.plist.ats-snippet.xml`.
3. **Android** — `network_security_config.xml`: `cleartextTrafficPermitted=false` globally, loopback
   carve‑out for dev only.

Net effect: **on mobile, real usage requires a `wss://` (TLS) node endpoint.** Point the wallet at a
node with TLS termination, or a reverse proxy in front of the Borsh wRPC port (23110), started with
`--utxoindex`.

## Auto‑lock & screen privacy

`src/mobile/autoLock.ts`:

- **Inactivity timeout** — reuses the desktop `autoLockMinutes` setting (0 disables).
- **Lock on background** — leaving the app foreground locks immediately (configurable grace). This is
  the strong mobile lock signal.
- **App‑switcher redaction** *(native project step)* — add a launch‑screen cover / secure‑flag so the
  OS snapshot doesn't leak balances/addresses. On Android set `FLAG_SECURE` on the wallet activity;
  on iOS overlay a cover view on `applicationWillResignActive`. (Wired in JS; the native flag is a
  manual step in MOBILE_BUILD.md.)

`lock()` stops timers, drops the in‑memory account, private‑key generator and balances, and
disconnects — storage is untouched, so re‑unlock needs the password (or biometrics).

## Threat model summary

| Threat | Mitigation |
| --- | --- |
| Device theft, screen locked | Seed encrypted at rest; unlock needs password/biometric; auto‑lock on background |
| Malicious/again‑in‑the‑middle node | `wss://` required for remote; confirm‑==‑sign freeze; address+network validated before signing |
| App‑switcher / screenshot leak | Background lock + secure‑flag / cover (manual native step) |
| WebView storage eviction | Keychain/Keystore ciphertext mirror + mandatory 24‑word backup |
| Secret leakage via logs | Static no‑secrets test; only address prefix logged |
| iCloud/Google backup exfiltration of keys | Keychain items device‑only (not synced); Android app‑private, `allowBackup=false` recommended |

## Remaining risks / manual verification

- **Argon2 salt is deterministic** (`SHA256(password)`, upstream SDK). Acceptable for a local wallet
  but means identical passwords yield identical salts. Hardening (later): per‑wallet random salt if
  the SDK exposes it; enforce a strong‑password policy.
- **On‑device soak test for WKWebView eviction** — verify the mirror/restore path on a real iOS device
  under storage pressure.
- **Jailbreak/root detection** — not implemented; consider a soft warning.
- **`allowBackup=false`** and `FLAG_SECURE` are native‑project settings — confirm they're applied
  after `cap add android`.
- **Biometric plugin binding** — the exact secure‑storage/biometric API pairing must be verified on
  device (plugin versions move).
- The inherited **`accountsSend` hang** workaround (manual sign/submit) should be re‑reviewed when the
  SDK is regenerated from a newer node.

## Added surfaces (node auto-select, price, trade, donate) — security notes

- **Automatic node failover** (`nodes.ts`): candidates come from the project's official `wss://` list
  (`VITE_KERYX_NODES` or `OFFICIAL_NODES`). Every candidate is probed and only accepted if reachable,
  synced, and `--utxoindex`. The strict `wss://` rule still applies; ws:// remote is never used.
  Manual entry stays in Advanced/Developer.
- **Market price is advisory only** (`price.ts`): a display value fetched from NonKYC's public API.
  It never gates, influences, or is part of signing. Fetch failures are non-fatal (last cached value).
  Fetched via native HTTP so it doesn't touch the WebView origin or the SDK's fetch.
- **External links are isolated** (`externalLinks.ts`): Trade / explorer / donate open in the SYSTEM
  browser (Chrome Custom Tab / SFSafariViewController), never in the wallet WebView — the exchange
  and explorer pages cannot reach wallet storage or keys. The referral and donate values are public
  identifiers (no secret).
- **AI tab is inert**: reserved flag only, no network or signing behavior until designed.

## Network layer = REST Gateway (what leaves the device)

The default transport is the Keryx REST Gateway (`https://keryx-labs.com/api/v1`), not a node. This
does not weaken the custody model:

- **Only public data leaves the device:** wallet addresses (for balance/UTXO/history reads) and an
  already-signed transaction (for broadcast). **Never** the seed, private keys, password, or any
  derivation material — enforced by the `ChainProvider` boundary (providers receive addresses + a
  signed tx only).
- **Signing is 100% on-device** (`chain/signer.ts`) using the audited WASM wallet-core; the gateway
  cannot alter what was signed (the tx id is fixed by its contents).
- **HTTPS transport.** No `wss://`/cleartext requirement for normal users; the old wss:// node rule
  now applies only to the optional Advanced/Developer direct-node mode.
- **Gateway is untrusted for integrity of funds:** a malicious/incorrect gateway could show a wrong
  balance or withhold broadcast, but cannot move funds (it never has keys) and cannot make you sign a
  different tx than you confirmed (confirm-==-sign freeze + local signing). UTXOs used for signing
  come from the gateway, so a lying gateway could cause a build over stale/invalid UTXOs → the tx
  simply fails at the node on broadcast (no loss). A future integrity option: cross-check UTXOs
  against a second source or the direct-node mode.
- **u64 amounts are handled as bigint end-to-end**, so no rounding can silently change an amount.
