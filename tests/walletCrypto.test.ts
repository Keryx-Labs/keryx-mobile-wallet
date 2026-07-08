// @vitest-environment node
//
// Exercises the REAL Keryx wallet-core (WASM SDK) crypto that the mobile app reuses — no mocks.
// Proves the mobile build inherits the same encryption, mnemonic handling and address derivation
// as desktop, and that a wrong password is rejected.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// @ts-ignore — SDK ships its own .d.ts but we import the JS directly for the runtime.
import * as kaspa from "../src/sdk/kaspa.js";

beforeAll(async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const wasm = readFileSync(resolve(here, "../src/sdk/kaspa_bg.wasm"));
  await kaspa.default({ module_or_path: wasm });
});

describe("wallet-core crypto (reused from desktop, unchanged)", () => {
  it("encrypts and decrypts the seed (XChaCha20-Poly1305) round-trip", () => {
    const phrase = "test seed phrase material";
    const ct = kaspa.encryptXChaCha20Poly1305(phrase, "correct horse");
    expect(ct).not.toContain(phrase); // ciphertext must not leak the plaintext
    expect(kaspa.decryptXChaCha20Poly1305(ct, "correct horse")).toBe(phrase);
  });

  it("rejects decryption with the WRONG password", () => {
    const ct = kaspa.encryptXChaCha20Poly1305("secret", "right-password");
    expect(() => kaspa.decryptXChaCha20Poly1305(ct, "wrong-password")).toThrow();
  });

  it("creates a valid 24-word mnemonic (wallet create)", () => {
    const m = kaspa.Mnemonic.random(24);
    expect(m.phrase.trim().split(/\s+/)).toHaveLength(24);
    expect(kaspa.Mnemonic.validate(m.phrase)).toBe(true);
  });

  it("validates / rejects an imported recovery phrase (wallet import)", () => {
    const good = kaspa.Mnemonic.random(24).phrase;
    expect(kaspa.Mnemonic.validate(good)).toBe(true);
    expect(kaspa.Mnemonic.validate("word word word not a real phrase")).toBe(false);
  });

  it("derives a keryx: address (network/prefix contract holds on this build)", () => {
    const addr = new kaspa.PrivateKey(
      "0000000000000000000000000000000000000000000000000000000000000001"
    )
      .toAddress("mainnet")
      .toString();
    expect(addr.split(":")[0]).toBe("keryx");
  });
});
