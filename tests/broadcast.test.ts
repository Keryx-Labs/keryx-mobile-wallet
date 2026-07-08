import { describe, it, expect } from "vitest";
import {
  splitScriptPublicKey,
  buildBroadcastBody,
  stringifyBroadcast,
  SerializableTx,
} from "../src/mobile/chain/broadcast";

describe("broadcast body builder (verified against live gateway schema)", () => {
  it("splits a prefixed scriptPublicKey (u16 LE version)", () => {
    expect(splitScriptPublicKey("0000" + "2079be")).toEqual({ version: 0, script: "2079be" });
    expect(splitScriptPublicKey("0100" + "abcd")).toEqual({ version: 1, script: "abcd" });
  });

  it("maps a serialized tx to the snake_case broadcast body", () => {
    const ser: SerializableTx = {
      version: 0,
      inputs: [
        { transactionId: "aa".repeat(32), index: 0, sequence: 0n, sigOpCount: 1, signatureScript: "41ab" },
      ],
      outputs: [{ value: 50_000_000_000n, scriptPublicKey: "0000deadbeef" }],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: "",
    };
    const b = buildBroadcastBody(ser);
    expect(b.inputs[0]).toEqual({
      transaction_id: "aa".repeat(32),
      index: 0,
      signature_script: "41ab",
      sequence: 0n,
      sig_op_count: 1,
    });
    expect(b.outputs[0]).toEqual({
      amount: 50_000_000_000n,
      script_public_key: "deadbeef",
      script_version: 0,
    });
    expect(b.lock_time).toBe(0n);
    expect(b.subnetwork_id).toBe("00".repeat(20));
  });

  it("serializes u64 amounts as BARE integer literals, lossless above 2^53", () => {
    const ser: SerializableTx = {
      version: 0,
      inputs: [{ transactionId: "bb".repeat(32), index: 2, sequence: 5n, sigOpCount: 1, signatureScript: "00" }],
      // 2^53 + 1 — would be corrupted if passed through a JS number
      outputs: [{ value: 9_007_199_254_740_993n, scriptPublicKey: "0000ff" }],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: "",
    };
    const json = stringifyBroadcast(buildBroadcastBody(ser));
    // bare integer, not quoted, exact value preserved
    expect(json).toContain('"amount":9007199254740993');
    expect(json).not.toContain('"9007199254740993"');
    expect(json).toContain('"sequence":5');
    // round-trips as valid JSON
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
