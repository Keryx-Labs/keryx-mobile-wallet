// @vitest-environment node
//
// Static guard: no console.*/logging statement in OUR application code may reference a secret.
// Scans src/ (excluding the third-party audited WASM SDK in src/sdk) for console calls that mention
// password / mnemonic / seed phrase / private key / walletSecret / raw signing material.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "../src");

// Identifiers that must never appear inside a console.* / logging call.
const FORBIDDEN = [
  "password",
  "mnemonic",
  "phrase",
  "walletSecret",
  "privateKey",
  "privkey",
  "prvkey",
  "secretKey",
  "rawTx",
  "signingData",
];

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "sdk") continue; // third-party audited SDK, not our logging surface
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name)) yield p;
  }
}

// Match console.x(...) OR a bare logger.x(...) call and capture the argument text.
const LOG_RE = /\b(?:console|logger)\s*\.\s*(?:log|info|warn|error|debug|trace)\s*\(([^)]*)\)/g;

describe("no secrets in logs", () => {
  it("no console/logging statement references a secret identifier", () => {
    const violations: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, "utf8");
      let m: RegExpExecArray | null;
      while ((m = LOG_RE.exec(text)) !== null) {
        const args = m[1].toLowerCase();
        for (const bad of FORBIDDEN) {
          // whole-word-ish check so "addressPrefix" etc. don't false-positive
          if (new RegExp(`\\b${bad.toLowerCase()}\\b`).test(args)) {
            const line = text.slice(0, m.index).split("\n").length;
            violations.push(`${file}:${line} logs "${bad}" → ${m[0].slice(0, 80)}`);
          }
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
