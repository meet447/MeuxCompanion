import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelSystemSpeech, listSystemVoices, speak } from "./systemSpeech";

function installSynth(voices: Array<{ voiceURI: string; name: string; lang: string }>) {
  class FakeUtterance {
    text: string;
    voice: SpeechSynthesisVoice | null = null;
    onend: ((event: SpeechSynthesisEvent) => void) | null = null;
    onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    value: FakeUtterance,
  });
  const listeners = new Map<string, Array<() => void>>();
  const synth = {
    getVoices: () => voices as unknown as SpeechSynthesisVoice[],
    speak: vi.fn((utterance: SpeechSynthesisUtterance) => {
      window.setTimeout(() => {
        utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
      }, 0);
    }),
    cancel: vi.fn(),
    addEventListener: (type: string, listener: () => void) => {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    removeEventListener: (type: string, listener: () => void) => {
      const list = (listeners.get(type) ?? []).filter((item) => item !== listener);
      listeners.set(type, list);
    },
  };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synth });
  return synth;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("systemSpeech", () => {
  it("lists system voices", async () => {
    installSynth([{ voiceURI: "uri-1", name: "Samantha", lang: "en-US" }]);
    await expect(listSystemVoices()).resolves.toEqual([
      { id: "uri-1", name: "Samantha (en-US)" },
    ]);
  });

  it("resolves speak on end", async () => {
    const synth = installSynth([{ voiceURI: "uri-1", name: "Samantha", lang: "en-US" }]);
    await speak("Hello there", "uri-1");
    expect(synth.speak).toHaveBeenCalledOnce();
  });

  it("cancelSystemSpeech calls cancel", () => {
    const synth = installSynth([]);
    cancelSystemSpeech();
    expect(synth.cancel).toHaveBeenCalledOnce();
  });
});
