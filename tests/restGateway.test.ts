// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { RestGatewayProvider } from "../src/mobile/chain/restGateway";
import type { BroadcastTx } from "../src/mobile/chain/broadcast";

// Recorded REAL responses from keryx-labs.com/api/v1 (shapes verified live).
const REAL = {
  balance: { address: "keryx:qp67", balance_sompi: 4150246145624867 },
  utxos: [
    {
      address: "keryx:qp67",
      transaction_id: "b992851955d43edcdd50932c8ce12cb5d6621803cb8ff7cee7d4b7d0f4283b0e",
      index: 1,
      amount_sompi: 9999592557068,
      script_version: 0,
      script_public_key: "2075e955747de03a531522b59d547eaa2b4e7f9889861af2db697c387000c6e526ac",
      block_daa_score: 20019813,
      is_coinbase: false,
    },
  ],
  address: {
    address: "keryx:qp67",
    total_received_sompi: 131030097828260,
    total_tx_count: 1208,
    transactions: [
      { address: "keryx:qp67", amount_sompi: -4728407992800, block_hash: "2d65", daa_score: 44911574, is_spend: true, tx_id: "662321" },
    ],
  },
};

function mockFetch(status: number, payload: unknown) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  globalThis.fetch = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(text),
    text: async () => text,
  })) as any;
}

describe("RestGatewayProvider (web fetch path)", () => {
  const p = new RestGatewayProvider(false);
  beforeEach(() => vi.restoreAllMocks());

  it("parses balance_sompi into a bigint", async () => {
    mockFetch(200, REAL.balance);
    expect(await p.getBalanceSompi("keryx:qp67")).toBe(4150246145624867n);
  });

  it("maps utxos with bigint amounts and raw script", async () => {
    mockFetch(200, REAL.utxos);
    const u = await p.getUtxos("keryx:qp67");
    expect(u).toHaveLength(1);
    expect(u[0].amountSompi).toBe(9999592557068n);
    expect(u[0].transactionId).toBe(REAL.utxos[0].transaction_id);
    expect(u[0].scriptPublicKey).toBe(REAL.utxos[0].script_public_key);
    expect(u[0].blockDaaScore).toBe(20019813n);
  });

  it("maps the address summary + signed history amounts", async () => {
    mockFetch(200, REAL.address);
    const a = await p.getAddress("keryx:qp67");
    expect(a.totalReceivedSompi).toBe(131030097828260n);
    expect(a.totalTxCount).toBe(1208);
    expect(a.transactions[0].amountSompi).toBe(-4728407992800n);
    expect(a.transactions[0].isSpend).toBe(true);
  });

  it("broadcast returns the txid on 200", async () => {
    mockFetch(200, { transaction_id: "abc123" });
    const r = await p.broadcast({ inputs: [], outputs: [] } as unknown as BroadcastTx);
    expect(r.ok).toBe(true);
    expect(r.transactionId).toBe("abc123");
  });

  it("broadcast surfaces the node error on rejection", async () => {
    mockFetch(502, { error: "Node rejected transaction: orphan" });
    const r = await p.broadcast({ inputs: [], outputs: [] } as unknown as BroadcastTx);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("orphan");
  });
});
