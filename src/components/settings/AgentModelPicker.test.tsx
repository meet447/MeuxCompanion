import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAgentModels, type AgentModelsResponse } from "../../api/tauri";
import { AgentModelPicker } from "./AgentModelPicker";

vi.mock("../../api/tauri", () => ({ getAgentModels: vi.fn() }));
const catalog: AgentModelsResponse = {
  supported: true,
  current_model: "fast",
  models: [
    { id: "fast", name: "Fast model", description: "Quick replies", group: "Provider" },
    { id: "deep", name: "Deep model", description: "More reasoning", group: null },
  ],
};
const props = { preset: "opencode", program: "", args: "", model: "", onChange: vi.fn() };
async function load() { await act(async () => { await vi.advanceTimersByTimeAsync(300); }); }
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); vi.mocked(getAgentModels).mockResolvedValue(catalog); });
afterEach(() => { vi.useRealTimers(); });

describe("AgentModelPicker", () => {
  it("loads all agent models and emits the selected model ID", async () => {
    render(<AgentModelPicker {...props} />);
    expect(screen.getByRole("combobox", { name: "Agent model" })).toBeDisabled();
    await load();
    expect(getAgentModels).toHaveBeenCalledExactlyOnceWith({ preset: "opencode", program: "", args: [], auto_approve_tools: false });
    expect(screen.getByRole("option", { name: "Provider · Fast model" })).toHaveValue("fast");
    expect(screen.getByRole("option", { name: "Deep model" })).toHaveValue("deep");
    expect(screen.getByRole("option", { name: "Agent default (Fast model)" })).toHaveValue("");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "deep" } });
    expect(props.onChange).toHaveBeenCalledWith("deep");
  });

  it("loads the edited custom command and arguments without saving settings", async () => {
    const { rerender } = render(<AgentModelPicker {...props} preset="custom" />);
    await load();
    expect(getAgentModels).not.toHaveBeenCalled();
    expect(screen.getByText(/Enter the agent command/)).toBeInTheDocument();
    rerender(<AgentModelPicker {...props} preset="custom" program="my-agent" args=" --acp   --stdio " />);
    await load();
    expect(getAgentModels).toHaveBeenCalledWith({ preset: "custom", program: "my-agent", args: ["--acp", "--stdio"], auto_approve_tools: false });
  });

  it("ignores the old agent response after switching agents", async () => {
    let resolveOld!: (data: AgentModelsResponse) => void;
    vi.mocked(getAgentModels).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const { rerender } = render(<AgentModelPicker {...props} />);
    await load();
    rerender(<AgentModelPicker {...props} preset="codex" />);
    await load();
    await act(async () => resolveOld({ ...catalog, models: [{ id: "old", name: "Old agent model", description: null, group: null }] }));
    expect(screen.queryByRole("option", { name: "Old agent model" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Deep model" })).toBeInTheDocument();
  });

  it("shows discovery errors and refreshes successfully", async () => {
    vi.mocked(getAgentModels).mockRejectedValueOnce("Please sign in to your agent");
    render(<AgentModelPicker {...props} />);
    await load();
    expect(screen.getByText("Please sign in to your agent")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await load();
    expect(screen.queryByText("Please sign in to your agent")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Deep model" })).toBeInTheDocument();
  });

  it("keeps an unavailable saved model visible until the user chooses a replacement", async () => {
    render(<AgentModelPicker {...props} model="removed-model" />);
    await load();
    expect(screen.getByRole("combobox")).toHaveValue("removed-model");
    expect(screen.getByText(/This saved model is no longer listed/)).toBeInTheDocument();
    expect(props.onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(props.onChange).toHaveBeenCalledWith("");
  });

  it("explains when the agent does not provide a model list", async () => {
    vi.mocked(getAgentModels).mockResolvedValue({ supported: false, models: [], current_model: null });
    render(<AgentModelPicker {...props} />);
    await load();
    expect(screen.getByText(/did not report selectable models/)).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });
});
