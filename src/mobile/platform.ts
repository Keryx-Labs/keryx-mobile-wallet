// Platform detection + capability flags. Keeps `wallet.ts` (shared with desktop) unaware of
// Capacitor: mobile-only behavior is gated here and injected from the app shell.

import { Capacitor } from "@capacitor/core";

export type PlatformName = "web" | "ios" | "android";

export function platformName(): PlatformName {
  const p = Capacitor.getPlatform();
  return p === "ios" || p === "android" ? p : "web";
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function isIOS(): boolean {
  return platformName() === "ios";
}

export function isAndroid(): boolean {
  return platformName() === "android";
}

/**
 * Whether plaintext ws:// to loopback is permitted. Off on native by default (ATS / cleartext
 * policy would block it anyway); a build-time dev flag can flip it for on-device node work.
 */
export function allowLoopbackWs(): boolean {
  if (!isNative()) return true; // desktop/web dev keeps the desktop behavior
  return import.meta.env.VITE_ALLOW_LOOPBACK_WS === "true";
}
