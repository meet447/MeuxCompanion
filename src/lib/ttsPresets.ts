/** User-facing TTS provider labels. */

export interface TtsPresetUi {
  name: string;
  needs_key: boolean;
  hint?: string;
}

export const TTS_PRESETS_UI: Record<string, TtsPresetUi> = {
  system: {
    name: "System voice",
    needs_key: false,
    hint: "Uses the voices on this computer. Nothing leaves this device.",
  },
  elevenlabs: {
    name: "ElevenLabs",
    needs_key: true,
    hint: "Studio voices (API key). Text is sent to ElevenLabs.",
  },
  openai_tts: {
    name: "OpenAI",
    needs_key: true,
    hint: "OpenAI speech (API key). Text is sent to OpenAI.",
  },
};

export const DEFAULT_TTS_PROVIDER = "system";
export const DEFAULT_TTS_VOICE = "";

/** True for the local Web Speech path, including migrated TikTok configs. */
export function isSystemSpeechProvider(provider: string): boolean {
  return provider === "system" || provider === "tiktok" || provider === "";
}

export function resolvedTtsProvider(provider?: string): string {
  if (!provider || isSystemSpeechProvider(provider)) return "system";
  return provider;
}
