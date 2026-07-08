// Auto-lock controller for mobile.
//
// Two triggers, both calling the same `onLock` (which runs `wallet.lock()`):
//   1. Inactivity timeout — reuses the desktop `autoLockMinutes` setting (0 = disabled).
//   2. App backgrounding — on mobile, leaving the app is a strong lock signal. We lock immediately
//      (or after a short grace period) when the app is backgrounded, and also blur/redact the UI so
//      the app switcher snapshot doesn't leak balances/addresses.
//
// The Capacitor App plugin is imported lazily so this file loads in Node for tests.

export interface AutoLockOptions {
  inactivityMinutes: number; // 0 disables the inactivity timer
  lockOnBackground: boolean; // lock as soon as the app leaves the foreground
  backgroundGraceMs?: number; // optional grace before background-lock (default 0 = immediate)
  onLock: () => void;
}

export class AutoLock {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private bgTimer: ReturnType<typeof setTimeout> | null = null;
  private removeAppListener: (() => void) | null = null;
  private started = false;

  constructor(private opts: AutoLockOptions) {}

  async start(isNative: boolean): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.arm();
    if (isNative && this.opts.lockOnBackground) {
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) this.onBackground();
        else this.onForeground();
      });
      this.removeAppListener = () => handle.remove();
    }
  }

  /** Call on any user interaction to reset the inactivity timer. */
  notifyActivity(): void {
    if (!this.started) return;
    this.arm();
  }

  updateInactivityMinutes(minutes: number): void {
    this.opts.inactivityMinutes = minutes;
    this.arm();
  }

  private arm(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const m = this.opts.inactivityMinutes;
    if (m > 0) {
      this.timer = setTimeout(() => this.opts.onLock(), m * 60_000);
    }
  }

  private onBackground(): void {
    const grace = this.opts.backgroundGraceMs ?? 0;
    if (grace <= 0) {
      this.opts.onLock();
      return;
    }
    if (this.bgTimer) clearTimeout(this.bgTimer);
    this.bgTimer = setTimeout(() => this.opts.onLock(), grace);
  }

  private onForeground(): void {
    if (this.bgTimer) {
      clearTimeout(this.bgTimer);
      this.bgTimer = null;
    }
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.bgTimer) clearTimeout(this.bgTimer);
    this.timer = this.bgTimer = null;
    this.removeAppListener?.();
    this.removeAppListener = null;
    this.started = false;
  }
}
