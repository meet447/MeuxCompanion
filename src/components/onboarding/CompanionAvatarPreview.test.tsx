import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanionAvatarPreview } from "./CompanionAvatarPreview";
import type { AnimationInfo } from "../../types";

const { vrmCanvas, live2dCanvas } = vi.hoisted(() => ({ vrmCanvas: vi.fn(), live2dCanvas: vi.fn() }));
vi.mock("../../api/tauri", () => ({ resolveAssetUrl: async (path: string) => `/static/${path}`, resolveLive2DModelUrl: async (path: string) => `/static/${path}` }));
vi.mock("../VRMCanvas", () => ({ VRMCanvas: (props: { animations?: AnimationInfo[] }) => {
  vrmCanvas(props);
  return <div data-testid="vrm-preview" />;
} }));
vi.mock("../Live2DCanvas", () => ({ Live2DCanvas: (props: unknown) => {
  live2dCanvas(props);
  return <div data-testid="live2d-preview" />;
} }));
const model = { id: "marketplace-avatar", type: "vrm", path: "models/vrm/marketplace-avatar/model.vrm" };
const sharedIdle = { name: "default:idle", path: "models/animations/vrm/idle.vrma" };
const sharedEmote = { name: "default:VRMA_01", path: "models/animations/vrm/VRMA_01.vrma" };
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
const renderedAnimations = () => vrmCanvas.mock.lastCall?.[0].animations as AnimationInfo[];

describe("marketplace avatar preview", () => {
  it("passes all five default idles to a VRM with no animation metadata", async () => {
    render(<CompanionAvatarPreview model={model} />);
    await screen.findByTestId("vrm-preview");
    expect(renderedAnimations().map((animation) => animation.name)).toEqual(["default:idle", "default:idle_2", "default:idle_3", "default:idle_4", "default:idle_5"]);
    expect(renderedAnimations()[0]).toEqual(sharedIdle);
  });
  it("does not mistake a shared emote for an idle because of its default prefix", async () => {
    render(<CompanionAvatarPreview model={{ ...model, animations: [sharedEmote, sharedIdle] }} />);
    await screen.findByTestId("vrm-preview");
    expect(renderedAnimations()).toEqual([sharedIdle]);
  });
  it("prefers the model's own idle and falls back when the next model has only an emote", async () => {
    const ownIdle = { name: "breathing_idle", path: "models/vrm/custom/animations/idle.vrma" };
    const { rerender } = render(<CompanionAvatarPreview model={{ ...model, animations: [sharedIdle, ownIdle] }} />);
    await screen.findByTestId("vrm-preview");
    expect(renderedAnimations()).toEqual([ownIdle]);
    rerender(<CompanionAvatarPreview model={{ ...model, id: "other-avatar", animations: [sharedEmote] }} />);
    await waitFor(() => expect(renderedAnimations()).toHaveLength(5));
  });
  it("keeps Live2D on its existing preview path", async () => {
    render(<CompanionAvatarPreview model={{ id: "haru", type: "live2d", path: "models/live2d/haru/Haru.model3.json" }} />);
    await screen.findByTestId("live2d-preview");
    expect(vrmCanvas).not.toHaveBeenCalled();
  });
});
