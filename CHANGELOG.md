# Changelog — Keryx Mobile Wallet

All notable changes to the mobile app. Format loosely follows Keep a Changelog.

## [1.0.3] — 2026-07-15

### Changed
- **AI model lineup updated to the current H4 network models.** The on-chain lineup switched at the
  H4 hard fork (activation DAA 54,766,000, now passed), so the registry was re-synced from keryx-node
  `params.rs` (`INFERENCE_REWARD_MINIMUMS_V2_H4`): **EXAONE-4.0-1.2B** (0.5), **Mistral-7B-v0.3** (1.0),
  **GLM-4-9B-0414** (1.5, default), **Qwen3.6-27B** (2.5) and **Kimi-Linear-48B** (4.0 KRX min). The
  previous (H2) models were stale and could be rejected by consensus. model_ids and minimum rewards
  are mirrored verbatim; a test locks them in.

### Fixed
- **Immature mining rewards are no longer used when sending or paying for AI inference.** Matching the
  desktop wallet, a freshly-mined coinbase reward that hasn't reached maturity (1000 DAA) is skipped in
  coin selection for Send and AI requests, so a miner's transaction is no longer rejected by the node
  with a "coinbase maturity" error. (Consolidate already did this.)

## [1.0.2] — 2026-07-15

### Added
- **In-app update check.** The sideloaded Android build now checks the public GitHub Releases API on
  launch and shows a dismissible "Update available" banner (per-version dismissal) when a newer
  release is published, plus a "Check for updates" action and the installed version in Settings.
  It reads only the public releases list and never downloads or installs anything — "Update" opens the
  release page in the system browser, where the user installs the new APK manually. URLs are built
  locally from the tag rather than trusted from the API body. Native-only; no-op on web.

## [1.0.1] — 2026-07-15

### Fixed
- **Consolidate now reliably compounds the *whole* eligible UTXO set.** The multi-batch auto-loop
  could stop after the first 80-input batch when a gateway read hiccupped right after a broadcast: a
  partial/failed UTXO fetch was mistaken for "all inputs consumed", ending the loop early (so only ~80
  coins got compounded). The batch-confirmation wait now trusts only a COMPLETE read of the UTXO set
  before advancing, and never treats a failed fetch as an empty wallet — so a large miner wallet is
  swept batch after batch until a single coin remains, as intended. Added a regression test that
  injects a transient read failure mid-run (87 tests pass).

## [0.1.0] — 2026-07-13 (first working Android build)

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

### Added (increment 5 — AI inference tab)
- **On-chain AI inference client** (`src/mobile/ai/`, `ui/screens/Ai*.tsx`): pick a model, pay in
  KRX, and get a verifiable answer. The app builds & **signs an `AiRequest`** (subnetwork `0300`)
  locally, broadcasts via the gateway, discovers the miner's answer through `GET /api/v1/infer`
  (matched by tx id), fetches the result body from the Keryx IPFS gateway (`/ipfs/<cid>`), and fires
  a **local notification** when it's ready.
- **AI request history** (`ai/history.ts`, localStorage `keryx.ai.history.v1`): past interactions are
  listed and tappable to reload the answer; a one-time cost warning that can be dismissed.
- **Demo/screenshot flag** (`VITE_DEMO`) that bootstraps a throwaway state for store/marketing shots.

### Added (increment 6 — UX polish + iOS parity config)
- **UX**: de-duplicated the unlock/biometric prompt, widened the AI layout, moved the Network endpoint
  into **Advanced/Developer**, reworded the biometric toggle to "Biometric unlock enabled", and
  stopped re-locking the wallet when opening external links (Trade / X / website / explorer). Only
  launch-unlock, revealing the recovery phrase, signing/sending, consolidating and submitting an AI
  request now require authorization.
- **Wallet data caching** (`walletCache.ts`, `keryx.cache.overview.v1`): last balance/history render
  instantly on launch, then a background sync (stale-while-revalidate).
- **iOS parity config** (`scripts/ios-configure.sh`, `resources/ios/`): Face ID
  (`NSFaceIDUsageDescription`), app-switcher privacy blur (`AppDelegate.swift` — iOS has no
  `FLAG_SECURE`), camera usage string, the iOS app icon set, and a manual `workflow_dispatch`-only
  macOS build workflow + `docs/IOS_BUILD.md`.

### Added (increment 7 — Consolidate, Send QR scanner, address book, official icon)
- **Consolidate (compound UTXOs)** for miners, reproducing the official desktop behavior researched
  from `keryx-desktop-wallet`: a **self-send** that sweeps the largest UTXOs into a single output,
  spending only the network fee. `signer.ts` adds `consolidateInfo()`/`signConsolidate()` with
  largest-first selection, `MAX_TX_INPUTS = 80`, mass-based min fee, and a **1000-DAA coinbase
  maturity** filter so immature mining outputs are skipped. Gated behind an opt-in **"I own a miner"**
  setting (`minerMode.ts`, `keryx.minerMode.v1`).
- **Send QR scanner** (`qr.ts`, `ui/screens/QrScanner.tsx`): scan a recipient with the camera; parses
  and validates Keryx targets and rejects wrong-network addresses. Never auto-sends.
- **Address book** (`addressBook.ts`, `keryx.addrbook.v1`): local-only saved contacts with labels +
  recent recipients, save-after-send, add/edit/delete, dedupe. No phone-contacts access.
- **Official Keryx app icon** (Android adaptive foreground/background/monochrome + legacy, all
  densities; notification icon `ic_stat_keryx`; iOS `AppIcon.appiconset`) generated from branding.

### Changed (increment 8 — QR native-lib removal, Consolidate multi-batch + UI)
- **Removed the MLKit barcode scanner** in favor of a **pure-JS `jsQR`** decode over the WebView
  camera (`@capacitor/camera` for permission). This drops the native `.so` libraries that triggered
  Android's **16 KB page-size compatibility warning** and ~20 MB of bloat — the APK is back to ~14 MB
  with no native barcode libs.
- **Consolidate is now multi-batch**: one tap consolidates the **entire eligible set**, not just the
  first 80. `MobileWallet.consolidate(password, onProgress)` authorizes once, then loops batch by
  batch — broadcasting, then `waitForBatchConfirmed()` polls the gateway UTXO set until the batch's
  inputs are consumed — until ≤1 mature coin remains, matching the desktop `waitForInputsConsumed`
  loop. Returns `{ txids, batches, remaining, totalInputs, totalFeeSompi }`.
- **Consolidate UI**: a subtle wallet-screen row (`ConsolidateRow.tsx`) — label + merge icon + live
  UTXO **count pill** — with an inline prepare → biometric → broadcast flow and a background count
  refresh; the modal (`Consolidate.tsx`) shows a loading skeleton and live `Batch N · M left`
  progress. The "I own a miner" toggle moved to **Advanced**; recipient add/edit/delete lives in the
  Recipients picker.
- App icon refined to a **full-bleed circular badge** rendered from the official `logo.png`.

### Tests
- Added suites for QR parsing, address book, AI history, wallet cache, Consolidate sizing, and the
  **multi-batch Consolidate loop** (a stateful fake chain that consumes each batch's inputs and adds
  the change output; asserts multiple batches, strictly decreasing progress, and ≤1 UTXO left).
  **86 tests pass; `tsc --noEmit` clean.**

### Shipped
- Built and installed on-device (Pixel 9). Android CI (`.github/workflows/android.yml`) green on push.
