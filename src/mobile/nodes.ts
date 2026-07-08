// Node selection for mobile — automatic, with failover. The user does NOT pick a node in the normal
// flow (manual entry lives in Advanced/Developer settings only).
//
// Desktop assumes a LOCAL node (ws://127.0.0.1:23110) and ships no public resolver. A phone can't run
// a node, so mobile connects to one of several official wss:// endpoints and fails over to the next
// healthy one. A node is only acceptable if it is reachable, synced, and started with --utxoindex
// (balances require the UTXO index).
//
// Where the endpoints come from (in priority order):
//   1. VITE_KERYX_NODES  — comma-separated wss:// URLs baked at build time (ops can rotate without code).
//   2. OFFICIAL_NODES    — the in-code default list below.
// Fill OFFICIAL_NODES (or the env) with the project's real endpoints. We intentionally do NOT invent
// hostnames; an empty list makes the app fall back to the first-run node onboarding screen.

export interface NodeCandidate {
  url: string; // wss://host:port
  networkId: string; // e.g. "mainnet"
}

// TODO(keryx): replace with the project's official public wss:// endpoints, e.g.
//   { url: "wss://node1.keryx-labs.com:23110", networkId: "mainnet" },
export const OFFICIAL_NODES: NodeCandidate[] = [];

const DEFAULT_PORT = "23110";
const DEFAULT_NETWORK = "mainnet";

/** Parse VITE_KERYX_NODES ("wss://a:23110,wss://b:23110") into candidates. */
export function nodesFromEnv(env: string | undefined, networkId = DEFAULT_NETWORK): NodeCandidate[] {
  if (!env) return [];
  return env
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((url) => ({ url: normalizeWss(url), networkId }));
}

function normalizeWss(url: string): string {
  let u = url.trim();
  if (!/^wss?:\/\//i.test(u)) u = `wss://${u}`;
  if (!/:\d+$/.test(u.replace(/^wss?:\/\//i, ""))) u = `${u}:${DEFAULT_PORT}`;
  return u;
}

/** The ordered candidate list the app will try, env taking precedence over the in-code default. */
export function candidateNodes(env?: string): NodeCandidate[] {
  const fromEnv = nodesFromEnv(env);
  return fromEnv.length ? fromEnv : OFFICIAL_NODES;
}

export interface ProbeResult {
  ok: boolean;
  synced?: boolean;
  utxoIndex?: boolean;
  networkId?: string;
  error?: string;
}

export type Probe = (url: string, networkId: string) => Promise<ProbeResult>;

export interface NodeSelection {
  selected: NodeCandidate | null;
  /** Per-candidate probe outcome, for diagnostics / an Advanced screen. */
  attempts: Array<{ node: NodeCandidate; result: ProbeResult }>;
}

/**
 * Probe candidates in order and pick the first that is reachable, synced, and has --utxoindex.
 * Pure w.r.t. the injected `probe` (which wraps wallet.testConnection), so it is fully testable.
 */
export async function selectHealthyNode(
  candidates: NodeCandidate[],
  probe: Probe
): Promise<NodeSelection> {
  const attempts: NodeSelection["attempts"] = [];
  for (const node of candidates) {
    let result: ProbeResult;
    try {
      result = await probe(node.url, node.networkId);
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    attempts.push({ node, result });
    if (result.ok && result.synced && result.utxoIndex) {
      return { selected: node, attempts };
    }
  }
  return { selected: null, attempts };
}
// end of nodes.ts
