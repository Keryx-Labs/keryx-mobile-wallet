// IPFS result fetch. AI inference results are pinned on the Keryx IPFS gateway (verified live:
// GET https://keryx-labs.com/ipfs/<cid> returns the content). We fetch by the CIDv0 parsed from the
// AiResponse payload. On native we use CapacitorHttp (avoids WebView CORS); on web we use fetch().
// This only ever fetches PUBLIC content addressed by hash — no secrets involved.

export const KERYX_IPFS_GATEWAY = "https://keryx-labs.com/ipfs";

export function ipfsUrl(cid: string, gateway: string = KERYX_IPFS_GATEWAY): string {
  return `${gateway}/${encodeURIComponent(cid)}`;
}

/** Fetch an IPFS object as UTF-8 text. Caps the read so a huge object can't blow up memory. */
export async function fetchIpfsText(
  cid: string,
  isNative: boolean,
  opts: { gateway?: string; maxBytes?: number } = {}
): Promise<string> {
  const url = ipfsUrl(cid, opts.gateway ?? KERYX_IPFS_GATEWAY);
  const max = opts.maxBytes ?? 256 * 1024;
  if (isNative) {
    const { CapacitorHttp } = await import("@capacitor/core");
    const res = await CapacitorHttp.get({ url, headers: { Accept: "text/plain, application/json, */*" } });
    if (res.status < 200 || res.status >= 300) throw new Error(`ipfs http ${res.status}`);
    const text = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    return text.length > max ? text.slice(0, max) : text;
  }
  const res = await fetch(url, { headers: { Accept: "text/plain, application/json, */*" } });
  if (!res.ok) throw new Error(`ipfs http ${res.status}`);
  const text = await res.text();
  return text.length > max ? text.slice(0, max) : text;
}
// end of ipfs.ts
