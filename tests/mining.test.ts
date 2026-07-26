// @vitest-environment node
//
// Holder-reward (ratio-reward) math must exactly reproduce keryx-node params.rs
// (RATIO_REWARD_BPS_V2 / RATIO_REWARD_THRESHOLDS_V2, active since the H4 / coin_age activation).
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

describe("holder keep-rate brackets (V2)", () => {
  it("maps balance ÷ production to the exact V2 bracket", () => {
    const prod = 100n; // sompi
    // thresholds [0,3,7,15,30,45,60,75,90] → bps [5000..10000]
    expect(holderKeepBps(0n, prod)).toBe(5000); // 0×  → 50%
    expect(holderKeepBps(299n, prod)).toBe(5000); // just under 3×
    expect(holderKeepBps(300n, prod)).toBe(5500); // 3×  → 55%
    expect(holderKeepBps(700n, prod)).toBe(6000); // 7×  → 60%
    expect(holderKeepBps(1500n, prod)).toBe(6500); // 15× → 65%
    expect(holderKeepBps(4500n, prod)).toBe(7500); // 45× → 75%
    expect(holderKeepBps(7499n, prod)).toBe(8000); // just under 75×
    expect(holderKeepBps(7500n, prod)).toBe(9000); // 75× → 90%
    expect(holderKeepBps(9000n, prod)).toBe(10000); // 90× → 100%
    expect(holderKeepBps(999999n, prod)).toBe(10000); // capped at 100%
  });

  it("floors production at one unit so a zero-history address can't hit 100% for free", () => {
    // production 0 → floored to 1; a normal balance still lands at the top bracket only if huge
    expect(holderKeepBps(0n, 0n)).toBe(5000);
    expect(holderKeepBps(90n, 0n)).toBe(10000); // 90 ≥ 90×1
  });

  it("nextHolderBracket reports the balance needed for the next step, null at the top", () => {
    const prod = 1000n;
    const at60 = nextHolderBracket(7000n, prod); // 7× = 60%, next is 15× → 65%
    expect(at60?.keepBps).toBe(6500);
    expect(at60?.needBalanceSompi).toBe(15000n);
    expect(nextHolderBracket(90_000n, prod)).toBeNull(); // already 100%
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
