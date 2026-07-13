import { describe, it, expect } from "vitest";
import { parseKeryxTarget } from "../src/mobile/qr";

describe("parseKeryxTarget", () => {
  it("returns a bare address unchanged", () => {
    const a = "keryx:qprqmwptzgkqea3uw34rlgzwa998keh9j0mattq367pduh895cvuv0hn5a3dd";
    expect(parseKeryxTarget(a)).toEqual({ address: a, amountKrx: undefined });
  });
  it("parses a payment URI with amount", () => {
    const a = "keryx:qprqmwptzgkqea3uw34rlgzwa998keh9j0mattq367pduh895cvuv0hn5a3dd";
    const r = parseKeryxTarget(`${a}?amount=12.5&label=x`);
    expect(r.address).toBe(a);
    expect(r.amountKrx).toBe("12.5");
  });
  it("trims whitespace and lowercases the scheme only", () => {
    const r = parseKeryxTarget("  KERYX:qABC  ");
    expect(r.address).toBe("keryx:qABC");
  });
  it("ignores a non-numeric amount", () => {
    const r = parseKeryxTarget("keryx:qX?amount=abc");
    expect(r.amountKrx).toBeUndefined();
  });
});
