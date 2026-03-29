import { invoke } from "@tauri-apps/api/core";

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
  userName: string;
  userAbout: string;
}) {
  return invoke<string>("characters_create", {
    name: data.name,
    personality: data.personality,
    model_id: data.modelId,
    voice: data.voice,
    user_name: data.userName,
    user_about: data.userAbout,
  });
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

// Expressions
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

// Window
export async function toggleMiniMode() {
  return invoke("window_toggle_mini");
}

export async function expandWindow() {
  return invoke("window_expand");
}
