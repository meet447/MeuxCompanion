import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkForAppUpdate, downloadAndInstallAppUpdate, UPDATE_CHECK_TIMEOUT_MS } from "./appUpdater";

const { check } = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("./isTauri", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check }));

beforeEach(() => vi.clearAllMocks());

describe("native updater integration", () => {
  it("bounds the native check and releases the discovered update resource", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    check.mockResolvedValue({ version: "0.1.3", body: "Changes", close });
    await expect(checkForAppUpdate()).resolves.toEqual({ version: "0.1.3", notes: "Changes", date: null });
    expect(check).toHaveBeenCalledWith({ timeout: UPDATE_CHECK_TIMEOUT_MS });
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns null when the installed version is current", async () => {
    check.mockResolvedValue(null);
    await expect(checkForAppUpdate()).resolves.toBeNull();
  });

  it("preserves native errors for the UI", async () => {
    check.mockRejectedValue("request timed out");
    await expect(checkForAppUpdate()).rejects.toBe("request timed out");
  });

  it("cleans up failed installs and preserves their error", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    check.mockResolvedValue({ version: "0.1.3", close, downloadAndInstall: vi.fn().mockRejectedValue("Invalid signature") });
    await expect(downloadAndInstallAppUpdate()).rejects.toBe("Invalid signature");
    expect(close).toHaveBeenCalledOnce();
  });
});
