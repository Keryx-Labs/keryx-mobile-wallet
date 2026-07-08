#!/usr/bin/env bash
# iOS parity configuration — apply AFTER `npx cap add ios` (which regenerates ios/) and BEFORE
# `pod install`. Brings the iOS project to parity with Android: Face ID usage string, app-switcher
# privacy blur, and the Keryx app icon. Runs on macOS (locally or in the ios CI job).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/ios/App/App"
PLIST="$APP/Info.plist"

if [ ! -d "$APP" ]; then
  echo "ios/App/App not found — run 'npx cap add ios' first." >&2
  exit 1
fi

echo "- Face ID usage description (Info.plist)"
/usr/libexec/PlistBuddy -c "Delete :NSFaceIDUsageDescription" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :NSFaceIDUsageDescription string 'Use Face ID to unlock your Keryx wallet and confirm transactions.'" "$PLIST"

echo "- App-switcher privacy blur (AppDelegate.swift)"
cp "$ROOT/resources/ios/AppDelegate.swift" "$APP/AppDelegate.swift"

echo "- App icon (AppIcon.appiconset)"
ICON_DST="$APP/Assets.xcassets/AppIcon.appiconset"
rm -rf "$ICON_DST"
cp -R "$ROOT/resources/ios/AppIcon.appiconset" "$ICON_DST"

echo "iOS configuration applied."
