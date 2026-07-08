// Node endpoint validation — single source of truth for the transport-security rule.
//
// Rule (from desktop wallet v0.1.1, made STRICT for mobile):
//   * A remote node MUST use wss:// (TLS).
//   * Plaintext ws:// is only ever allowed to a loopback host (127.0.0.1 / localhost / [::1]).
//   * On mobile, plaintext ws:// — even to loopback — is off by default, because a phone almost
//     never runs a local Keryx node and iOS ATS / Android cleartext policy block cleartext anyway.
//     It can be re-enabled explicitly for on-device development via { allowLoopbackWs: true }.
//
// This mirrors the desktop CSP `connect-src` allow-list and NodeSettingsModal's isLoopbackHost,
// so desktop and mobile never diverge on what counts as a safe endpoint.

export type NodeScheme = "ws" | "wss";

export interface ParsedNodeUrl {
  scheme: NodeScheme;
  host: string;
  port: string;
}

export interface NodeValidationResult {
  ok: boolean;
  /** Normalized `wss://host:port` (or `ws://` for allowed loopback). Present when ok. */
  url?: string;
  /** Machine-readable reason when !ok. */
  code?:
    | "empty-host"
    | "bad-port"
    | "insecure-remote"
    | "loopback-ws-disabled"
    | "unparseable";
  /** Human-readable message when !ok. */
  error?: string;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase().replace(/^\[|\]$/g, ""));
}

/** Split a stored `ws(s)://host:port` URL back into parts (loose; for editable UI fields). */
export function splitNodeUrl(u: string, defaultPort = "23110"): ParsedNodeUrl {
  const secure = /^wss:\/\//i.test(u);
  const rest = u.replace(/^wss?:\/\//i, "");
  // Support bracketed IPv6: [::1]:23110
  const m = rest.match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/);
  const host = m?.[1] ?? "127.0.0.1";
  const port = m?.[2] ?? defaultPort;
  return { scheme: secure ? "wss" : "ws", host, port };
}

export interface ValidateOptions {
  /** Default 23110 (Keryx Borsh wRPC). */
  defaultPort?: string;
  /** Allow plaintext ws:// to a loopback host. On mobile keep this false in production. */
  allowLoopbackWs?: boolean;
}

/**
 * Validate & normalize a user-entered node endpoint.
 * Accepts either a full `ws(s)://host:port` string or is fed pre-split parts by the UI.
 */
export function validateNodeUrl(
  input: string,
  opts: ValidateOptions = {}
): NodeValidationResult {
  const defaultPort = opts.defaultPort ?? "23110";
  const allowLoopbackWs = opts.allowLoopbackWs ?? false;

  const raw = input.trim();
  if (!raw) return fail("empty-host", "Enter a node host.");

  const { scheme, host, port } = splitNodeUrl(raw, defaultPort);
  const cleanHost = host.trim();
  const cleanPort = (port || defaultPort).replace(/[^0-9]/g, "");

  if (!cleanHost) return fail("empty-host", "Enter a node host.");
  const portNum = Number(cleanPort);
  if (!cleanPort || portNum < 1 || portNum > 65535) {
    return fail("bad-port", "Port must be between 1 and 65535.");
  }

  const loopback = isLoopbackHost(cleanHost);
  const hostOut = cleanHost.includes(":") && !cleanHost.startsWith("[")
    ? `[${cleanHost}]` // bare IPv6 → bracket it for the URL
    : cleanHost;

  if (scheme === "wss") {
    return { ok: true, url: `wss://${hostOut}:${cleanPort}` };
  }

  // scheme === "ws"
  if (!loopback) {
    return fail(
      "insecure-remote",
      "Remote nodes require a secure connection (wss://). Enable TLS on your node, " +
        "or tunnel a local node to 127.0.0.1."
    );
  }
  if (!allowLoopbackWs) {
    return fail(
      "loopback-ws-disabled",
      "Plaintext ws:// is disabled on mobile. Use wss://, or enable developer mode " +
        "to allow ws://localhost for an on-device node."
    );
  }
  return { ok: true, url: `ws://${hostOut}:${cleanPort}` };
}

function fail(code: NonNullable<NodeValidationResult["code"]>, error: string): NodeValidationResult {
  return { ok: false, code, error };
}
