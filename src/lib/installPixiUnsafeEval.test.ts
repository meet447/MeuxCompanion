import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInstall = vi.fn();

vi.mock("@pixi/unsafe-eval", () => ({
  install: mockInstall,
}));

vi.mock("pixi.js", () => ({
  Application: vi.fn(),
}));

describe("installPixiUnsafeEval", () => {
  beforeEach(() => {
    vi.resetModules();
    mockInstall.mockClear();
  });

  it("calls install with the pixi module", async () => {
    const pixi = await import("pixi.js");
    const { installPixiUnsafeEval } = await import("./installPixiUnsafeEval");

    installPixiUnsafeEval();

    expect(mockInstall).toHaveBeenCalledTimes(1);
    expect(mockInstall).toHaveBeenCalledWith(pixi);
  });

  it("is idempotent on repeated calls", async () => {
    const { installPixiUnsafeEval } = await import("./installPixiUnsafeEval");

    installPixiUnsafeEval();
    installPixiUnsafeEval();

    expect(mockInstall).toHaveBeenCalledTimes(1);
  });
});
