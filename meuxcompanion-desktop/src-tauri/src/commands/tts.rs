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
