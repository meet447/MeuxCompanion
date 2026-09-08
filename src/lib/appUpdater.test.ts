import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { APP_VERSION } from "./appUpdater";

describe("isTauri", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI__");
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("returns false in the browser", async () => {
    const { isTauri } = await import("./isTauri");
    expect(isTauri()).toBe(false);
  });

  it("returns true when Tauri globals are present", async () => {
    Object.assign(window, { __TAURI__: {} });
    const { isTauri } = await import("./isTauri");
    expect(isTauri()).toBe(true);
  });
});

describe("appUpdater", () => {
  it("exposes the app version from Vite", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
