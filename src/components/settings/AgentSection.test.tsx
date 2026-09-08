import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentSection, type AgentSectionValue } from "./AgentSection";

const baseValue: AgentSectionValue = {
  preset: "opencode",
  program: "",
  args: "",
  auto_approve_tools: true,
};

describe("AgentSection", () => {
  it("renders preset options and tool-permission choices", () => {
    render(<AgentSection value={baseValue} onChange={vi.fn()} />);
    expect(screen.getByText("OpenCode")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
    expect(screen.getByText("Allow automatically")).toBeInTheDocument();
    expect(screen.getByText("Ask me each time")).toBeInTheDocument();
  });

  it("renders preset cards in a two-column grid for onboarding", () => {
    const { container } = render(
      <AgentSection value={baseValue} onChange={vi.fn()} friendly />,
    );
    const grid = container.querySelector(".grid.grid-cols-2");
    expect(grid).toBeTruthy();
    expect(screen.getByText("OpenCode")).toBeInTheDocument();
  });

  it("calls onChange when tool permission changes", () => {
    const onChange = vi.fn();
    render(<AgentSection value={baseValue} onChange={onChange} />);

    fireEvent.click(screen.getByText("Ask me each time"));

    expect(onChange).toHaveBeenCalledWith({
      ...baseValue,
      auto_approve_tools: false,
    });
  });

  it("hides tool permissions when showToolPermissions is false", () => {
    render(<AgentSection value={baseValue} onChange={vi.fn()} showToolPermissions={false} />);
    expect(screen.queryByText("Allow automatically")).not.toBeInTheDocument();
    expect(screen.queryByText("Ask me each time")).not.toBeInTheDocument();
  });
});
