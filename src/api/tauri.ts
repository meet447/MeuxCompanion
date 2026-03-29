import { invoke } from "@tauri-apps/api/core";

// Asset paths — serves files from app data directory
// In dev mode: Vite middleware serves from /static/
// In production: TODO — use Tauri asset protocol or embed
export function toAssetUrl(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, "");
  return `/static/${clean}`;
}

// Config
export async function getConfig() {
  return invoke("config_get");
}

export async function saveConfig(config: unknown) {
  return invoke("config_save", { config });
}

export async function testLlm(provider: {
  base_url: string;
  api_key: string;
  model: string;
}) {
  return invoke<string>("config_test_llm", { provider });
}

// Characters
export async function listCharacters() {
  return invoke<unknown[]>("characters_list");
}

export async function getCharacter(id: string) {
  return invoke<unknown>("characters_get", { id });
}

export async function createCharacter(data: {
  name: string;
  personality: string;
  modelId: string;
  voice: string;
  vibe: string;
  relationshipStyle: string;
  speechStyle: string;
  userName: string;
  userAbout: string;
}) {
  return invoke<string>("characters_create", {
    name: data.name,
    personality: data.personality,
    modelId: data.modelId,
    voice: data.voice,
    vibe: data.vibe,
    relationshipStyle: data.relationshipStyle,
    speechStyle: data.speechStyle,
    userName: data.userName,
    userAbout: data.userAbout,
  });
}

// Models
export async function listModels() {
  return invoke<any[]>("models_list");
}

export async function importLive2DModel() {
  return invoke<any | null>("models_import_live2d_dialog");
}

export async function importVRMModel() {
  return invoke<any | null>("models_import_vrm_dialog");
}

// Chat
export async function sendChat(characterId: string, message: string) {
  return invoke("chat_send", { characterId, message });
}

export async function getChatHistory(characterId: string) {
  return invoke<unknown[]>("chat_history", { characterId });
}

export async function clearChat(characterId: string) {
  return invoke("chat_clear", { characterId });
}

export async function transcribeVoice(audioBase64: string, mimeType: string) {
  return invoke<string>("voice_transcribe", { audioBase64, mimeType });
}

// Memory
export async function getMemory(characterId: string) {
  return invoke<unknown[]>("memory_get", { characterId });
}

export async function searchMemory(characterId: string, query: string) {
  return invoke<unknown[]>("memory_search", { characterId, query });
}

export async function clearMemory(characterId: string) {
  return invoke("memory_clear", { characterId });
}

// State
export async function getState(characterId: string) {
  return invoke<unknown>("state_get", { characterId });
}

export async function resetState(characterId: string) {
  return invoke<any>("state_reset", { characterId });
}

// Expressions
export async function getSupportedExpressions() {
  return invoke<string[]>("expressions_supported");
}

export async function getModelExpressions(modelId: string) {
  return invoke<string[]>("expressions_model_list", { modelId });
}

export async function getExpressions(modelId: string) {
  return invoke<Record<string, string>>("expressions_get", { modelId });
}

export async function saveExpressions(
  modelId: string,
  mapping: Record<string, string>,
) {
  return invoke("expressions_save", { modelId, mapping });
}

// TTS
export async function getVoices(provider: string) {
  return invoke<{ id: string; name: string }[]>("tts_voices", { provider });
}

export async function previewVoice(provider: string, voice: string, apiKey?: string, text?: string) {
  return invoke<number[]>("tts_preview", { provider, voice, apiKey: apiKey || null, text: text || null });
}

// Window
export async function toggleMiniMode(selectedCharacterId?: string) {
  return invoke("window_toggle_mini", {
    selectedCharacterId: selectedCharacterId || null,
  });
}

export async function expandWindow() {
  return invoke("window_expand");
}
