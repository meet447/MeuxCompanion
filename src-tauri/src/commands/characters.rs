use crate::AppState;
use meux_core::character::types::{Character, CharacterSummary, ModelInfo};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn characters_list(state: State<Arc<AppState>>) -> Result<Vec<CharacterSummary>, String> {
    state.characters.list_characters().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn characters_get(state: State<Arc<AppState>>, id: String) -> Result<Character, String> {
    state
        .characters
        .load_character(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn characters_create(
    state: State<Arc<AppState>>,
    name: String,
    personality: String,
    model_id: String,
    voice: String,
    user_name: String,
    user_about: String,
) -> Result<String, String> {
    state
        .characters
        .create_character(&name, &personality, &model_id, &voice, &user_name, &user_about)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn models_list(state: State<Arc<AppState>>) -> Result<Vec<ModelInfo>, String> {
    meux_core::character::list_models(&state.data_dir).map_err(|e| e.to_string())
}
