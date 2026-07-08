import { describe, it, expect } from "vitest";
import { formatKrx, krxToSompi, shortAddr } from "../src/mobile/ui/format";

describe("KRX formatting", () => {
  it("formats sompi to KRX, trimming trailing zeros", () => {
    expect(formatKrx(100_000_000n)).toBe("1");
    expect(formatKrx(150_000_000n)).toBe("1.5");
    expect(formatKrx(0n)).toBe("0");
    expect(formatKrx(-4_728_407_992_800n)).toBe("-47284.0799");
    expect(formatKrx(1n)).toBe("0"); // below 4dp display precision
    expect(formatKrx(1n, 8)).toBe("0.00000001");
  });

  it("parses KRX strings to sompi losslessly", () => {
    expect(krxToSompi("1")).toBe(100_000_000n);
    expect(krxToSompi("1.5")).toBe(150_000_000n);
    expect(krxToSompi("0.00000001")).toBe(1n);
    expect(krxToSompi("12345.6789")).toBe(1_234_567_890_000n);
  });

  it("round-trips format ∘ parse", () => {
    for (const s of ["1", "0.5", "1234.5678", "0.00000001"]) {
      expect(formatKrx(krxToSompi(s), 8).replace(/\.?0+$/, "") || "0").toBe(s.replace(/\.?0+$/, "") || "0");
    }
  });

  it("rejects invalid amounts", () => {
    for (const bad of ["", ".", "abc", "1.234567890", "-1", "1e5"]) {
      expect(() => krxToSompi(bad)).toThrow();
    }
  });

  it("shortens long addresses", () => {
    const a = "keryx:" + "q".repeat(60);
    expect(shortAddr(a, 6)).toBe("keryx:qqqqqq…qqqqqq");
    expect(shortAddr("keryx:short")).toBe("keryx:short");
  });
});
