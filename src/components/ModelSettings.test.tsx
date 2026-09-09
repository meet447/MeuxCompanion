import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelSettings } from "./ModelSettings";
import { getExpressions, getModelExpressions, getSupportedExpressions, listModels, saveExpressions } from "../api/tauri";
vi.mock("../api/tauri", () => ({ getExpressions: vi.fn(), getModelExpressions: vi.fn(), getSupportedExpressions: vi.fn(), listModels: vi.fn(), saveExpressions: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getExpressions).mockResolvedValue({ happy: "happy" });
  vi.mocked(getModelExpressions).mockResolvedValue(["happy", "sad"]);
  vi.mocked(getSupportedExpressions).mockResolvedValue(["happy", "neutral"]);
  vi.mocked(saveExpressions).mockResolvedValue(undefined);
  vi.mocked(listModels).mockResolvedValue([{ id: "custom", type: "vrm", model_file: "model.vrm", path: "models/vrm/custom/model.vrm", animations: [
    { name: "idle", path: "models/vrm/custom/animations/idle.vrma" },
    { name: "default:idle", path: "models/animations/vrm/idle.vrma" },
    { name: "default:VRMA_01", path: "models/animations/vrm/VRMA_01.vrma" },
  ] }]);
});
afterEach(cleanup);

describe("ModelSettings animation mapping", () => {
  it("lists faces, model animations, and defaults as distinct choices and saves the selected source", async () => {
    const onPreviewExpression = vi.fn();
    render(<ModelSettings modelId="custom" onPreviewExpression={onPreviewExpression} />);
    const select = await screen.findByRole("combobox", { name: "happy mapping" });
    await waitFor(() => expect(within(select).getByRole("group", { name: "Default VRM animations" })).toBeInTheDocument());
    expect(within(select).getByRole("group", { name: "Model expressions" })).toBeInTheDocument();
    expect(within(select).getByRole("group", { name: "Model animations" })).toBeInTheDocument();
    expect(within(select).getAllByRole("option", { name: "idle" }).map((option) => (option as HTMLOptionElement).value)).toEqual(["animation:idle", "animation:default:idle"]);
    fireEvent.change(select, { target: { value: "animation:default:VRMA_01" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(onPreviewExpression).toHaveBeenCalledWith("animation:default:VRMA_01");
    fireEvent.click(screen.getByRole("button", { name: "Save mapping" }));
    await waitFor(() => expect(saveExpressions).toHaveBeenCalledWith("custom", { happy: "animation:default:VRMA_01" }));
  });
  it("preserves existing facial mappings and keeps VRM defaults out of Live2D choices", async () => {
    vi.mocked(listModels).mockResolvedValue([{ id: "haru", type: "live2d", model_file: "Haru.model3.json", path: "models/live2d/haru/Haru.model3.json" }]);
    render(<ModelSettings modelId="haru" onPreviewExpression={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "happy mapping" })).toHaveValue("happy"));
    expect(screen.queryByRole("group", { name: "Default VRM animations" })).not.toBeInTheDocument();
  });
});
