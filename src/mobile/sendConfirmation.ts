// Send confirmation model — "what you confirm is exactly what you sign".
//
// The desktop wallet freezes the confirmed amounts before signing (README security section). This
// module makes that guarantee a small, testable unit for the mobile confirmation screen: it takes
// validated inputs, produces an immutable `SendConfirmation`, and the signing call must be fed the
// SAME frozen object. It also re-runs address/network/amount checks so nothing unvalidated reaches
// the signer. No secrets here — amounts and destination address only.

export interface SendInputs {
  destAddress: string;
  amountSompi: bigint;
  feeSompi: bigint;
  /** Mature balance available to spend (sompi). */
  availableSompi: bigint;
  /** Expected address prefix for the active network, e.g. "keryx". */
  addressPrefix: string;
}

export interface SendConfirmation {
  readonly destAddress: string;
  readonly amountSompi: bigint;
  readonly feeSompi: bigint;
  readonly totalSompi: bigint; // amount + fee, frozen
}

export interface ConfirmationError {
  ok: false;
  code: "bad-address" | "wrong-network" | "bad-amount" | "insufficient-funds";
  error: string;
}

export type ConfirmationResult = ({ ok: true } & { value: SendConfirmation }) | ConfirmationError;

export function buildSendConfirmation(input: SendInputs): ConfirmationResult {
  const addr = input.destAddress.trim();

  if (!addr) return err("bad-address", "Enter a destination address.");
  // Keryx addresses are `<prefix>:<payload>`. We check the prefix matches the active network.
  const [prefix] = addr.split(":");
  if (!addr.includes(":") || !prefix) {
    return err("bad-address", "That does not look like a Keryx address.");
  }
  if (prefix !== input.addressPrefix) {
    return err(
      "wrong-network",
      `Address is for "${prefix}", but this wallet is on "${input.addressPrefix}".`
    );
  }
  if (input.amountSompi <= 0n) {
    return err("bad-amount", "Amount must be greater than zero.");
  }
  if (input.feeSompi < 0n) {
    return err("bad-amount", "Fee cannot be negative.");
  }
  const total = input.amountSompi + input.feeSompi;
  if (total > input.availableSompi) {
    return err("insufficient-funds", "Amount plus fee exceeds your available balance.");
  }

  // Freeze: Object.freeze makes the confirmed values immutable for the lifetime of the screen.
  const value: SendConfirmation = Object.freeze({
    destAddress: addr,
    amountSompi: input.amountSompi,
    feeSompi: input.feeSompi,
    totalSompi: total,
  });
  return { ok: true, value };
}

function err(code: ConfirmationError["code"], error: string): ConfirmationError {
  return { ok: false, code, error };
}
