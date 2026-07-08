import { describe, it, expect } from "vitest";
import { visibleSections, DEFAULT_FLAGS } from "../src/mobile/features";

describe("navigation / feature flags", () => {
  it("bottom nav is Wallet, Activity, AI, Settings by default (Send/Receive live on the wallet page)", () => {
    const ids = visibleSections().map((s) => s.id);
    expect(ids).toEqual(["home", "history", "ai", "settings"]);
    expect(ids).not.toContain("send");
    expect(ids).not.toContain("receive");
  });

  it("hides the AI tab when the flag is off", () => {
    const ids = visibleSections({ ...DEFAULT_FLAGS, aiTab: false }).map((s) => s.id);
    expect(ids).not.toContain("ai");
    expect(ids).toEqual(["home", "history", "settings"]);
  });
});
