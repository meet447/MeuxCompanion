/** User-facing TTS provider labels (internal config id for Meuxe TTS stays `tiktok`). */

export interface TtsPresetUi {
  name: string;
  needs_key: boolean;
  hint?: string;
}

export const TTS_PRESETS_UI: Record<string, TtsPresetUi> = {
  tiktok: {
    name: "Meuxe TTS",
    needs_key: false,
    hint: "Built into Meuxe - free, no API key needed",
  },
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

export const DEFAULT_TTS_PROVIDER = "tiktok";
export const DEFAULT_TTS_VOICE = "en_us_001";

/** True for the local Web Speech path. */
export function isSystemSpeechProvider(provider: string): boolean {
  return provider === "system";
}

export function resolvedTtsProvider(provider?: string): string {
  if (!provider) return DEFAULT_TTS_PROVIDER;
  if (isSystemSpeechProvider(provider)) return "system";
  return provider;
}
