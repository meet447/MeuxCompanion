import { afterEach, describe, expect, it, vi } from "vitest";
import { hasSeenHint, markHintSeen } from "./firstRunHints";

afterEach(() => {
  window.localStorage.clear();
});

describe("firstRunHints", () => {
  it("is unseen until marked", () => {
    expect(hasSeenHint("miniChat")).toBe(false);
    markHintSeen("miniChat");
    expect(hasSeenHint("miniChat")).toBe(true);
  });

  it("survives a thrown localStorage", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(hasSeenHint("miniChat")).toBe(false);
    getItem.mockRestore();
  });
});
