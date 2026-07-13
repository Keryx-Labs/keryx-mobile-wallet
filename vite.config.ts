import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Mobile build: same React + WASM frontend as desktop, bundled into dist/ for Capacitor to wrap.
//   * base "./"  → assets load over the capacitor:// / ionic:// scheme (no absolute host).
//   * WASM is loaded via `?url` (see src/lib/wallet.ts); Capacitor serves dist/ from the app bundle.
const capStub = resolve(__dirname, "tests/_stubs/capacitor.ts");

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2020",
    assetsInlineLimit: 0, // keep the ~11MB WASM as its own streamed+cached asset
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    // Native-only plugins are dynamically imported and never executed in tests; alias them to a stub
    // so the transformer resolves them without the native packages installed. Real builds ignore this.
    alias: {
      "@capacitor/browser": capStub,
      "@capacitor/app-launcher": capStub,
      "@capacitor/app": capStub,
      "@capacitor/core": capStub,
      "@capacitor/preferences": capStub,
      "@capacitor/local-notifications": capStub,
      "@capacitor-mlkit/barcode-scanning": capStub,
      "@capacitor/inappbrowser": capStub,
      "@aparajita/capacitor-secure-storage": capStub,
      "@aparajita/capacitor-biometric-auth": capStub,
    },
  },
});
