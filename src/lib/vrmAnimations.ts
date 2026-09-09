import { AnimationMixer, AnimationClip, AnimationAction, LoopOnce, LoopRepeat } from "three";
import { animationCandidates, findAnimation, isIdle, isTalking } from "./vrmAnimationOptions";

/** Owns crossfades and idle/talking/emote transitions independently of WebGL. */
export class VrmAnimationPlayer {
  readonly clips = new Map<string, AnimationClip>();
  private action: AnimationAction | null = null;
  private name = "";
  private speaking = false;
  private requested = "";
  private started = false;
  private idleLoops = 0;
  private cycleIdle = true;
  private mode: "idle" | "talking" | "emote" = "idle";

  constructor(private mixer: AnimationMixer) {
    mixer.addEventListener("finished", this.onFinished);
    mixer.addEventListener("loop", this.onLoop);
  }
  get currentName() { return this.name; }
  start() {
    this.started = true;
    this.setExpression(this.requested);
  }
  setSpeaking(speaking: boolean) {
    if (this.speaking === speaking) return;
    this.speaking = speaking;
    if (this.started) this.resume();
  }
  setExpression(expression: string) {
    this.requested = expression;
    if (!this.started) return;
    const match = findAnimation([...this.clips.keys()], expression);
    if (match) {
      this.cycleIdle = false;
      this.play(match, isIdle(match) ? "idle" : isTalking(match) ? "talking" : "emote");
    } else {
      this.resume();
    }
  }
  private resume() {
    this.cycleIdle = true;
    const names = [...this.clips.keys()];
    const talking = this.speaking ? animationCandidates(names, "talking")[0] : undefined;
    const idle = animationCandidates(names, "idle")[0];
    if (talking || idle) this.play((talking || idle)!, talking ? "talking" : "idle");
  }
  private play(name: string, mode: "idle" | "talking" | "emote") {
    const clip = this.clips.get(name);
    if (!clip) return;
    if (this.name === name && this.action?.isRunning()) return;
    const next = this.mixer.clipAction(clip);
    next.reset().setLoop(mode === "emote" ? LoopOnce : LoopRepeat, mode === "emote" ? 1 : Infinity);
    next.clampWhenFinished = mode === "emote";
    if (this.action && this.action !== next) {
      this.action.fadeOut(0.4);
      next.fadeIn(0.4);
    }
    next.play();
    this.action = next;
    this.name = name;
    this.mode = mode;
    this.idleLoops = 0;
  }
  private onFinished = (event: { action: AnimationAction }) => {
    if (event.action === this.action && this.mode === "emote") this.resume();
  };
  private onLoop = (event: { action: AnimationAction; loopDelta: number }) => {
    if (event.action !== this.action || this.mode !== "idle" || !this.cycleIdle) return;
    this.idleLoops += Math.abs(event.loopDelta);
    if (this.idleLoops < 2) return;
    const choices = animationCandidates([...this.clips.keys()], "idle").filter((name) => name !== this.name);
    if (choices.length) this.play(choices[Math.floor(Math.random() * choices.length)], "idle");
  };
  dispose() {
    this.mixer.removeEventListener("finished", this.onFinished);
    this.mixer.removeEventListener("loop", this.onLoop);
    this.mixer.stopAllAction();
    this.clips.clear();
  }
}
