# Keryx Wallet — Mobile Build

How to run, test, and build the Android and iOS apps. The mobile app is **Capacitor + React**; it
reuses the desktop wallet‑core (WASM SDK) unchanged.

## Prerequisites

| For | Need |
| --- | --- |
| Anything | Node 20+, npm |
| Android | Android Studio (SDK + platform‑tools), JDK 17, an emulator or device |
| iOS | **macOS + Xcode 15+**, CocoaPods (`sudo gem install cocoapods`), an Apple Developer account for signing |

> iOS **cannot** be built off macOS. Android APKs need the Android SDK. Neither is produced by this
> scaffold — the scaffold is the app + config; the commands below build it on your machine.

## Install & test (any OS)

```bash
cd keryx-mobile-wallet
npm install
npm test            # vitest: node validation, send-confirm, secure store, REAL WASM crypto, no-secrets
npm run build       # tsc + vite → dist/
```

## Reuse strategy (don't fork the wallet‑core)

The files under `src/sdk`, `src/lib`, `src/screens`, `src/components` are meant to be the **same
code** as the desktop wallet. Two supported layouts:

1. **`mobile` branch of `keryx-desktop-wallet`** (recommended): add `src/mobile/`,
   `capacitor.config.ts`, `android/`, `ios/`, and mobile `package.json`/`vite.config.ts` on a branch;
   desktop `src/` is reused directly. Desktop stays on `main`, untouched.
2. **Shared package**: extract `src/lib` + `src/sdk` into a `@keryx/wallet-core` workspace package
   consumed by both desktop and mobile.

This standalone folder copies the shared files in so it builds and tests on its own; when integrating,
replace the copies with the branch/package reference and keep only `src/mobile/` as new code.

## Add the native platforms

```bash
npm install
npm run build
npx cap add android      # generates android/ native project
npx cap add ios          # macOS only — generates ios/ native project
```

Then apply the security config that this scaffold ships:

- **Android:** copy `android/app/src/main/res/xml/network_security_config.xml` into the generated
  project (path is identical) and reference it in `AndroidManifest.xml`:
  ```xml
  <application android:networkSecurityConfig="@xml/network_security_config"
               android:allowBackup="false" ...>
  ```
  Add `FLAG_SECURE` to the main activity (`getWindow().setFlags(FLAG_SECURE, FLAG_SECURE)`).
- **iOS:** paste `ios/Info.plist.ats-snippet.xml` into `ios/App/App/Info.plist`. In the target's
  Signing & Capabilities, keep Keychain Sharing **off** unless needed; add a cover view on
  `applicationWillResignActive` for app‑switcher redaction.

## Android — build an APK / AAB

```bash
npm run build && npx cap sync android
npx cap open android           # opens Android Studio → Build > Build APK(s)
# or headless (debug APK):
cd android && ./gradlew assembleDebug
#   → android/app/build/outputs/apk/debug/app-debug.apk
# release (signed): configure a keystore, then:
./gradlew assembleRelease      # or bundleRelease for an .aab (Play Store)
```

Install on a device: `adb install app/build/outputs/apk/debug/app-debug.apk`.

## iOS — build (macOS only)

```bash
npm run build && npx cap sync ios
npx cap open ios               # opens Xcode
# In Xcode: select a team for signing, pick a device/simulator, Product > Run / Archive.
```

A distributable `.ipa` comes from Xcode **Product > Archive → Distribute App**.

## Configure the node endpoint

The app requires a Keryx node reachable over **wss://** (mobile blocks plaintext to remote hosts),
Borsh wRPC, started with `--utxoindex`. In Settings, enter `wss://your-node:23110`. For on‑device
local‑node development only, build with `VITE_ALLOW_LOOPBACK_WS=true` to permit `ws://localhost`.

## Regenerating the WASM SDK

Follow the desktop `SDK_CONTRACT.md` build recipe, then copy `web/kaspa/*` into `src/sdk/`. Re‑run
`npm test` — the real‑WASM crypto test guards that the contract (encrypt/decrypt, mnemonic, `keryx:`
prefix) still holds.

## Running the app shell (increment 4)

The mobile UI is now wired end-to-end. Entry point: `src/main.mobile.tsx` → `src/mobile/ui/MobileApp.tsx`
(the desktop `main.tsx`/`App.tsx` remain as reused reference, not the mobile entry).

```bash
npm install
npm run dev        # open in a browser to click through onboarding/unlock/home/send/receive/history
npm test           # 60 tests (crypto, REST parsers, offline sign→broadcast, full send path, UI format)
npm run build      # tsc + vite → dist/   (run this on your machine; it also type-checks)
npx cap add android && npx cap sync android && (cd android && ./gradlew assembleDebug)
```

Screens: Onboarding (create / import 24 words → backup → password), Unlock (password + optional
biometric), Home (balance + USD price + address + Trade), Send (form → confirm → password → sign &
broadcast), Receive (address + QR), Activity (history → explorer), Settings (lock, biometric enable,
About/Donate, remove wallet). Bottom nav is driven by `features.ts` (AI tab hidden).

Network is the REST Gateway by default — no node setup. `signSpend` builds+signs locally; only the
signed tx is broadcast.

> Note: this environment validated the app by bundling the whole graph with esbuild (imports/exports
> resolve, all files parse). A full `tsc` type-check runs as part of `npm run build` on your machine.
