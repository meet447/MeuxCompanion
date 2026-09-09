import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentSetupPanel } from "./AgentSetupPanel";
import { getAgentSetupStatus, installAgentSetup, type AgentSetupStatusResponse } from "../../api/tauri";

vi.mock("../../api/tauri", () => ({ getAgentSetupStatus: vi.fn(), installAgentSetup: vi.fn() }));
const status: AgentSetupStatusResponse = {
  prerequisites: { node_available: true, npx_available: true, node_version: "v22", npx_version: "10" },
  agent: { preset: "codex", ready: true, system_path: false, needs_node: false,
    detail: "Adapter can run on demand.", install_source: "npx", system_command: null, cli_command: "/bin/codex" },
};
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("AgentSetupPanel", () => {
  it.each(["codex", "claude"] as const)("distinguishes the installed %s CLI from its optional adapter", async (preset) => {
    vi.mocked(getAgentSetupStatus).mockResolvedValue({ ...status, agent: { ...status.agent, preset } });
    render(<AgentSetupPanel preset={preset} />);
    await screen.findByText("Adapter available on demand");
    const title = preset === "codex" ? "Codex" : "Claude Code";
    expect(screen.getByText(`${title} CLI found`)).toBeInTheDocument();
    expect(screen.queryByText(`${title} ready`)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Install ${title}` })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Install adapter locally (optional)" })).toBeEnabled();
  });

  it("removes the install action when an adapter is found on recheck", async () => {
    vi.mocked(getAgentSetupStatus).mockResolvedValueOnce(status).mockResolvedValueOnce({
      ...status, agent: { ...status.agent, system_path: true, install_source: "system", system_command: "/bin/codex-acp" },
    });
    render(<AgentSetupPanel preset="codex" />);
    await screen.findByText("Adapter available on demand");
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await screen.findByText("Codex found");
    expect(screen.queryByRole("button", { name: /Install/ })).not.toBeInTheDocument();
    expect(installAgentSetup).not.toHaveBeenCalled();
  });

  it("does not display the previous agent's detected state while switching", async () => {
    vi.mocked(getAgentSetupStatus).mockResolvedValueOnce(status).mockReturnValueOnce(new Promise(() => {}));
    const { rerender } = render(<AgentSetupPanel preset="codex" />);
    await screen.findByText("Codex CLI found");
    rerender(<AgentSetupPanel preset="claude" />);
    expect(screen.queryByText("Codex CLI found")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Install/ })).not.toBeInTheDocument();
  });
});
