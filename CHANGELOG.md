# Changelog — Keryx Mobile Wallet

All notable changes to the mobile app. Format loosely follows Keep a Changelog.

## [0.1.0] — Unreleased (initial mobile scaffold)

Mobile (Android/iOS) build of the Keryx Wallet, on **Capacitor + React**, reusing the desktop
wallet‑core (WASM SDK) unchanged.

### Added
- **Capacitor shell** (`capacitor.config.ts`) wrapping the existing Vite/React frontend for
  WKWebView (iOS) and Android WebView; `app.keryx.wallet` id shared with desktop.
- **Mobile platform layer** (`src/mobile/`):
  - `platform.ts` — native/web + capability detection.
  - `nodeValidation.ts` — strict transport rule: remote nodes require `wss://`; `ws://` loopback is
    off by default on mobile (dev opt‑in).
  - `secureStore.ts` — Keychain (iOS) / Keystore‑backed EncryptedSharedPreferences (Android)
    abstraction with an in‑memory web fallback.
  - `seedVault.ts` — mirrors the *encrypted* seed blob into secure storage to survive WKWebView
    localStorage eviction, and restores it on launch.
  - `biometric.ts` — Face ID / Touch ID / fingerprint unlock; password held only behind the OS
    biometric gate, never in app storage.
  - `autoLock.ts` — inactivity timeout (reuses `autoLockMinutes`) + lock‑on‑background.
  - `sendConfirmation.ts` — frozen "confirm == sign" model with address/network/amount validation.
  - `index.ts` — `initMobile()` single wiring entry point; keeps the shared wallet‑core free of any
    Capacitor imports.
- **OS‑level transport enforcement**: Android `network_security_config.xml` (cleartext banned, dev
  loopback carve‑out) and iOS ATS snippet (`NSAllowsArbitraryLoads=false`).
- **Tests** (vitest): node‑endpoint validation, send‑confirmation flow, secure‑storage + seed‑vault,
  **real WASM crypto** (encrypt/decrypt round‑trip, wrong‑password rejection, 24‑word create/import,
  `keryx:` address prefix), and a static **no‑secrets‑in‑logs** guard.
- **Docs**: `MOBILE_ARCHITECTURE.md`, `MOBILE_SECURITY.md`, `MOBILE_BUILD.md`, this changelog.

### Security
- No secret (seed, mnemonic, password, private key, raw signing data) is logged or persisted in
  plaintext. Cryptography is the audited wallet‑core, not a re‑implementation.
- Mobile requires a `wss://` node endpoint for remote connections.

### Not yet done / known gaps
- Native platforms are not generated in this scaffold (`npx cap add android|ios` on the target OS).
- Touch/responsive polish of the reused desktop screens is pending.
- App‑switcher redaction native flags (`FLAG_SECURE` / iOS cover view) are documented manual steps.
- No signed release builds; iOS build requires macOS + Xcode.

### Added (increment 2 — node/price/trade/donate + AI-ready nav)
- **Automatic node selection with failover** (`src/mobile/nodes.ts`): official `wss://` candidates
  from `VITE_KERYX_NODES`/`OFFICIAL_NODES`, picks the first reachable+synced+`--utxoindex` node.
  Manual endpoint entry moved out of the main flow into Advanced/Developer.
- **Automatic KRX price** (`src/mobile/price.ts`): NonKYC public ticker (`KRX_USDT`), no source
  picker, advisory display only; `krxToUsd()` helper.
- **Trade KRX** (`src/mobile/externalLinks.ts`): opens NonKYC (app scheme if available, else the
  referral link) in the system browser; block-explorer tx/address links from keryx-labs.com.
- **Donate**: address surfaced only under About → Support development.
- **AI-ready navigation** (`src/mobile/features.ts`): feature flags + section registry with a
  reserved, disabled `AI` tab (pay-per-inference client design documented, not implemented).
- Deps: `@capacitor/browser`, `@capacitor/app-launcher`. Tests: nodes failover, external links,
  price parsing, nav flags (total 42 passing).

### Open items
- **Official public `wss://` node URL(s)** needed to fill `OFFICIAL_NODES` / `VITE_KERYX_NODES` —
  required before a real phone can read balances or broadcast.
- React shell wiring of `initMobile()` + mobile bottom-nav is the next step (see MOBILE_BUILD.md).

### Changed (increment 3 — REST Gateway as the default network layer)
- **Node endpoint removed from the normal user flow.** The wallet now defaults to the **Keryx REST
  Gateway** (`https://keryx-labs.com/api/v1`) for reads + broadcast. No node setup for users.
- **`ChainProvider` abstraction** (`src/mobile/chain/`): `RestGatewayProvider` (default) +
  `DirectNodeProvider` (reserved stub for a future Advanced wRPC/`wss://` mode). The wss node
  auto-select/validation is retained for that Advanced path only.
- **REST reads** (`restGateway.ts`): info, balance, utxos, address/history, transaction — shapes
  verified live; amounts parsed to `bigint`.
- **Broadcast** (`broadcast.ts`): snake_case body reverse-engineered against the live gateway and
  verified (node accepted the schema, rejecting only a throwaway orphan). u64 serialized as bare
  integer literals (lossless above 2^53).
- **Local signer** (`signer.ts`): reuses the SDK's `createTransaction`/`calculateTransactionFee`/
  `signTransaction` offline; emits the broadcast body. No crypto re-implemented; keys never leave
  the device. Covered by a real-WASM test.
- Tests: broadcast mapping + bigint-safety, REST parsers (recorded real responses), offline
  sign→body e2e (real WASM). **Total 51 passing across 12 suites.**

### Resolved
- The earlier open item "official public `wss://` node URL(s) needed" is **no longer a blocker** for
  the MVP — the REST Gateway is the default. wss:// node URLs are only needed if/when the optional
  DirectNode mode is enabled.

### Added (increment 4 — working React shell + REST wallet-core)
- **REST-backed wallet-core** (`src/mobile/wallet/`): `mobileWallet.ts` (create/import, unlock with
  wrong-password rejection, balance, history, local-sign send, wipe), `derivation.ts` (HD receive/
  change keys+addresses, matching desktop), `wasm.ts` (WASM bootstrap + `keryx:` prefix check).
- **React mobile shell** (`src/mobile/ui/`): `WalletProvider` (state/actions), `MobileApp` (phase
  machine + bottom nav from `features.ts`), and screens Onboarding / Unlock / Home / Send / Receive /
  Activity / Settings. Entry `src/main.mobile.tsx`.
- Send flow: form → confirm (freeze) → password → **local sign** (`signSpend`) → REST `broadcast`.
- Home shows balance + auto USD (NonKYC) + Trade; Receive shows QR; Activity links to the explorer;
  Settings has biometric enable, About→Donate, and wallet removal.
- Tests: `mobileWallet` (create→unlock→send over a fake chain, real WASM) + `format` helpers.
  **Total 60 passing across 14 suites.** Whole app graph bundles cleanly (esbuild import/export check).

### Still to do
- Run `npm install && npm run build` on your machine (full `tsc` type-check) and `npx cap add android`
  for the APK; apply `FLAG_SECURE` / `allowBackup=false` / ATS as documented.
- HD scan currently uses a fixed window (20 receive + 20 change); extend to a proper gap-limit scan.
- On-device pass: biometric plugin binding, WKWebView eviction soak (iOS), real send against mainnet.
