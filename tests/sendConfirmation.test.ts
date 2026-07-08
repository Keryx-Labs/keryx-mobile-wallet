import { describe, it, expect } from "vitest";
import { buildSendConfirmation } from "../src/mobile/sendConfirmation";

const base = {
  destAddress: "keryx:qpx2alq86yev9xs3jqf3endplycf27vq3qxf7gaxvxnedacnl7y0xyvwq3slp",
  amountSompi: 150_000_000n, // 1.5 KRX
  feeSompi: 100_000n,
  availableSompi: 1_000_000_000n, // 10 KRX
  addressPrefix: "keryx",
};

describe("send confirmation (what you confirm is what you sign)", () => {
  it("builds a frozen confirmation for valid inputs", () => {
    const r = buildSendConfirmation(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.totalSompi).toBe(base.amountSompi + base.feeSompi);
    // Frozen: the signer cannot be handed a mutated amount.
    expect(Object.isFrozen(r.value)).toBe(true);
    expect(() => {
      // @ts-expect-error runtime mutation must not succeed
      r.value.amountSompi = 999n;
    }).toThrow();
  });

  it("rejects an address for the wrong network", () => {
    const r = buildSendConfirmation({ ...base, destAddress: "kaspa:qxyz" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("wrong-network");
  });

  it("rejects a malformed address", () => {
    const r = buildSendConfirmation({ ...base, destAddress: "not-an-address" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("bad-address");
  });

  it("rejects zero / negative amount", () => {
    expect(buildSendConfirmation({ ...base, amountSompi: 0n }).ok).toBe(false);
  });

  it("rejects when amount + fee exceeds available balance", () => {
    const r = buildSendConfirmation({ ...base, amountSompi: 1_000_000_000n, feeSompi: 100_000n });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("insufficient-funds");
  });
});
