# Building the iOS app (no Mac hardware required)

The app logic is 100% shared with Android (same React/Capacitor frontend), so nothing needs porting.
Only the native iOS project is platform-specific, and it is generated on demand — the `ios/` folder is
NOT committed (Capacitor regenerates it with `npx cap add ios`, which needs macOS + CocoaPods).

Everything iOS-specific is staged in the repo and applied by `scripts/ios-configure.sh`:

- **Face ID** — adds `NSFaceIDUsageDescription` to `Info.plist` (required by the biometric plugin).
- **App-switcher privacy** — `resources/ios/AppDelegate.swift` blurs the UI while the app is inactive
  so balances/addresses don't leak into the iOS app-switcher snapshot. (iOS has no `FLAG_SECURE`
  equivalent, so full screenshot blocking isn't possible — this covers the app-switcher/background case.)
- **App icon** — `resources/ios/AppIcon.appiconset` (the green Keryx icon, all sizes + 1024 marketing).

## Build in the cloud (no Mac)

A manual GitHub Actions workflow is provided: **Build iOS (unsigned)** (`.github/workflows/ios.yml`).
It is `workflow_dispatch` only (never auto-runs — macOS minutes are billable on private repos).
Trigger it from the Actions tab (or `gh workflow run "Build iOS (unsigned)"`). It runs:
`npm ci -> build -> cap add ios -> scripts/ios-configure.sh -> pod install -> xcodebuild` (simulator,
unsigned — no Apple account needed) to verify the app compiles.

For a signed build (real device / TestFlight) you need an Apple Developer account ($99/yr) and the
signing certificate + provisioning profile added as repo secrets; then switch the xcodebuild step to a
device SDK with signing. Alternatives: Codemagic / Xcode Cloud (also cloud macOS).

## Build on a Mac

```
npm install && npm run build
npx cap add ios
bash scripts/ios-configure.sh
npx cap sync ios
open ios/App/App.xcworkspace   # then Run in Xcode
```
