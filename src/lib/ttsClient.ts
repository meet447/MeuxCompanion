import { getVoices as getRemoteVoices, previewVoice as previewRemoteVoice } from "../api/tauri";
import { cancelSystemSpeech, listSystemVoices, speak } from "./systemSpeech";
import { isSystemSpeechProvider } from "./ttsPresets";

export async function getVoices(provider: string) {
  if (isSystemSpeechProvider(provider)) {
    const voices = await listSystemVoices();
    return [{ id: "", name: "System default" }, ...voices];
  }
  return getRemoteVoices(provider);
}

export async function previewVoice(
  provider: string,
  voice: string,
  apiKey?: string,
  text?: string,
): Promise<number[]> {
  if (isSystemSpeechProvider(provider)) {
    cancelSystemSpeech();
    await speak(text || "Hello! This is a voice preview.", voice);
    return [];
  }
  return previewRemoteVoice(provider, voice, apiKey, text);
}
