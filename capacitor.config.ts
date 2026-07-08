import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.keryx.wallet",
  appName: "Keryx Wallet",
  // Vite builds the same React frontend into dist/; Capacitor wraps it in a native WebView.
  webDir: "dist",
  // No live cleartext server in production. `server.url` is intentionally omitted so the app
  // always loads the bundled dist/ over the capacitor:// (Android) / ionic:// (iOS) scheme.
  android: {
    // Block cleartext by default; only wss:// remote + (dev) ws://localhost via network config.
    allowMixedContent: false,
  },
  ios: {
    contentInset: "always",
    // Keychain items are device-only, not synced to iCloud (see native project settings).
  },
  plugins: {
    CapacitorHttp: { enabled: false }, // wallet talks WebSocket (wRPC), not HTTP fetch shims
  },
};

export default config;
