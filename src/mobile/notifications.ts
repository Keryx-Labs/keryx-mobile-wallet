// Local notifications (no server / no FCM). We fire an OS notification from inside the app when an
// event we're already polling for occurs — currently: an AI answer has arrived. This is reliable
// while the app is foregrounded or recently backgrounded; delivery after the app is fully killed
// would need a push server and is intentionally out of scope for now.
//
// Everything is dynamically imported and native-only, so web/tests never touch the plugin.

let permissionAsked = false;

/** Ask for notification permission once (best-effort). Safe to call repeatedly. */
export async function ensureNotifPermission(isNative: boolean): Promise<boolean> {
  if (!isNative) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    let status = await LocalNotifications.checkPermissions();
    if (status.display !== "granted" && !permissionAsked) {
      permissionAsked = true;
      status = await LocalNotifications.requestPermissions();
    }
    return status.display === "granted";
  } catch {
    return false;
  }
}

/** Fire a "your AI answer is ready" notification. No prompt text or result is included (privacy). */
export async function notifyAiAnswer(
  isNative: boolean,
  info: { model: string }
): Promise<void> {
  if (!isNative) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const granted = (await LocalNotifications.checkPermissions()).display === "granted";
    if (!granted) return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 2_000_000_000),
          title: "Your AI answer is ready",
          body: info.model ? `${info.model} responded — tap to view.` : "Tap to view the result.",
        },
      ],
    });
  } catch {
    /* non-fatal — notifications are a convenience, never a hard dependency */
  }
}
