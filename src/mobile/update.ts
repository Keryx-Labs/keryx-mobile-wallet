// In-app update check for the sideloaded (GitHub Releases) Android build.
//
// The app is distributed as a signed APK on GitHub, not via a store, so it has no OS auto-update.
// This module reads ONLY the public GitHub Releases API, compares the latest published version to the
// running app's version, and — if newer — lets the UI show a banner linking to the release page. It
// never downloads or installs anything itself; tapping "Update" just opens the release page in the
// system browser, where the user downloads the APK manually. No secrets, no writes, read-only network.

const REPO = "Keryx-Labs/keryx-mobile-wallet";
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;
// We build the destination URLs OURSELVES from the tag rather than trusting URLs echoed back by the
// API response — so a tampered API body can never point the user at an unexpected host.
const RELEASES_BASE = `https://github.com/${REPO}/releases`;

const DISMISS_KEY = "keryx.update.dismissed.v1";

export interface UpdateInfo {
  /** Version without the leading "v" (e.g. "1.0.2"). */
  version: string;
  /** Original tag (e.g. "v1.0.2"). */
  tag: string;
  /** Canonical release page (constructed locally, not from the API body). */
  url: string;
  /** Release notes (markdown) as published; may be empty. */
  notes: string;
}

/** Split a version string into numeric components ("v1.0.2" -> [1,0,2]). Non-numeric parts are dropped. */
export function parseVersion(s: string): number[] {
  return String(s)
    .trim()
    .replace(/^v/i, "")
    .split(/[.\-+]/)
    .map((x) => parseInt(x, 10))
    .filter((n) => !Number.isNaN(n));
}

/** True if `latest` is a strictly higher version than `current`. */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** The running app's version (from the native package). Falls back to null off-device / on error. */
export async function currentAppVersion(): Promise<string | null> {
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    return info.version || null;
  } catch {
    return null;
  }
}

/** Fetch the latest published release. Returns null on any error (offline, rate-limited, etc.). */
export async function fetchLatestRelease(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(LATEST_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    const tag = typeof j?.tag_name === "string" ? j.tag_name : null;
    if (!tag) return null;
    return {
      version: tag.replace(/^v/i, ""),
      tag,
      url: `${RELEASES_BASE}/tag/${encodeURIComponent(tag)}`,
      notes: typeof j?.body === "string" ? j.body : "",
    };
  } catch {
    return null;
  }
}

/**
 * Resolve whether an update is available for the running app. Returns the update info only when the
 * latest published version is strictly newer than the installed one. Returns null when up to date,
 * when the version can't be determined (e.g. web/dev), or on any network error.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const current = await currentAppVersion();
  if (!current) return null; // no reliable current version (web/dev) — nothing to compare against
  const latest = await fetchLatestRelease();
  if (!latest) return null;
  return isNewer(latest.version, current) ? latest : null;
}

/** Whether the user already dismissed the banner for this exact version. */
export function isUpdateDismissed(version: string): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === version;
  } catch {
    return false;
  }
}

/** Remember that the banner for this version was dismissed (a newer version will show again). */
export function dismissUpdate(version: string): void {
  try {
    localStorage.setItem(DISMISS_KEY, version);
  } catch {
    /* non-fatal */
  }
}
