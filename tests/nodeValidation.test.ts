import { describe, it, expect } from "vitest";
import { validateNodeUrl, splitNodeUrl, isLoopbackHost } from "../src/mobile/nodeValidation";

describe("node endpoint validation (transport-security rule)", () => {
  it("accepts wss:// to a remote host", () => {
    const r = validateNodeUrl("wss://node.example.com:23110");
    expect(r.ok).toBe(true);
    expect(r.url).toBe("wss://node.example.com:23110");
  });

  it("REJECTS plaintext ws:// to a remote host", () => {
    const r = validateNodeUrl("ws://node.example.com:23110");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("insecure-remote");
  });

  it("blocks ws://localhost on mobile by default (loopback-ws disabled)", () => {
    const r = validateNodeUrl("ws://127.0.0.1:23110");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("loopback-ws-disabled");
  });

  it("allows ws://localhost only when developer opt-in is set", () => {
    const r = validateNodeUrl("ws://127.0.0.1:23110", { allowLoopbackWs: true });
    expect(r.ok).toBe(true);
    expect(r.url).toBe("ws://127.0.0.1:23110");
  });

  it("still forbids ws:// to remote even with loopback opt-in", () => {
    const r = validateNodeUrl("ws://8.8.8.8:23110", { allowLoopbackWs: true });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("insecure-remote");
  });

  it("rejects an out-of-range port", () => {
    expect(validateNodeUrl("wss://node.example.com:70000").code).toBe("bad-port");
    expect(validateNodeUrl("wss://node.example.com:0").code).toBe("bad-port");
  });

  it("rejects an empty host", () => {
    expect(validateNodeUrl("   ").code).toBe("empty-host");
  });

  it("defaults the port to 23110 when omitted", () => {
    const r = validateNodeUrl("wss://node.example.com");
    expect(r.ok).toBe(true);
    expect(r.url).toBe("wss://node.example.com:23110");
  });

  it("handles bracketed IPv6 loopback", () => {
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("[::1]")).toBe(true);
    const r = validateNodeUrl("ws://[::1]:23110", { allowLoopbackWs: true });
    expect(r.ok).toBe(true);
  });

  it("splitNodeUrl round-trips scheme/host/port", () => {
    expect(splitNodeUrl("wss://host:1234")).toEqual({ scheme: "wss", host: "host", port: "1234" });
    expect(splitNodeUrl("ws://127.0.0.1")).toEqual({ scheme: "ws", host: "127.0.0.1", port: "23110" });
  });
});
