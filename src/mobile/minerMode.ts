// "I own a miner" opt-in. Miners receive many small coinbase payouts, so the Consolidate action is
// useful to them but noise for everyone else. This is a local, non-sensitive UI preference — off by
// default, stored on-device only (no network, no privacy impact).

const KEY = "keryx.minerMode.v1";

export function isMinerMode(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setMinerMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
}
