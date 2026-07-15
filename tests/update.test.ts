// @vitest-environment node
//
// In-app update check: version parsing/comparison and the dismissal store. Network fetch is not
// exercised here (kept pure); the comparison logic is what determines whether the banner shows.

import { describe, it, expect, beforeEach } from "vitest";
import {
  parseVersion,
  isNewer,
  isUpdateDismissed,
  dismissUpdate,
} from "../src/mobile/update";

beforeEach(() => {
  const map = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
});

describe("update version comparison", () => {
  it("parses tags and plain versions", () => {
    expect(parseVersion("v1.0.2")).toEqual([1, 0, 2]);
    expect(parseVersion("1.0")).toEqual([1, 0]);
    expect(parseVersion("v2.3.4-beta1")).toEqual([2, 3, 4]); // non-numeric parts dropped
  });

  it("detects a strictly newer version", () => {
    expect(isNewer("1.0.2", "1.0.1")).toBe(true);
    expect(isNewer("1.1.0", "1.0.9")).toBe(true);
    expect(isNewer("2.0.0", "1.9.9")).toBe(true);
    expect(isNewer("v1.0.2", "1.0.2")).toBe(false); // equal
    expect(isNewer("1.0.0", "1.0.1")).toBe(false); // older
  });

  it("treats missing components as zero", () => {
    expect(isNewer("1.1", "1.0.9")).toBe(true);
    expect(isNewer("1.0", "1.0.0")).toBe(false);
    expect(isNewer("1.0.1", "1.0")).toBe(true);
  });
});

describe("update dismissal store", () => {
  it("remembers a dismissed version, and a newer one still shows", () => {
    expect(isUpdateDismissed("1.0.2")).toBe(false);
    dismissUpdate("1.0.2");
    expect(isUpdateDismissed("1.0.2")).toBe(true);
    // A different (newer) version was not dismissed — banner should surface again.
    expect(isUpdateDismissed("1.0.3")).toBe(false);
  });
});
