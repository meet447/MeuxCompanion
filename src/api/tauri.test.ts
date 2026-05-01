import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as tauri from './tauri';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('tauri API utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('toAssetUrl', () => {
    it('should correctly format an absolute path', () => {
      expect(tauri.toAssetUrl('/path/to/asset')).toBe('/static/path/to/asset');
    });

    it('should correctly format a relative path', () => {
      expect(tauri.toAssetUrl('path/to/asset')).toBe('/static/path/to/asset');
    });

    it('should handle paths with multiple leading slashes', () => {
      expect(tauri.toAssetUrl('///path/to/asset')).toBe('/static/path/to/asset');
    });

    it('should handle empty string', () => {
      expect(tauri.toAssetUrl('')).toBe('/static/');
    });
  });

  describe('Config', () => {
    it('getConfig should call config_get', async () => {
      await tauri.getConfig();
      expect(invoke).toHaveBeenCalledWith('config_get');
    });

    it('saveConfig should call config_save with correct config', async () => {
      const mockConfig = { some: 'config' };
      await tauri.saveConfig(mockConfig);
      expect(invoke).toHaveBeenCalledWith('config_save', { config: mockConfig });
    });

    it('testLlm should call config_test_llm with provider data', async () => {
      const provider = { base_url: 'http://test', api_key: 'test', model: 'test' };
      await tauri.testLlm(provider);
      expect(invoke).toHaveBeenCalledWith('config_test_llm', { provider });
    });
  });

  describe('Tools', () => {
    it('listTools should call tools_list', async () => {
      await tauri.listTools();
      expect(invoke).toHaveBeenCalledWith('tools_list');
    });
  });

  describe('Characters', () => {
    it('listCharacters should call characters_list', async () => {
      await tauri.listCharacters();
      expect(invoke).toHaveBeenCalledWith('characters_list');
    });

    it('getCharacter should call characters_get with correct id', async () => {
      const id = 'test_id';
      await tauri.getCharacter(id);
      expect(invoke).toHaveBeenCalledWith('characters_get', { id });
    });

    it('createCharacter should call characters_create with correct data', async () => {
      const characterData = {
        name: 'test_name',
        personality: 'test_personality',
        modelId: 'test_modelId',
        voice: 'test_voice',
        vibe: 'test_vibe',
        relationshipStyle: 'test_relationshipStyle',
        speechStyle: 'test_speechStyle',
        userName: 'test_userName',
        userAbout: 'test_userAbout'
      };
      await tauri.createCharacter(characterData);
      expect(invoke).toHaveBeenCalledWith('characters_create', characterData);
    });
  });

  describe('Models & Expressions', () => {
    it('listModels should call models_list', async () => {
      await tauri.listModels();
      expect(invoke).toHaveBeenCalledWith('models_list');
    });

    it('importLive2DModel should call models_import_live2d_dialog', async () => {
      await tauri.importLive2DModel();
      expect(invoke).toHaveBeenCalledWith('models_import_live2d_dialog');
    });

    it('importVRMModel should call models_import_vrm_dialog', async () => {
      await tauri.importVRMModel();
      expect(invoke).toHaveBeenCalledWith('models_import_vrm_dialog');
    });

    it('getSupportedExpressions should call expressions_supported', async () => {
      await tauri.getSupportedExpressions();
      expect(invoke).toHaveBeenCalledWith('expressions_supported');
    });

    it('getModelExpressions should call expressions_model_list with correct modelId', async () => {
      const modelId = 'test_modelId';
      await tauri.getModelExpressions(modelId);
      expect(invoke).toHaveBeenCalledWith('expressions_model_list', { modelId });
    });

    it('getExpressions should call expressions_get with correct modelId', async () => {
      const modelId = 'test_modelId';
      await tauri.getExpressions(modelId);
      expect(invoke).toHaveBeenCalledWith('expressions_get', { modelId });
    });

    it('saveExpressions should call expressions_save with correct modelId and mapping', async () => {
      const modelId = 'test_modelId';
      const mapping = { key1: 'value1', key2: 'value2' };
      await tauri.saveExpressions(modelId, mapping);
      expect(invoke).toHaveBeenCalledWith('expressions_save', { modelId, mapping });
    });
  });

  describe('Chat & Memory', () => {
    it('sendChat should call chat_send with correct characterId and message', async () => {
      const characterId = 'test_char_id';
      const message = 'Hello there!';
      await tauri.sendChat(characterId, message);
      expect(invoke).toHaveBeenCalledWith('chat_send', { characterId, message });
    });

    it('getChatHistory should call chat_history with correct characterId', async () => {
      const characterId = 'test_char_id';
      await tauri.getChatHistory(characterId);
      expect(invoke).toHaveBeenCalledWith('chat_history', { characterId });
    });

    it('clearChat should call chat_clear with correct characterId', async () => {
      const characterId = 'test_char_id';
      await tauri.clearChat(characterId);
      expect(invoke).toHaveBeenCalledWith('chat_clear', { characterId });
    });

    it('confirmToolCall should call tool_confirm with correct requestId and approved status', async () => {
      const requestId = 'req_123';
      const approved = true;
      await tauri.confirmToolCall(requestId, approved);
      expect(invoke).toHaveBeenCalledWith('tool_confirm', { requestId, approved });
    });

    it('getMemory should call memory_get with correct characterId', async () => {
      const characterId = 'test_char_id';
      await tauri.getMemory(characterId);
      expect(invoke).toHaveBeenCalledWith('memory_get', { characterId });
    });

    it('searchMemory should call memory_search with correct characterId and query', async () => {
      const characterId = 'test_char_id';
      const query = 'favorite color';
      await tauri.searchMemory(characterId, query);
      expect(invoke).toHaveBeenCalledWith('memory_search', { characterId, query });
    });

    it('clearMemory should call memory_clear with correct characterId', async () => {
      const characterId = 'test_char_id';
      await tauri.clearMemory(characterId);
      expect(invoke).toHaveBeenCalledWith('memory_clear', { characterId });
    });
  });

  describe('Voice & TTS', () => {
    it('transcribeVoice should call voice_transcribe with base64 and mimeType', async () => {
      const audioBase64 = 'base64_audio_data';
      const mimeType = 'audio/webm';
      await tauri.transcribeVoice(audioBase64, mimeType);
      expect(invoke).toHaveBeenCalledWith('voice_transcribe', { audioBase64, mimeType });
    });

    it('transcribeVoiceLocal should call voice_transcribe_local with pcmBase64', async () => {
      const pcmBase64 = 'base64_pcm_data';
      await tauri.transcribeVoiceLocal(pcmBase64);
      expect(invoke).toHaveBeenCalledWith('voice_transcribe_local', { pcmBase64 });
    });

    it('getVoices should call tts_voices with provider', async () => {
      const provider = 'test_provider';
      await tauri.getVoices(provider);
      expect(invoke).toHaveBeenCalledWith('tts_voices', { provider });
    });

    it('previewVoice should call tts_preview with required arguments', async () => {
      const provider = 'test_provider';
      const voice = 'test_voice';
      await tauri.previewVoice(provider, voice);
      expect(invoke).toHaveBeenCalledWith('tts_preview', { provider, voice, apiKey: null, text: null });
    });

    it('previewVoice should call tts_preview with all arguments', async () => {
      const provider = 'test_provider';
      const voice = 'test_voice';
      const apiKey = 'test_apiKey';
      const text = 'test_text';
      await tauri.previewVoice(provider, voice, apiKey, text);
      expect(invoke).toHaveBeenCalledWith('tts_preview', { provider, voice, apiKey, text });
    });
  });

  describe('Window', () => {
    it('toggleMiniMode should call window_toggle_mini with null if no characterId provided', async () => {
      await tauri.toggleMiniMode();
      expect(invoke).toHaveBeenCalledWith('window_toggle_mini', { selectedCharacterId: null });
    });

    it('toggleMiniMode should call window_toggle_mini with characterId if provided', async () => {
      const selectedCharacterId = 'test_char_id';
      await tauri.toggleMiniMode(selectedCharacterId);
      expect(invoke).toHaveBeenCalledWith('window_toggle_mini', { selectedCharacterId });
    });

    it('expandWindow should call window_expand', async () => {
      await tauri.expandWindow();
      expect(invoke).toHaveBeenCalledWith('window_expand');
    });
  });
});
