// @vitest-environment node
//
// Holder-reward (ratio-reward) math must exactly reproduce keryx-node params.rs
// (RATIO_REWARD_BPS_V3 / RATIO_REWARD_THRESHOLDS_V3, active since H15).
// A wrong keep-rate would mislead miners about how much of their reward is burning.

import { describe, it, expect } from "vitest";
import {
  holderKeepBps,
  nextHolderBracket,
  miningSummary,
  RATIO_REWARD_WINDOW_DAA,
} from "../src/mobile/mining";
import type { Utxo } from "../src/mobile/chain";

const cb = (amountKrx: number, daa: bigint, isCoinbase = true): Utxo => ({
  address: "keryx:test",
  transactionId: "t",
  index: 0,
  amountSompi: BigInt(Math.round(amountKrx * 1e8)),
  scriptVersion: 0,
  scriptPublicKey: "00",
  blockDaaScore: daa,
  isCoinbase,
});

describe("holder keep-rate brackets (V3)", () => {
  it("maps balance ÷ production to the exact V3 bracket", () => {
    const prod = 100n; // sompi
    // thresholds [0,10,...,120] → bps [500,1000,2000,...,8000,8500,9000,9500,10000]
    expect(holderKeepBps(0n, prod)).toBe(500); // 0× → 5%
    expect(holderKeepBps(999n, prod)).toBe(500); // just under 10×
    expect(holderKeepBps(1000n, prod)).toBe(1000); // 10× → 10%
    expect(holderKeepBps(2000n, prod)).toBe(2000); // 20× → 20%
    expect(holderKeepBps(8000n, prod)).toBe(8000); // 80× → 80%
    expect(holderKeepBps(9000n, prod)).toBe(8500); // 90× → 85%
    expect(holderKeepBps(11_999n, prod)).toBe(9500); // just under 120×
    expect(holderKeepBps(12_000n, prod)).toBe(10000); // 120× → 100%
    expect(holderKeepBps(999_999n, prod)).toBe(10000); // capped at 100%
  });

  it("floors production at one unit so a zero-history address can't hit 100% for free", () => {
    expect(holderKeepBps(0n, 0n)).toBe(500);
    expect(holderKeepBps(120n, 0n)).toBe(10000); // 120 ≥ 120×1
  });

  it("nextHolderBracket reports the balance needed for the next step, null at the top", () => {
    const prod = 1000n;
    const at20 = nextHolderBracket(25_000n, prod); // 25× = 20%, next is 30× → 30%
    expect(at20?.keepBps).toBe(3000);
    expect(at20?.needBalanceSompi).toBe(30_000n);
    expect(nextHolderBracket(120_000n, prod)).toBeNull(); // already 100%
  });
});

describe("mining summary from coinbase UTXOs", () => {
  it("sums recent coinbase, counts maturing, floors production at one subsidy", () => {
    const daa = 1_000_000n;
    const oneSubsidy = BigInt(Math.round(5.24 * 1e8));
    const utxos: Utxo[] = [
      cb(5, daa - 1500n), // in window, matured (≥ 1000 DAA)
      cb(5, daa - 100n), // in window, still maturing (< 1000 DAA)
      cb(5, daa - RATIO_REWARD_WINDOW_DAA - 10n), // outside the 24h window
      cb(20, daa - 200n, false), // non-coinbase (received) — ignored
    ];
    const s = miningSummary(utxos, daa, oneSubsidy);
    expect(s.rewardCoins).toBe(3); // three coinbase UTXOs
    expect(s.maturingCoins).toBe(1); // one under COINBASE_MATURITY
    expect(s.minedInWindowSompi).toBe(BigInt(Math.round(10 * 1e8))); // two 5-KRX in window
    expect(s.windowProductionSompi).toBe(BigInt(Math.round(10 * 1e8))); // > one subsidy, so used as-is
  });

  it("uses the subsidy floor when recent mining is below one block", () => {
    const daa = 1_000_000n;
    const oneSubsidy = BigInt(Math.round(5.24 * 1e8));
    const s = miningSummary([cb(1, daa - 50n)], daa, oneSubsidy);
    expect(s.windowProductionSompi).toBe(oneSubsidy); // 1 KRX < 5.24 → floored
  });
});
