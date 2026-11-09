// Activation heights mirrored from the node (and the website chat).

function isTestnet(networkId: string): boolean {
  return networkId === "testnet" || networkId.startsWith("testnet-");
}

/** H14: private requests and a fixed reward per model. */
export function privateInferenceActivationDaa(networkId: string): bigint {
  return isTestnet(networkId) ? 1n : 121_985_000n;
}

/** H15: requests are sealed with key schedule 2. */
export function keySchedule2ActivationDaa(networkId: string): bigint {
  return isTestnet(networkId) ? 3_500n : 140_115_000n;
}
