import { invoke } from "@tauri-apps/api/core";

export interface WhisperModelStatus {
  present: boolean;
  loaded: boolean;
  path: string | null;
  size_bytes: number | null;
}

export async function whisperModelStatus(): Promise<WhisperModelStatus> {
  return invoke<WhisperModelStatus>("voice_whisper_status");
}

export async function downloadWhisperModel(): Promise<void> {
  await invoke("voice_whisper_download");
}
