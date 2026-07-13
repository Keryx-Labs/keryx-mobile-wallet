// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { loadBook, saveContact, removeContact, addRecent } from "../src/mobile/addressBook";

beforeAll(() => {
  const map = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
});
beforeEach(() => (globalThis as any).localStorage.clear());

const W = "keryx:mywallet";

describe("address book", () => {
  it("saves + labels contacts, dedupes by address (updates label)", () => {
    saveContact(W, "keryx:a", "Valera");
    saveContact(W, "keryx:a", "Valera 2");
    const { contacts } = loadBook(W);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].label).toBe("Valera 2");
  });

  it("records recents, dedupes, and hides ones already saved as contacts", () => {
    addRecent(W, "keryx:a");
    addRecent(W, "keryx:b");
    addRecent(W, "keryx:a"); // dedupe → moves to front
    let book = loadBook(W);
    expect(book.recents.map((r) => r.address)).toEqual(["keryx:a", "keryx:b"]);
    // saving a recent removes it from recents
    saveContact(W, "keryx:a", "Exchange");
    book = loadBook(W);
    expect(book.recents.map((r) => r.address)).toEqual(["keryx:b"]);
    expect(book.contacts.map((c) => c.address)).toContain("keryx:a");
  });

  it("addRecent skips addresses that are already saved contacts", () => {
    saveContact(W, "keryx:a", "Saved");
    addRecent(W, "keryx:a");
    expect(loadBook(W).recents).toHaveLength(0);
  });

  it("removes contacts and isolates by wallet", () => {
    saveContact(W, "keryx:a", "X");
    removeContact(W, "keryx:a");
    expect(loadBook(W).contacts).toHaveLength(0);
    saveContact(W, "keryx:a", "X");
    expect(loadBook("keryx:other").contacts).toHaveLength(0);
    expect(loadBook(null).contacts).toHaveLength(0);
  });
});
