import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Onboarding } from "./Onboarding";
import { getAgentSetupStatus, listModels } from "../api/tauri";
import type { AgentSetupStatusResponse } from "../api/tauri";

vi.mock("../api/tauri", () => ({
  saveConfig: vi.fn(),
  createCharacter: vi.fn(),
  listModels: vi.fn(),
  getAgentSetupStatus: vi.fn(),
  installAgentSetup: vi.fn(),
  resolveAssetUrl: vi.fn(async () => "/static/haru"),
}));

vi.mock("./onboarding/CompanionAvatarPreview", () => ({
  CompanionAvatarPreview: () => <div data-testid="preview" />,
}));

vi.mock("../lib/ttsClient", () => ({
  getVoices: vi.fn(async () => [{ id: "", name: "System default" }]),
  previewVoice: vi.fn(async () => []),
}));

const haruModel = {
  id: "haru",
  type: "live2d",
  model_file: "Haru.model3.json",
  path: "models/live2d/haru/Haru.model3.json",
  mapping: null,
};

function agentStatus(ready: boolean): AgentSetupStatusResponse {
  return {
    prerequisites: {
      node_available: true,
      npx_available: true,
      node_version: "22.0.0",
      npx_version: "10.0.0",
    },
    agent: {
      preset: "opencode",
      ready,
      system_path: ready,
      needs_node: true,
      detail: ready ? "OpenCode is ready" : "OpenCode is not installed",
      install_source: ready ? "system" : "none",
      system_command: ready ? "opencode" : null,
    },
  };
}

async function walkToVoice() {
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  fireEvent.change(screen.getByPlaceholderText(/e\.g\. Alex/i), {
    target: { value: "Alex" },
  });
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));

  await waitFor(() => {
    expect(screen.getByText("Haru")).toBeInTheDocument();
  });
  fireEvent.click(screen.getByText("Haru"));
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));

  fireEvent.change(screen.getByPlaceholderText(/Who are you creating/i), {
    target: { value: "Mira" },
  });
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
}

describe("Onboarding", () => {
  beforeEach(() => {
    vi.mocked(listModels).mockResolvedValue([haruModel]);
    vi.mocked(getAgentSetupStatus).mockResolvedValue(agentStatus(false));
  });

  it("defaults to system voice and has no TikTok provider", async () => {
    render(<Onboarding onComplete={vi.fn()} />);
    await walkToVoice();

    expect(screen.getByText("How they sound")).toBeInTheDocument();
    expect(screen.getByText("System voice")).toBeInTheDocument();
    expect(screen.getByText("ElevenLabs")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.queryByText(/tiktok/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/System voice uses the speech already on this computer/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  it("hides tool permissions and blocks Finish until an assistant is ready", async () => {
    render(<Onboarding onComplete={vi.fn()} />);
    await walkToVoice();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByText("Who answers for them?")).toBeInTheDocument();
    });

    expect(screen.queryByText("Allow automatically")).not.toBeInTheDocument();
    expect(screen.queryByText("Ask me each time")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /finish/i })).toBeDisabled();
    expect(
      screen.getByText(/Install the assistant above to continue/i),
    ).toBeInTheDocument();
  });

  it("enables Finish once the selected assistant is ready", async () => {
    vi.mocked(getAgentSetupStatus).mockResolvedValue(agentStatus(true));
    render(<Onboarding onComplete={vi.fn()} />);
    await walkToVoice();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /finish/i })).toBeEnabled();
    });
    expect(screen.getByText(/OpenCode ready/i)).toBeInTheDocument();
  });
});
