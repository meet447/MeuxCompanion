import type { AnimationInfo } from "../types";
import { animationCandidates } from "./vrmAnimationOptions";

// Available before import/installation metadata has supplied an animation list.
const DEFAULT_PREVIEW_IDLES: AnimationInfo[] = ["idle", "idle_2", "idle_3", "idle_4", "idle_5"].map((name) => ({
  name: `default:${name}`,
  path: `models/animations/vrm/${name}.vrma`,
}));

/** Preview idle cycles only, using the same model-first priority as full playback. */
export function vrmPreviewAnimations(animations?: AnimationInfo[]): AnimationInfo[] {
  const available = animations ?? [];
  const idleNames = new Set(animationCandidates(available.map((animation) => animation.name), "idle"));
  const idles = available.filter((animation) => idleNames.has(animation.name));
  return idles.length ? idles : DEFAULT_PREVIEW_IDLES;
}
