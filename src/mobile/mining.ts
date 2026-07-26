// Mining insight for miner-mode users. Reproduces the node's HOLDER-REWARD (ratio-reward) rule so a
// miner can see whether they're keeping the full reward or burning part of it by not holding enough
// KRX. Formula mirrored VERBATIM from keryx-node `params.rs`: the active table since the H4 /
// coin_age activation is the V2 bracket set (`RATIO_REWARD_BPS_V2` / `RATIO_REWARD_THRESHOLDS_V2`).
//
// keep_bps(balance, production): bracket i is reached iff `balance >= thresholds[i] * production`,
// thresholds ascending, first failure ends the scan. `production` is the address's coinbase output
// over the trailing RATIO_REWARD_WINDOW, FLOORED at one block subsidy. All values in sompi.
//
// NOTE: `production` here is estimated from coinbase UTXOs currently on the wallet within the window
// (the gateway's history doesn't flag coinbase). It's close for a typical miner but shifts after a
// consolidation or withdrawal — so the keep-rate is surfaced as an estimate. The TIER factor
// (68–100% by GPU/model tier) is a separate multiplier the gateway doesn't expose and is not included.

import type { Utxo } from "./chain";
import { COINBASE_MATURITY } from "./chain";

export const RATIO_REWARD_THRESHOLDS_V2 = [0, 3, 7, 15, 30, 45, 60, 75, 90] as const;
export const RATIO_REWARD_BPS_V2 = [5000, 5500, 6000, 6500, 7000, 7500, 8000, 9000, 10000] as const;
export const RATIO_REWARD_WINDOW_DAA = 864_000n; // 24h at 10 BPS
export const BPS_DIVISOR = 10_000;

/** Exact holder keep-rate in basis points for a balance and windowed production (both sompi). */
export function holderKeepBps(balanceSompi: bigint, productionSompi: bigint): number {
  const prod = productionSompi > 0n ? productionSompi : 1n;
  let bps: number = RATIO_REWARD_BPS_V2[0];
  for (let i = 0; i < RATIO_REWARD_THRESHOLDS_V2.length; i++) {
    if (balanceSompi >= BigInt(RATIO_REWARD_THRESHOLDS_V2[i]) * prod) bps = RATIO_REWARD_BPS_V2[i];
    else break;
  }
  return bps;
}

/** The next bracket up and the total balance needed to reach it — or null if already at 100%. */
export function nextHolderBracket(
  balanceSompi: bigint,
  productionSompi: bigint
): { keepBps: number; needBalanceSompi: bigint } | null {
  const prod = productionSompi > 0n ? productionSompi : 1n;
  for (let i = 0; i < RATIO_REWARD_THRESHOLDS_V2.length; i++) {
    const need = BigInt(RATIO_REWARD_THRESHOLDS_V2[i]) * prod;
    if (balanceSompi < need) return { keepBps: RATIO_REWARD_BPS_V2[i], needBalanceSompi: need };
  }
  return null; // already at the top bracket (100%)
}

export interface MiningSummary {
  minedInWindowSompi: bigint; // coinbase received on this wallet within the window (unspent)
  rewardCoins: number; // total coinbase UTXOs held
  maturingCoins: number; // coinbase UTXOs not yet spendable (< COINBASE_MATURITY)
  windowProductionSompi: bigint; // production floored at one block subsidy (input to the ratio)
}

/** Summarize the wallet's mining rewards from its coinbase UTXOs. */
export function miningSummary(
  utxos: Utxo[],
  currentDaaScore: bigint,
  oneSubsidySompi: bigint
): MiningSummary {
  const coinbase = utxos.filter((u) => u.isCoinbase);
  const inWindow = coinbase.filter((u) => currentDaaScore - u.blockDaaScore <= RATIO_REWARD_WINDOW_DAA);
  const minedInWindow = inWindow.reduce((s, u) => s + u.amountSompi, 0n);
  const maturing = coinbase.filter((u) => currentDaaScore - u.blockDaaScore < COINBASE_MATURITY).length;
  const floor = oneSubsidySompi > 0n ? oneSubsidySompi : 1n;
  return {
    minedInWindowSompi: minedInWindow,
    rewardCoins: coinbase.length,
    maturingCoins: maturing,
    windowProductionSompi: minedInWindow > floor ? minedInWindow : floor,
  };
}
