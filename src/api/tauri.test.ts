import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import * as tauriApi from './tauri';

// Mock the invoke function from @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('tauri api utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('toAssetUrl', () => {
    it('should strip leading slashes and prepend /static/', () => {
      expect(tauriApi.toAssetUrl('/my-asset.png')).toBe('/static/my-asset.png');
      expect(tauriApi.toAssetUrl('my-asset.png')).toBe('/static/my-asset.png');
      expect(tauriApi.toAssetUrl('///deep/path.png')).toBe('/static/deep/path.png');
    });
  });

  describe('Config functions', () => {
    it('getConfig calls config_get', async () => {
      await tauriApi.getConfig();
      expect(invoke).toHaveBeenCalledWith('config_get');
    });

    it('saveConfig calls config_save with correct config', async () => {
      const mockConfig = { theme: 'dark' };
      await tauriApi.saveConfig(mockConfig);
      expect(invoke).toHaveBeenCalledWith('config_save', { config: mockConfig });
    });

    it('testLlm calls config_test_llm with correct provider data', async () => {
      const providerData = {
        base_url: 'http://localhost:8080',
        api_key: 'test-key',
        model: 'test-model'
      };
      await tauriApi.testLlm(providerData);
      expect(invoke).toHaveBeenCalledWith('config_test_llm', { provider: providerData });
    });
  });

  describe('Character functions', () => {
    it('listCharacters calls characters_list', async () => {
      await tauriApi.listCharacters();
      expect(invoke).toHaveBeenCalledWith('characters_list');
    });

    it('getCharacter calls characters_get with correct id', async () => {
      await tauriApi.getCharacter('char-123');
      expect(invoke).toHaveBeenCalledWith('characters_get', { id: 'char-123' });
    });

    it('createCharacter calls characters_create with properly mapped data', async () => {
      const charData = {
        name: 'Alice',
        personality: 'Friendly',
        modelId: 'model-1',
        voice: 'voice-1',
        vibe: 'calm',
        relationshipStyle: 'platonic',
        speechStyle: 'casual',
        userName: 'Bob',
        userAbout: 'User likes AI'
      };
      await tauriApi.createCharacter(charData);
      expect(invoke).toHaveBeenCalledWith('characters_create', charData);
    });
  });

  describe('Model functions', () => {
    it('listModels calls models_list', async () => {
      await tauriApi.listModels();
      expect(invoke).toHaveBeenCalledWith('models_list');
    });

    it('importLive2DModel calls models_import_live2d_dialog', async () => {
      await tauriApi.importLive2DModel();
      expect(invoke).toHaveBeenCalledWith('models_import_live2d_dialog');
    });

    it('importVRMModel calls models_import_vrm_dialog', async () => {
      await tauriApi.importVRMModel();
      expect(invoke).toHaveBeenCalledWith('models_import_vrm_dialog');
    });
  });

  describe('Chat functions', () => {
    it('sendChat calls chat_send', async () => {
      await tauriApi.sendChat('char-1', 'Hello');
      expect(invoke).toHaveBeenCalledWith('chat_send', { characterId: 'char-1', message: 'Hello' });
    });

    it('getChatHistory calls chat_history', async () => {
      await tauriApi.getChatHistory('char-1');
      expect(invoke).toHaveBeenCalledWith('chat_history', { characterId: 'char-1' });
    });

    it('clearChat calls chat_clear', async () => {
      await tauriApi.clearChat('char-1');
      expect(invoke).toHaveBeenCalledWith('chat_clear', { characterId: 'char-1' });
    });

    it('confirmToolCall calls tool_confirm', async () => {
      await tauriApi.confirmToolCall('req-1', true);
      expect(invoke).toHaveBeenCalledWith('tool_confirm', { requestId: 'req-1', approved: true });
    });

    it('transcribeVoice calls voice_transcribe', async () => {
      await tauriApi.transcribeVoice('base64audio', 'audio/webm');
      expect(invoke).toHaveBeenCalledWith('voice_transcribe', { audioBase64: 'base64audio', mimeType: 'audio/webm' });
    });

    it('transcribeVoiceLocal calls voice_transcribe_local', async () => {
      await tauriApi.transcribeVoiceLocal('pcmBase64Data');
      expect(invoke).toHaveBeenCalledWith('voice_transcribe_local', { pcmBase64: 'pcmBase64Data' });
    });
  });

  describe('Memory functions', () => {
    it('getMemory calls memory_get', async () => {
      await tauriApi.getMemory('char-1');
      expect(invoke).toHaveBeenCalledWith('memory_get', { characterId: 'char-1' });
    });

    it('searchMemory calls memory_search', async () => {
      await tauriApi.searchMemory('char-1', 'apples');
      expect(invoke).toHaveBeenCalledWith('memory_search', { characterId: 'char-1', query: 'apples' });
    });

    it('clearMemory calls memory_clear', async () => {
      await tauriApi.clearMemory('char-1');
      expect(invoke).toHaveBeenCalledWith('memory_clear', { characterId: 'char-1' });
    });
  });

  describe('Tool functions', () => {
    it('listTools calls tools_list', async () => {
      await tauriApi.listTools();
      expect(invoke).toHaveBeenCalledWith('tools_list');
    });
  });

  describe('Expression functions', () => {
    it('getSupportedExpressions calls expressions_supported', async () => {
      await tauriApi.getSupportedExpressions();
      expect(invoke).toHaveBeenCalledWith('expressions_supported');
    });

    it('getModelExpressions calls expressions_model_list', async () => {
      await tauriApi.getModelExpressions('model-1');
      expect(invoke).toHaveBeenCalledWith('expressions_model_list', { modelId: 'model-1' });
    });

    it('getExpressions calls expressions_get', async () => {
      await tauriApi.getExpressions('model-1');
      expect(invoke).toHaveBeenCalledWith('expressions_get', { modelId: 'model-1' });
    });

    it('saveExpressions calls expressions_save', async () => {
      const mapping = { neutral: 'exp_01' };
      await tauriApi.saveExpressions('model-1', mapping);
      expect(invoke).toHaveBeenCalledWith('expressions_save', { modelId: 'model-1', mapping });
    });
  });

  describe('TTS functions', () => {
    it('getVoices calls tts_voices', async () => {
      await tauriApi.getVoices('openai');
      expect(invoke).toHaveBeenCalledWith('tts_voices', { provider: 'openai' });
    });

    it('previewVoice calls tts_preview', async () => {
      await tauriApi.previewVoice('openai', 'alloy', 'my-key', 'Hello world');
      expect(invoke).toHaveBeenCalledWith('tts_preview', {
        provider: 'openai',
        voice: 'alloy',
        apiKey: 'my-key',
        text: 'Hello world'
      });
    });

    it('previewVoice handles null optional arguments', async () => {
      await tauriApi.previewVoice('openai', 'alloy');
      expect(invoke).toHaveBeenCalledWith('tts_preview', {
        provider: 'openai',
        voice: 'alloy',
        apiKey: null,
        text: null
      });
    });
  });

  describe('Window functions', () => {
    it('toggleMiniMode calls window_toggle_mini', async () => {
      await tauriApi.toggleMiniMode('char-1');
      expect(invoke).toHaveBeenCalledWith('window_toggle_mini', { selectedCharacterId: 'char-1' });
    });

    it('toggleMiniMode handles missing characterId', async () => {
      await tauriApi.toggleMiniMode();
      expect(invoke).toHaveBeenCalledWith('window_toggle_mini', { selectedCharacterId: null });
    });

    it('expandWindow calls window_expand', async () => {
      await tauriApi.expandWindow();
      expect(invoke).toHaveBeenCalledWith('window_expand');
    });
  });
});
