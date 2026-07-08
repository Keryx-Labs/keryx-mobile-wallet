// Test-only stub for native Capacitor plugins. These are loaded via dynamic import() inside
// native-only code paths that the unit tests never execute; the stub just needs to resolve so the
// transformer is happy. Real app builds use the actual installed packages.
export const Browser = { open: async () => {} };
export const AppLauncher = { canOpenUrl: async () => ({ value: false }), openUrl: async () => {} };
export const App = { addListener: async () => ({ remove: () => {} }) };
export const Capacitor = { getPlatform: () => "web", isNativePlatform: () => false };
export const CapacitorHttp = { get: async () => ({ data: {} }) };
export const BiometricAuth = { checkBiometry: async () => ({ isAvailable: false }), authenticate: async () => {} };
export const SecureStorage = {
  get: async () => null, set: async () => {}, remove: async () => {}, keys: async () => [],
};
export const InAppBrowser = { openInWebView: async () => {}, openInSystemBrowser: async () => {} };
export const DefaultWebViewOptions = {};
export const Preferences = { get: async () => ({ value: null }), set: async () => {}, remove: async () => {} };
export default {};
