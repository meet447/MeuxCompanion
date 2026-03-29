use crate::AppState;
use std::sync::Arc;
use tauri::State;

fn get_user_id(state: &AppState) -> String {
    let config = state.config.load().unwrap_or_default();
    if config.user.name.is_empty() {
        "default-user".to_string()
    } else {
        meux_core::character::slugify(&config.user.name)
    }
}

#[tauri::command]
pub fn memory_get(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let user_id = get_user_id(&state);
    let memories = state
        .memories
        .list(&character_id, &user_id, None, 50)
        .map_err(|e| e.to_string())?;
    let values: Vec<serde_json::Value> = memories
        .iter()
        .map(|m| serde_json::to_value(m).unwrap_or_default())
        .collect();
    Ok(values)
}

#[tauri::command]
pub fn memory_search(
    state: State<Arc<AppState>>,
    character_id: String,
    query: String,
) -> Result<Vec<serde_json::Value>, String> {
    let user_id = get_user_id(&state);
    let all_memories = state
        .memories
        .list(&character_id, &user_id, None, usize::MAX)
        .map_err(|e| e.to_string())?;
    let relevant =
        meux_core::memory::retriever::retrieve_relevant(&query, &all_memories, 4);
    let values: Vec<serde_json::Value> = relevant
        .iter()
        .map(|m| serde_json::to_value(m).unwrap_or_default())
        .collect();
    Ok(values)
}

#[tauri::command]
pub fn memory_clear(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<(), String> {
    let user_id = get_user_id(&state);
    state
        .memories
        .clear(&character_id, &user_id, None)
        .map_err(|e| e.to_string())
}
