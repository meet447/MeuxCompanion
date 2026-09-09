import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdatesSection } from "./UpdatesSection";
import { Settings } from "../Settings";

const mocks = vi.hoisted(() => ({ check: vi.fn(), install: vi.fn(), restart: vi.fn(), open: vi.fn() }));
vi.mock("../../lib/isTauri", () => ({ isTauri: () => true }));
vi.mock("../../lib/appUpdater", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../lib/appUpdater")>(),
  checkForAppUpdate: mocks.check,
  downloadAndInstallAppUpdate: mocks.install,
  relaunchApp: mocks.restart,
}));
vi.mock("../../lib/openExternal", () => ({ openExternalUrl: mocks.open }));
vi.mock("../../hooks/useVoice", () => ({ useVoice: () => ({}) }));
vi.mock("../../api/tauri", () => ({ getConfig: () => new Promise(() => {}), saveConfig: vi.fn(), resetAllAppData: vi.fn(), resetOnboarding: vi.fn() }));
vi.mock("../../lib/ttsClient", () => ({ getVoices: async () => [] }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("App updates settings", () => {
  it("opens as its own page without waiting for profile configuration", async () => {
    render(<Settings onClose={vi.fn()} characterName="Haru" />);
    fireEvent.click(screen.getByRole("button", { name: "App updates" }));
    expect(screen.getByRole("heading", { level: 2, name: "App updates" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Privacy & data" }));
    expect(screen.queryByRole("button", { name: "Check for updates" })).not.toBeInTheDocument();
  });

  it("keeps manual downloads usable while checking and shows a current-version result", async () => {
    let finish!: (value: null) => void;
    mocks.check.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<UpdatesSection />);
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "View releases" }));
    expect(mocks.open).toHaveBeenCalledWith("https://github.com/meet447/Meuxe/releases");
    await act(async () => finish(null));
    expect(screen.getByRole("status")).toHaveTextContent("You’re up to date");
  });

  it("shows native timeout details and lets the user retry successfully", async () => {
    mocks.check.mockRejectedValueOnce("request timed out").mockResolvedValueOnce({ version: "0.1.3", notes: null, date: null });
    render(<UpdatesSection />);
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    await screen.findByText(/The update check timed out/);
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    await screen.findByText("Meuxe 0.1.3 is available.");
    expect(screen.getByRole("button", { name: "Install update" })).toBeEnabled();
  });

  it("keeps native permission errors visible instead of replacing them with a generic message", async () => {
    mocks.check.mockRejectedValue("updater.check not allowed");
    render(<UpdatesSection />);
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    await screen.findByText(/updater.check not allowed/);
  });
});
