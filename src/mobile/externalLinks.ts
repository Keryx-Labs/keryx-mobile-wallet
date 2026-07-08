// External links — Trade KRX, block explorer, and donate.
//
// Trade opens NonKYC in an ISOLATED but PERSISTENT in-app WebView (@capacitor/inappbrowser):
// clearCache/clearSessionCache are forced to false, so cookies + session survive across opens (a
// NonKYC login stays signed in), while its storage stays isolated from the wallet (the exchange can
// never reach wallet keys/seed). Explorer/donate use the system browser.

export const NONKYC_REF = "https://nonkyc.io?ref=6a2fc9c10644830832093e2e";
export const NONKYC_MARKET_KRX = "https://nonkyc.io/market/KRX_USDT?ref=6a2fc9c10644830832093e2e";

const EXPLORER_TX = "https://keryx-labs.com/tx/%txid%";
const EXPLORER_ADDR = "https://keryx-labs.com/address/%addr%";

export const DONATE_ADDRESS =
  "keryx:qprqmwptzgkqea3uw34rlgzwa998keh9j0mattq367pduh895cvuv0hn5a3dd";

export function explorerTxUrl(txid: string): string {
  return EXPLORER_TX.replace("%txid%", encodeURIComponent(txid));
}
export function explorerAddressUrl(address: string): string {
  return EXPLORER_ADDR.replace("%addr%", encodeURIComponent(address));
}

async function openInSystemBrowser(url: string): Promise<void> {
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url, presentationStyle: "popover" });
  } catch {
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** Open in an isolated + PERSISTENT in-app WebView (session/cookies kept). False if unavailable. */
async function openPersistentWebView(url: string): Promise<boolean> {
  try {
    const mod = await import("@capacitor/inappbrowser");
    await mod.InAppBrowser.openInWebView({
      url,
      options: {
        ...mod.DefaultWebViewOptions,
        // Keep cookies + session between visits so the NonKYC login persists.
        clearCache: false,
        clearSessionCache: false,
        showURL: false,
        showToolbar: true,
        closeButtonText: "Close",
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Trade KRX: open NonKYC's KRX/USDT market (with referral) in an isolated, session-persistent in-app
 * WebView so a login stays signed in — subsequent taps land straight on the trading page. Falls back
 * to the system browser on web / if the in-app browser is unavailable.
 */
export async function openTradeKrx(isNative: boolean): Promise<void> {
  if (isNative && (await openPersistentWebView(NONKYC_MARKET_KRX))) return;
  await openInSystemBrowser(NONKYC_MARKET_KRX);
}

export async function openExplorerTx(txid: string): Promise<void> {
  await openInSystemBrowser(explorerTxUrl(txid));
}

export async function openExplorerAddress(address: string): Promise<void> {
  await openInSystemBrowser(explorerAddressUrl(address));
}
// --- Community / resource links (shown in Settings) ------------------------------------------------
export type ResourceKind = "github" | "x" | "discord" | "docs" | "bitcointalk" | "web";
export interface ResourceLink {
  kind: ResourceKind;
  label: string;
  url: string;
}
export const RESOURCE_LINKS: ResourceLink[] = [
  { kind: "github", label: "GitHub", url: "https://github.com/Keryx-Labs" },
  { kind: "x", label: "X", url: "https://x.com/Keryx_Labs" },
  { kind: "discord", label: "Discord", url: "https://discord.gg/U9eDmBUKTF" },
  { kind: "docs", label: "Docs", url: "https://keryx-labs.com/whitepaper" },
  { kind: "bitcointalk", label: "BitcoinTalk", url: "https://bitcointalk.org/index.php?topic=5580923.0" },
  { kind: "web", label: "Website", url: "https://keryx-labs.com" },
];

/** Open any external resource link in the system browser. */
export async function openExternalUrl(url: string): Promise<void> {
  await openInSystemBrowser(url);
}
// end of externalLinks.ts
