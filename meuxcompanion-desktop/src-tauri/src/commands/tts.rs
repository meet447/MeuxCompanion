use crate::AppState;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn tts_voices(
    _state: State<Arc<AppState>>,
    provider: String,
) -> Result<Vec<meux_core::tts::VoiceInfo>, String> {
    Ok(meux_core::tts::list_voices(&provider))
}

#[tauri::command]
pub async fn tts_preview(
    _state: State<'_, Arc<AppState>>,
    provider: String,
    voice: String,
    api_key: Option<String>,
    text: Option<String>,
) -> Result<Vec<u8>, String> {
    let sample_text = text.unwrap_or_else(|| "Hello! This is a voice preview.".to_string());

    let tts_config = meux_core::config::types::TtsConfig {
        provider: provider.clone(),
        api_key,
        voice,
    };

    meux_core::tts::generate_tts_auto(&sample_text, &tts_config)
        .await
        .map_err(|e| e.to_string())
}
