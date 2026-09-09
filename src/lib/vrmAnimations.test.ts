import { describe, expect, it } from "vitest";
import { AnimationClip, AnimationMixer, Object3D } from "three";
import { VrmAnimationPlayer } from "./vrmAnimations";
import { animationCandidates, findAnimation } from "./vrmAnimationOptions";

function makePlayer(names: string[]) {
  const mixer = new AnimationMixer(new Object3D());
  const player = new VrmAnimationPlayer(mixer);
  for (const name of names) player.clips.set(name, new AnimationClip(name, 1, []));
  return { mixer, player };
}

describe("VRM defaults", () => {
  it("prefers model animations regardless of asynchronous load order", () => {
    const names = ["default:idle", "default:talking", "BreathingIdle", "my_talking"];
    expect(animationCandidates(names, "idle")).toEqual(["BreathingIdle"]);
    expect(animationCandidates(names, "talking")).toEqual(["my_talking"]);
    expect(findAnimation(names, "animation:default:idle")).toBe("default:idle");
    expect(findAnimation(names, "animation:missing")).toBeUndefined();
  });
  it("fills missing behaviors without replacing a model's own idle", () => {
    const { player } = makePlayer(["idle", "default:idle", "default:talking"]);
    player.start();
    expect(player.currentName).toBe("idle");
    player.setSpeaking(true);
    expect(player.currentName).toBe("default:talking");
    player.setSpeaking(false);
    expect(player.currentName).toBe("idle");
    player.dispose();
  });
  it("cycles shared idles and returns from a one-shot emote", () => {
    const setup = makePlayer(["default:idle", "default:idle_2", "default:VRMA_01"]);
    setup.player.start();
    setup.mixer.update(2.1);
    expect(setup.player.currentName).toBe("default:idle_2");
    setup.player.setExpression("animation:default:VRMA_01");
    expect(setup.player.currentName).toBe("default:VRMA_01");
    setup.mixer.update(1.1);
    expect(setup.player.currentName).toBe("default:idle");
    setup.player.dispose();
  });
  it("honors an explicitly mapped default over a model-specific idle", () => {
    const setup = makePlayer(["idle", "default:idle"]);
    setup.player.setExpression("animation:default:idle");
    setup.player.start();
    setup.mixer.update(3);
    expect(setup.player.currentName).toBe("default:idle");
    setup.player.dispose();
  });
  it("preserves speech that started while clips were loading", () => {
    const setup = makePlayer(["default:idle", "default:talking"]);
    setup.player.setSpeaking(true);
    setup.player.start();
    expect(setup.player.currentName).toBe("default:talking");
    setup.player.dispose();
  });
});
