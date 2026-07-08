# Build a debug APK on Windows. Requires: Node 20+, JDK 17 (JAVA_HOME), Android SDK (ANDROID_HOME).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
npm install --no-audit --no-fund
npm run build
npx cap sync android
Set-Location android
.\gradlew.bat --no-daemon assembleDebug
Write-Host "APK: android\app\build\outputs\apk\debug\app-debug.apk"
