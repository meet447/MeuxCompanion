import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TTS_PRESETS_UI } from "../../lib/ttsPresets";
import { TtsSection, type TtsSectionValue } from "./TtsSection";

const baseValue: TtsSectionValue = {
  provider: "system",
  api_key: "",
  voice: "",
};

describe("TtsSection", () => {
  it("renders provider and voice options", () => {
    render(
      <TtsSection
        value={baseValue}
        onChange={vi.fn()}
        voices={[{ id: "", name: "System default" }]}
        presets={TTS_PRESETS_UI}
      />,
    );
    expect(screen.getByText("System voice")).toBeInTheDocument();
    expect(screen.getByText("System default")).toBeInTheDocument();
  });

  it("calls onChange when provider changes", () => {
    const onChange = vi.fn();
    render(
      <TtsSection
        value={baseValue}
        onChange={onChange}
        voices={[{ id: "", name: "System default" }]}
        presets={TTS_PRESETS_UI}
      />,
    );

    fireEvent.click(screen.getByText("ElevenLabs"));

    expect(onChange).toHaveBeenCalledWith({
      ...baseValue,
      provider: "elevenlabs",
    });
  });

  it("hides provider descriptions in compact onboarding layout", () => {
    render(
      <TtsSection
        value={baseValue}
        onChange={vi.fn()}
        voices={[{ id: "", name: "System default" }]}
        presets={TTS_PRESETS_UI}
        compactGrid
      />,
    );
    expect(screen.getByText("System voice")).toBeInTheDocument();
    expect(screen.queryByText(/Uses the voices on this computer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Studio voices/i)).not.toBeInTheDocument();
  });
});
