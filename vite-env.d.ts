/// <reference types="vite/client" />

declare module "*.wasm?url" {
  const src: string;
  export default src;
}

declare module "*.png" {
  const src: string;
  export default src;
}

// Mobile build-time environment variables (all optional).
interface ImportMetaEnv {
  /** "true" allows plaintext ws:// to a loopback host on-device (developer builds only). */
  readonly VITE_ALLOW_LOOPBACK_WS?: string;
  /** Comma-separated official wss:// node endpoints, e.g. "wss://a:23110,wss://b:23110". */
  readonly VITE_KERYX_NODES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
