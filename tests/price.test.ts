import { describe, it, expect } from "vitest";
import { parseTicker, krxToUsd } from "../src/mobile/price";

describe("KRX price (NonKYC ticker)", () => {
  it("parses a real NonKYC ticker payload", () => {
    const p = parseTicker(
      { last_price: "0.00071226", change_percent: "-6.16" },
      1_700_000_000_000
    );
    expect(p).not.toBeNull();
    expect(p!.usd).toBeCloseTo(0.00071226, 8);
    expect(p!.changePercent).toBe(-6.16);
  });

  it("rejects a missing / non-positive price", () => {
    expect(parseTicker({}, 1)).toBeNull();
    expect(parseTicker({ last_price: "0" }, 1)).toBeNull();
    expect(parseTicker({ last_price: "not-a-number" }, 1)).toBeNull();
  });

  it("tolerates a missing change_percent", () => {
    const p = parseTicker({ last_price: "0.0007" }, 1);
    expect(p!.changePercent).toBeNull();
  });

  it("converts KRX holdings to a USD string", () => {
    const price = { usd: 0.00071226, changePercent: null, at: 1 };
    expect(krxToUsd(0, price)).toBe("$0.00");
    expect(krxToUsd(10000, price)).toBe("$7.12"); // 10000 * 0.00071226 = 7.1226
    expect(krxToUsd(100, price)).toBe("$0.0712");
    expect(krxToUsd(100, null)).toBeNull();
  });
});
