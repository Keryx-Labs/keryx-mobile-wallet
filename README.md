# Keryx Wallet — Mobile (Android / iOS)

A self‑custodial mobile wallet for the **Keryx** network, built on **Capacitor + React** and reusing
the **desktop wallet‑core (WASM SDK) unchanged**. Your keys, seed and password never leave the device.

> Status: **working Android build**. Create/restore wallet, view balance & history, send & receive,
> biometric (fingerprint / face) unlock, live KRX price, Trade (NonKYC), and an on‑chain **AI
> inference** client are all implemented and running on-device. Native projects (`android/`, `ios/`)
> are generated on your machine — see [`docs/MOBILE_BUILD.md`](./docs/MOBILE_BUILD.md).

## Features

- **Self-custodial** — 24-word seed, encrypted on-device (XChaCha20-Poly1305); keys/seed/password never leave the phone and are never logged.
- **Network via the Keryx REST Gateway** (`keryx-labs.com/api/v1`) — no node setup for users; balances, history and broadcast over HTTPS. Transactions are built and **signed locally**; only the signed tx reaches the network.
- **Send / Receive** KRX with QR, fast parallel balance scan, and pull-to-refresh.
- **Biometric unlock** (fingerprint / face) with password fallback, plus auto-lock.
- **Live KRX price** and a **Trade** shortcut to the NonKYC KRX/USDT market.
- **AI Inference tab** — pick a model, pay in KRX, and get a verifiable on-chain answer: the app builds & signs an `AiRequest` (subnetwork `0300`) locally, broadcasts it, discovers the miner's answer via `/api/v1/infer`, fetches the result from the Keryx IPFS gateway, and fires a local notification when it's ready.
- **Community & resources** links (GitHub, X, Discord, Docs, BitcoinTalk) in Settings.

## Why Capacitor

The desktop app is a WebView app: all wallet logic runs in TypeScript over the WASM SDK, using
browser APIs (localStorage, IndexedDB, WebSocket, WebCrypto). Capacitor runs that exact frontend in a
native WebView, so the SDK and crypto are reused verbatim — no re‑implementation. Full rationale and
the Tauri‑Mobile / React‑Native / Flutter / native comparison: [`docs/MOBILE_ARCHITECTURE.md`](./docs/MOBILE_ARCHITECTURE.md).

## Features (MVP target)

Create wallet · import 24‑word recovery phrase · encrypted local storage · password + biometric
unlock · auto‑lock (inactivity + on background) · dashboard balance · receive address + QR · send
with confirm‑before‑sign · configurable `wss://` node endpoint · transaction history · Android & iOS
builds.

## Quick start

```bash
npm install
npm test            # runs the full test suite (incl. real WASM crypto)
npm run build       # dist/
npx cap add android # + npx cap add ios (macOS)
```

## Security

Self‑custodial, seed encrypted at rest (Argon2 → XChaCha20‑Poly1305, via the audited wallet‑core),
secrets never logged, Keychain/Keystore secure storage, and a strict `wss://` transport rule. See
[`docs/MOBILE_SECURITY.md`](./docs/MOBILE_SECURITY.md).

## Node requirement

A Keryx node reachable over **`wss://`** (mobile blocks plaintext to remote hosts), Borsh wRPC
(default port 23110), started with `--utxoindex`.

## Layout

`src/sdk` `src/lib` `src/screens` `src/components` are the **shared** desktop code. `src/mobile/` is
the only mobile‑specific layer. See the architecture doc for the reuse strategy (shared branch /
package) so desktop and mobile stay one wallet‑core.

## License

MIT.
