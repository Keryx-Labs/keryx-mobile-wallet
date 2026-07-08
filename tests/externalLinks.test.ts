import { describe, it, expect } from "vitest";
import { explorerTxUrl, explorerAddressUrl, NONKYC_MARKET_KRX, NONKYC_REF, DONATE_ADDRESS } from "../src/mobile/externalLinks";

describe("external links", () => {
  it("builds explorer tx / address URLs with encoding", () => {
    expect(explorerTxUrl("abc123")).toBe("https://keryx-labs.com/tx/abc123");
    expect(explorerAddressUrl("keryx:qpxyz")).toBe("https://keryx-labs.com/address/keryx%3Aqpxyz");
  });

  it("trade link targets the KRX market and carries the referral", () => {
    expect(NONKYC_MARKET_KRX).toContain("/market/KRX_USDT");
    expect(NONKYC_MARKET_KRX).toContain("ref=6a2fc9c10644830832093e2e");
    expect(NONKYC_REF).toContain("ref=6a2fc9c10644830832093e2e");
  });

  it("donate address is a keryx: address", () => {
    expect(DONATE_ADDRESS.startsWith("keryx:")).toBe(true);
  });
});
