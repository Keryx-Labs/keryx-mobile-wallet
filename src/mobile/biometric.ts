// Biometric / device-passcode unlock. Biometrics never replace the password in the crypto path — the
// seed is always encrypted under the password. After the user opts in, the password is stored in the
// OS secure enclave (Keystore/Keychain) and released only behind a fingerprint / face prompt.
//
// Persistence is made robust two ways:
//   * The "enabled" FLAG is kept in @capacitor/preferences (SharedPreferences) — reliable, non-secret.
//   * Enabling VERIFIES the secret round-trips through secure storage; if the device fails to persist
//     it, we refuse to enable and surface a clear error (instead of silently "forgetting" on restart).

import type { SecureStore } from "./secureStore";

const BIO_SECRET_KEY = "biometric.secret.v1";
const BIO_FLAG_KEY = "keryx.bio.enabled.v1";

export interface BiometricAvailability {
  available: boolean;
  reason?: string;
}

export async function biometricAvailable(isNative: boolean): Promise<BiometricAvailability> {
  if (!isNative) return { available: false, reason: "not-native" };
  try {
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    const info = await BiometricAuth.checkBiometry();
    return info.isAvailable
      ? { available: true }
      : { available: false, reason: (info as any).reason || "unavailable" };
  } catch {
    return { available: false, reason: "plugin-missing" };
  }
}

/**
 * Actively prompt for biometrics (fingerprint / face). Used to ENABLE (proves it works now) and to
 * UNLOCK. Throws a BiometryError on failure/cancel. Default strength is "weak" so face is accepted.
 */
export async function promptBiometric(isNative: boolean, reason: string): Promise<void> {
  if (!isNative) throw new Error("Biometrics are only available on a device.");
  const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
  // checkBiometry() must be called once before authenticate(), but it can hang on some devices —
  // time-box it (3s) so a stuck probe never blocks the actual fingerprint/face dialog from appearing.
  try {
    await Promise.race([
      BiometricAuth.checkBiometry(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("checkBiometry timeout")), 3000)),
    ]);
  } catch {
    /* ignore — authenticate() below is the real gate */
  }
  // Single line only: the OS sheet already shows the app name ("Keryx Wallet"), so we set just the
  // action as the title and omit the subtitle to avoid the duplicated-title look.
  await BiometricAuth.authenticate({
    reason,
    androidTitle: reason,
    cancelTitle: "Cancel",
    allowDeviceCredential: false,
  });
}

export function friendlyBiometryError(e: unknown): string {
  const code = (e as any)?.code as string | undefined;
  switch (code) {
    case "biometryNotEnrolled":
      return "No fingerprint or face is set up for apps on this phone yet. Add one in your phone's Settings → Security, then try again.";
    case "biometryNotAvailable":
      return "This device doesn't support biometric unlock.";
    case "biometryLockout":
      return "Too many attempts. Unlock your phone normally, then try again.";
    case "userCancel":
    case "systemCancel":
    case "appCancel":
      return "Cancelled.";
    default:
      return (e instanceof Error ? e.message : String(e)) || "Biometric prompt failed.";
  }
}

// --- persistent enabled flag (Preferences) --------------------------------------------------------
async function setEnabledFlag(on: boolean): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    if (on) await Preferences.set({ key: BIO_FLAG_KEY, value: "1" });
    else await Preferences.remove({ key: BIO_FLAG_KEY });
  } catch {
    /* non-fatal */
  }
}

/**
 * Opt in: store the password in secure storage AND verify it round-trips (so we never "enable" on a
 * device that silently fails to persist). Throws if the secret can't be read back.
 */
export async function enableBiometricUnlock(store: SecureStore, password: string): Promise<void> {
  await store.set(BIO_SECRET_KEY, password);
  const back = await store.get(BIO_SECRET_KEY);
  if (back !== password) {
    throw new Error(
      "Secure storage on this device didn't keep the credential, so biometric unlock can't be enabled."
    );
  }
  await setEnabledFlag(true);
}

export async function disableBiometricUnlock(store: SecureStore): Promise<void> {
  await store.remove(BIO_SECRET_KEY);
  await setEnabledFlag(false);
}

/** Whether biometric unlock is enabled — reads the reliable Preferences flag. */
export async function isBiometricUnlockEnabled(_store: SecureStore): Promise<boolean> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: BIO_FLAG_KEY });
    return value === "1";
  } catch {
    return false;
  }
}

/**
 * Prompt for biometrics and, on success, return the stored password so the caller can
 * `wallet.unlock(password)`. Returns null if no credential is stored. Never logs the result.
 */
export async function unlockWithBiometrics(
  store: SecureStore,
  isNative: boolean
): Promise<string | null> {
  if (!isNative) return null;
  await promptBiometric(isNative, "Unlock your Keryx wallet");
  return store.get(BIO_SECRET_KEY);
}
// end of biometric.ts
