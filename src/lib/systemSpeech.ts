export interface SystemVoice {
  id: string;
  name: string;
}

type SpeechSynthesisLike = {
  getVoices: () => SpeechSynthesisVoice[];
  speak: (utterance: SpeechSynthesisUtterance) => void;
  cancel: () => void;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

function synthesis(): SpeechSynthesisLike | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  return window.speechSynthesis;
}

function waitForVoices(synth: SpeechSynthesisLike): Promise<SpeechSynthesisVoice[]> {
  const existing = synth.getVoices();
  if (existing.length > 0) {
    return Promise.resolve(existing);
  }
  return new Promise((resolve) => {
    const finish = () => {
      synth.removeEventListener?.("voiceschanged", finish);
      resolve(synth.getVoices());
    };
    synth.addEventListener?.("voiceschanged", finish);
    window.setTimeout(finish, 250);
  });
}

export async function listSystemVoices(): Promise<SystemVoice[]> {
  const synth = synthesis();
  if (!synth) return [];
  const voices = await waitForVoices(synth);
  return voices.map((voice) => ({
    id: voice.voiceURI,
    name: voice.name ? `${voice.name} (${voice.lang})` : voice.voiceURI,
  }));
}

export function cancelSystemSpeech(): void {
  synthesis()?.cancel();
}

export function speak(text: string, voiceURI?: string): Promise<void> {
  const synth = synthesis();
  if (!synth) {
    return Promise.reject(new Error("This computer has no system voices available."));
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(trimmed);
    if (voiceURI) {
      const match = synth.getVoices().find((voice) => voice.voiceURI === voiceURI);
      if (match) utterance.voice = match;
    }
    utterance.onend = () => resolve();
    utterance.onerror = (event) => {
      if (event.error === "canceled" || event.error === "interrupted") {
        resolve();
        return;
      }
      reject(new Error(event.error || "System speech failed"));
    };
    synth.cancel();
    synth.speak(utterance);
  });
}
