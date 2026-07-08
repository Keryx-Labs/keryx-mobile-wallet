#!/usr/bin/env bash
# Build a debug APK locally. Requires: Node 20+, JDK 17, Android SDK (ANDROID_HOME set).
set -euo pipefail
cd "$(dirname "$0")"
npm install --no-audit --no-fund
npm run build
npx cap sync android
cd android && chmod +x gradlew && ./gradlew --no-daemon assembleDebug
echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
