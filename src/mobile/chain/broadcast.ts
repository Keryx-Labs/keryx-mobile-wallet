// Broadcast body builder — converts a locally-signed transaction into the exact JSON the Keryx REST
// Gateway `POST /api/v1/broadcast` expects. The schema was verified live against keryx-labs.com
// (snake_case fields; the node accepted the shape and only rejected our throwaway tx as an orphan):
//
//   { version, inputs:[{transaction_id, index, signature_script, sequence, sig_op_count}],
//     outputs:[{amount, script_public_key, script_version}], lock_time, subnetwork_id, gas, payload }
//
// Amounts / sequence / lock_time / gas are u64 → we keep them as bigint and serialize as BARE INTEGER
// LITERALS (not JS numbers, not quoted strings) so values above 2^53 sompi never lose precision.
// Input is the SDK's `Transaction.serializeToObject()` result (ISerializableTransaction).

export interface SerializableInput {
  transactionId: string;
  index: number;
  sequence: bigint | number;
  sigOpCount: number;
  signatureScript?: string;
}
export interface SerializableOutput {
  value: bigint | number;
  scriptPublicKey: string; // "<u16 LE version hex><script hex>", e.g. "0000<script>"
}
export interface SerializableTx {
  version: number;
  inputs: SerializableInput[];
  outputs: SerializableOutput[];
  lockTime: bigint | number;
  subnetworkId: string;
  gas: bigint | number;
  payload?: string;
}

export interface BroadcastInput {
  transaction_id: string;
  index: number;
  signature_script: string;
  sequence: bigint;
  sig_op_count: number;
}
export interface BroadcastOutput {
  amount: bigint;
  script_public_key: string;
  script_version: number;
}
export interface BroadcastTx {
  version: number;
  inputs: BroadcastInput[];
  outputs: BroadcastOutput[];
  lock_time: bigint;
  subnetwork_id: string;
  gas: bigint;
  payload: string;
}

/** Split a prefixed scriptPublicKey hex ("<u16 LE version><script>") into { version, script }. */
export function splitScriptPublicKey(spk: string): { version: number; script: string } {
  if (spk.length < 4) return { version: 0, script: spk };
  const vHex = spk.slice(0, 4); // 2 bytes, little-endian
  const version = parseInt(vHex.slice(2, 4) + vHex.slice(0, 2), 16) || 0;
  return { version, script: spk.slice(4) };
}

export function buildBroadcastBody(o: SerializableTx): BroadcastTx {
  return {
    version: o.version,
    inputs: o.inputs.map((i) => ({
      transaction_id: i.transactionId,
      index: i.index,
      signature_script: i.signatureScript ?? "",
      sequence: BigInt(i.sequence),
      sig_op_count: i.sigOpCount,
    })),
    outputs: o.outputs.map((x) => {
      const { version, script } = splitScriptPublicKey(x.scriptPublicKey);
      return { amount: BigInt(x.value), script_public_key: script, script_version: version };
    }),
    lock_time: BigInt(o.lockTime),
    subnetwork_id: o.subnetworkId,
    gas: BigInt(o.gas),
    payload: o.payload ?? "",
  };
}

const BIG = " __BIGINT__ ";

/**
 * JSON-encode the broadcast body with bigints rendered as bare integer literals (full u64 range),
 * which serde_json on the gateway parses losslessly. Never quotes u64 values.
 */
export function stringifyBroadcast(tx: BroadcastTx): string {
  const json = JSON.stringify(tx, (_k, v) =>
    typeof v === "bigint" ? `${BIG}${v.toString()}${BIG}` : v
  );
  return json.replace(new RegExp(`"${BIG}(\\d+)${BIG}"`, "g"), "$1");
}
// end of broadcast.ts
