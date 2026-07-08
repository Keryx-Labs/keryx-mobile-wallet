# Keryx Wallet — Mobile Architecture

This document records the audit of the desktop wallet, the framework decision for Android/iOS, and
how the mobile app is structured. It is the companion to [`MOBILE_SECURITY.md`](./MOBILE_SECURITY.md)
and [`MOBILE_BUILD.md`](./MOBILE_BUILD.md).

---

## 1. Audit of the desktop wallet

Source audited: `Keryx-Labs/keryx-desktop-wallet` @ `v0.1.2` (commit `3c8dae3`).

### 1.1 Stack & repository shape

| Layer | What it is |
| --- | --- |
| Native shell | **Tauri v2** (`src-tauri/`). `src/main.rs` is 6 lines, `src/lib.rs` 22 lines — it launches the WebView and registers **no custom Rust commands**. |
| Frontend | **React 18 + TypeScript + Tailwind + Vite** (`src/`). |
| Wallet‑core | **Keryx wallet‑core compiled to WASM** — the Kaspa SDK — in `src/sdk/` (`kaspa.js`, `kaspa.d.ts`, `kaspa_bg.wasm`, ~11 MB). Version `1.2.6`. |
| Contract | `SDK_CONTRACT.md` pins the exact SDK calls the GUI is allowed to use. |

**The single most important finding: the Rust/native layer does nothing wallet‑related.** Every
wallet operation — key derivation, encryption, storage, signing, node RPC — happens inside the
WebView, in TypeScript calling the WASM SDK. The whole app is effectively a browser app in a native
window. This dominates the mobile decision (§3).

### 1.2 Wallet lifecycle (verified in `src/lib/wallet.ts`, a 2004‑line `WalletService` singleton)

- **Create** (`create()` → `finishCreate()`): `kaspa.Mnemonic.random(24)` produces a 24‑word phrase,
  shown for backup *before* anything is persisted. Then `walletCreate` + `prvKeyDataCreate({mnemonic})`
  + `accountsCreate({type:"bip32"})`. Coin type `m/44'/111111'/0'/0`.
- **Import** (`importMnemonic()`): validates with `Mnemonic.validate`, then the same persist path.
- **Encryption at rest**: the SDK encrypts the seed with **Argon2 → XChaCha20‑Poly1305** and persists
  it in the WebView's **localStorage + IndexedDB**. The app *also* keeps its own password‑encrypted
  copy of the phrase (`kaspa.encryptXChaCha20Poly1305(phrase, password)`) under
  `keryx.wallet.seed.v1`, used for "reveal recovery phrase". No plaintext seed is ever stored.
- **Unlock** (`open()`): `walletOpen({walletSecret:password})` — wrong password throws. Unlock is
  local and fast; network connect/activate/scan run in the background so unlock never hangs.
- **Balance** (`refreshBalanceFromUtxos()` + `balance` events): primarily via SDK events, with a
  manual RPC UTXO‑sum fallback because the high‑level UtxoContext did not always populate.
- **Send** (`send()` → `sendManual()`): notably, the app does **not** use the high‑level
  `accountsSend` (it hung on an empty UtxoContext). It fetches UTXOs from the node, builds, **signs
  locally with keys derived from the decrypted seed**, and submits the raw transaction. Amounts are
  `sompi` (bigint, 1 KRX = 1e8). A send **freezes** the confirmed amounts before signing.
- **Receive**: `receiveAddress` from the account descriptor, plus a capped MetaMask‑style address
  switcher; QR via the `qrcode` package.
- **Node endpoint** (`setNode()`, `testConnection()`): a `kaspa.Wallet` / `RpcClient` over
  **WebSocket**, **Borsh** encoding, default `ws://127.0.0.1:23110`, requires the node to run with
  `--utxoindex` (checked via `getServerInfo().hasUtxoIndex`).

### 1.3 Security posture (desktop)

- **Transport rule (v0.1.1):** remote nodes must use `wss://`; plaintext `ws://` is allowed only to
  loopback. Enforced in `NodeSettingsModal.tsx` (`isLoopbackHost`) *and* in the Tauri CSP
  `connect-src` (`ws://127.0.0.1:* ws://localhost:* wss:`).
- **Logging:** clean. The only `console.*` in app code logs the **address prefix** — never seed,
  key, mnemonic, password, or raw signing data. (Verified by grep; enforced going forward by a test.)
- **Auto‑lock:** `autoLockMinutes` setting (default 5), applied in `App.tsx`.
- **Tauri hardening:** strict CSP, no remote content, `core:default` capabilities only,
  `contentProtected: true`.

---

## 2. Feasibility — how much is reusable?

| Concern | Verdict |
| --- | --- |
| **Cryptography** | **Reuse as‑is.** The WASM SDK runs unmodified in a mobile WebView (verified: `encrypt/decrypt`, `Mnemonic`, address derivation all execute headless). No re‑implementation. |
| **Wallet logic** (`src/lib/wallet.ts`, `settings.ts`) | **Reuse ~verbatim.** It uses only browser APIs (localStorage, IndexedDB, WebSocket, WebCrypto) — all present in WKWebView / Android WebView. |
| **UI** (`src/screens/*`, `src/components/*`) | **Reuse**, with touch/responsive polish and mobile navigation. |
| **Rust/Tauri shell** | **Discard** — it does nothing portable. Replaced by the mobile shell. |
| **Secure storage** | **New.** Desktop leans on OS file perms; mobile must use Keychain/Keystore (§ MOBILE_SECURITY). |
| **Biometrics, background‑lock, app‑switcher redaction** | **New**, mobile‑only. |
| **Node transport** | **Reuse rule, tighten default.** On mobile a phone rarely runs a local node, and iOS ATS / Android cleartext policy block plaintext anyway → mobile requires `wss://` (see §4 risks). |

### Risks & blockers

1. **WKWebView storage eviction (iOS).** WebKit may purge localStorage/IndexedDB under storage
   pressure — which would drop the encrypted seed blob and the SDK's wallet store. Mitigation: mirror
   the *ciphertext* into the Keychain and restore on launch (`seedVault.ts`), and always require the
   user to back up the 24 words. **Blocker‑adjacent; mitigated, needs on‑device soak testing.**
2. **Cleartext transport is effectively banned on mobile.** Mobile users must connect to a `wss://`
   node. This is a *product* requirement: node operators need TLS (or a reverse proxy). Documented.
3. **11 MB WASM.** Fine for a WebView (streamed + cached once) but adds to bundle size and cold‑start;
   irrelevant for React Native/Flutter only because those can't host it anyway (§3).
4. **`accountsSend` hang** is inherited (mitigated by the manual sign/submit path); revisit when the
   SDK is regenerated.
5. **iOS build requires macOS + Xcode**; Android requires the Android SDK/NDK. Neither can be produced
   in a Linux CI‑less sandbox — see MOBILE_BUILD.md.

---

## 3. Framework decision

The deciding constraint is §1.1 + §2: **the wallet is the WASM SDK plus browser‑API glue, and the
crypto/storage must not be re‑implemented.** So the question is really *"which shell keeps the SDK
and the existing React code running with the least new attack surface and the best secure‑storage
story?"*

| Option | Reuse of SDK + code | Secure storage / biometric maturity | Build tooling maturity | Verdict |
| --- | --- | --- | --- | --- |
| **Capacitor + React** | **Full** — wraps the exact Vite `dist/` in WKWebView / Android WebView; SDK, localStorage, IndexedDB, WebSocket all native. | **Excellent** — mature Keychain/Keystore + biometric plugins. | **Excellent** — `cap add ios/android`, huge community. | **✅ Chosen** |
| **Tauri Mobile v2** | **Full** — same repo as desktop, same WebView approach. | Thinner — mobile secure‑storage/biometric plugins younger, less battle‑tested for wallets. | Newer/rougher iOS signing & mobile pipeline. | Close #2 |
| **React Native** | **Poor** — no DOM: no localStorage/IndexedDB. Would need to re‑bridge the WASM SDK through a JS engine lacking web storage → re‑implement the SDK's entire persistence, risk re‑implementing crypto. | n/a | good | ❌ Violates "don't re‑implement" |
| **Flutter** | **None** — Dart FFI can't host a wasm‑bindgen web module without a JS runtime; storage/crypto rewrite. | n/a | good | ❌ Highest risk/effort |
| **Native Kotlin/Swift** | **None** — 2× the work, no WASM reuse, crypto rewrite. | best | best | ❌ Effort + crypto risk |

**Chosen: Capacitor + React.** Because the desktop Rust layer does nothing, Tauri Mobile's "reuse
the Rust" advantage is moot, and the two remaining WebView options come down to secure‑storage /
biometric plugin maturity and mobile build tooling — both favour Capacitor. Capacitor also points at
the *same* `src/` frontend, so the wallet‑core stays a single shared codebase.

Tauri Mobile is a legitimate runner‑up (single‑repo unification with desktop); if the project later
wants one repo for all three platforms, revisiting it is reasonable. React Native, Flutter and native
are rejected: each forces the WASM SDK out of its browser home and would mean re‑implementing storage
and possibly cryptography — the one thing the brief forbids.

---

## 4. Mobile app structure

```
keryx-mobile-wallet/
├── src/
│   ├── sdk/                 # REUSED, unchanged — Keryx wallet-core WASM (kaspa.*)
│   ├── lib/                 # REUSED from desktop — wallet.ts, settings.ts (browser-API only)
│   ├── screens/, components/# REUSED from desktop UI (to be touch-polished)
│   └── mobile/              # NEW — the only platform layer
│       ├── platform.ts         # native/web + capability detection
│       ├── nodeValidation.ts   # strict wss:// transport rule (shared source of truth)
│       ├── secureStore.ts      # Keychain / Keystore abstraction (+ web fallback)
│       ├── seedVault.ts        # mirror encrypted seed → secure storage (eviction durability)
│       ├── biometric.ts        # Face ID / Touch ID / fingerprint unlock
│       ├── autoLock.ts         # inactivity + lock-on-background
│       ├── sendConfirmation.ts # "confirm == sign" frozen confirmation model
│       └── index.ts            # initMobile() — the single wiring entry point
├── android/  …/network_security_config.xml   # OS-level cleartext ban (dev loopback carve-out)
├── ios/      Info.plist.ats-snippet.xml       # OS-level ATS policy
├── capacitor.config.ts
└── tests/                  # vitest: node validation, send confirm, secure store, real WASM crypto, no-secrets-in-logs
```

**Reusable module boundary:** everything outside `src/mobile/` is intended to be the *same files* as
desktop (ideally a shared package or a `mobile` branch of the wallet repo — see MOBILE_BUILD.md
"reuse strategy"). `src/mobile/` is the entire mobile‑specific surface. The shared wallet‑core never
imports Capacitor; the app shell calls `initMobile()` and injects mobile behavior. This keeps desktop
unbroken.

---

## 5. Product decisions (node, price, trade, donate, AI)

These refine the original plan based on how the desktop wallet and the Keryx/NonKYC ecosystem actually work (researched, not assumed).

### 5.1 Node endpoint — automatic, hidden by default

Desktop ships **no public resolver**: `DEFAULT_NODE = ws://127.0.0.1:23110` assumes a local node. A phone can't run one, so mobile connects to **official public `wss://` nodes with failover** (`src/mobile/nodes.ts`):

- Candidate list comes from `VITE_KERYX_NODES` (build-time, comma-separated) or the in-code `OFFICIAL_NODES` array. **These must be filled with the project's real endpoints** — we deliberately don't invent hostnames; an empty list routes the user to a first-run node screen.
- `selectHealthyNode()` probes candidates in order (reusing `wallet.testConnection`) and picks the first that is **reachable + synced + `--utxoindex`**. Balances require the UTXO index, so a node without it is skipped.
- Manual entry is **not** in the main flow — it lives in **Settings → Advanced (Developer)** only, still governed by the strict `wss://` rule.

> Open item: the official `wss://` node URL(s). Until provided, the app can't read balances or broadcast on a real phone. This is the single remaining input needed for a runnable Android build.

### 5.2 Market price — automatic, single source

KRX trades primarily on **NonKYC**, whose public REST API needs no key:
`GET https://api.nonkyc.io/api/v2/ticker/KRX_USDT` → `{ last_price, change_percent, ... }`.
`src/mobile/price.ts` polls it once a minute (native HTTP via `CapacitorHttp` to bypass WebView CORS), caches the last value, and exposes `krxToUsd()`. No user-facing source picker. Price is **advisory display only** — it never influences signing. When KRX lists elsewhere, this module is the single place to add a fallback/aggregate.

### 5.3 Trade KRX

A `Trade KRX` action opens NonKYC's KRX/USDT market with the project referral attached
(`src/mobile/externalLinks.ts`). It tries a NonKYC app URL scheme first (if one is ever published and installed), otherwise opens the referral link in the **system browser** (Chrome Custom Tab / SFSafariViewController) — never inside the wallet WebView. No in-app exchange login or trading.

### 5.4 Donate

Voluntary support lives under **About → Support development** only (unobtrusive): a KRX address with copy + QR. No prompts elsewhere.

### 5.5 AI — reserved, not built

Keryx AI is a **decentralized inference network**, not a chat bot: requests are **paid in KRX** (min ~0.3 KRX, fees burned), miners run tiered models (Qwen3 / Gemma-3 / Dolphin-3 / LLaMA-3.3) on CUDA under an **Optimistic Proof-of-Inference** pipeline, results to IPFS + on-chain `AiResponse` txs. So a future AI tab is a **pay-per-inference client** that reuses this wallet's signing path (compose request → set KRX bid → sign+broadcast → await result) — designed only after the wallet is stable. The information architecture already reserves the slot: `src/mobile/features.ts` has an `aiTab` flag (default off) and the nav places "AI" between Activity and Settings, so enabling it later is a one-line change with no restructuring.

---

## 6. Network layer — REST Gateway (default), verified live

**Decision (supersedes §5.1's wss:// requirement for normal users):** the mobile wallet does **not**
require a node endpoint. Its default network layer is the **Keryx REST Gateway** — the public
indexer/gateway (`keryx-api`) that also backs the official Explorer and Web Wallet. Balances, UTXOs
and history are read over HTTPS; a locally-signed transaction is broadcast over HTTPS. The seed,
private keys and password never leave the device and every tx is signed on-device.

### 6.1 Abstraction

`src/mobile/chain/` defines a `ChainProvider` interface (`types.ts`) with two implementations:

- **`RestGatewayProvider`** (`restGateway.ts`) — **default**. `createChainProvider("rest", …)`.
- **`DirectNodeProvider`** — reserved stub for a future Advanced/Developer wRPC (`wss://`) mode. The
  wss node auto-select + validation from §5.1 (`nodes.ts`, `nodeValidation.ts`) is retained for that
  path only; it is no longer on the normal user's flow.

The wallet talks to the chain **only** through `ChainProvider`, so the transport can change without
touching wallet logic.

### 6.2 Verified endpoints (base `https://keryx-labs.com/api/v1`)

All shapes below were confirmed against the live gateway:

| Call | Endpoint | Shape (key fields) |
| --- | --- | --- |
| Network info | `GET /info` | `network`, `last_daa_score`, supply/burn stats |
| Balance | `GET /addresses/:addr/balance` | `{ address, balance_sompi }` |
| UTXOs | `GET /addresses/:addr/utxos` | `[{ transaction_id, index, amount_sompi, script_version, script_public_key, block_daa_score, is_coinbase }]` |
| Address/history | `GET /addresses/:addr` | `{ total_received_sompi, total_tx_count, transactions:[{ tx_id, amount_sompi(signed), is_spend, daa_score, block_hash }] }` |
| Transaction | `GET /transactions/:id` | `{ inputs[], outputs[], confirmations, is_accepted, block{timestamp_ms} }` |
| Broadcast | `POST /broadcast` | see §6.3 |

Amounts are parsed straight into `bigint` (never a lossy JS number).

### 6.3 Broadcast schema (reverse-engineered safely, then verified)

`keryx-api` is private, so the `POST /broadcast` body was determined by building a throwaway signed
tx and probing the live endpoint (a non-existent input → the node rejected it as an *orphan* after
the schema deserialized, proving the shape without spending anything). The gateway expects
**snake_case**:

```json
{ "version": 0,
  "inputs":  [{ "transaction_id": "<hex>", "index": 0, "signature_script": "<hex>",
                "sequence": 0, "sig_op_count": 1 }],
  "outputs": [{ "amount": <u64>, "script_public_key": "<hex>", "script_version": 0 }],
  "lock_time": 0, "subnetwork_id": "<hex>", "gas": 0, "payload": "" }
```

`src/mobile/chain/broadcast.ts` builds this from the SDK's `Transaction.serializeToObject()` and
serializes u64 fields as **bare integer literals** so sompi values above 2^53 are never corrupted.

### 6.4 Local signing (unchanged crypto)

`src/mobile/chain/signer.ts#signSpend()` reuses the **exact** synchronous SDK primitives the desktop
wallet proved out — `createTransaction` → `calculateTransactionFee` (floored at the 0.3 KRX Keryx
minimum) → `signTransaction` — to build and sign entirely on-device, then emits the broadcast body.
No cryptography is re-implemented; the network layer only ever receives the finished signed tx. This
whole path is covered by a real-WASM test (`tests/signerBroadcast.test.ts`).

### 6.5 Send flow (mobile)

`getUtxos(address)` (REST) → `buildSendConfirmation()` (freeze amount, validate address/network) →
user confirms/authenticates → `signSpend()` (local) → `chain.broadcast(body)` (REST) → record txid,
refresh via `getAddress()`/`getBalanceSompi()`. Matches how the Web Wallet operates over the same API.
