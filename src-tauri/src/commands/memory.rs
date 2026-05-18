use crate::AppState;
use std::sync::Arc;
use tauri::State;

fn get_user_id(state: &AppState) -> String {
    let config = state.config.load().unwrap_or_default();
    if !config.user.id.is_empty() {
        config.user.id
    } else if config.user.name.is_empty() {
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
    let vault_memories = state
        .memory_vault
        .list_memories(&character_id, &user_id, None, 200)
        .map_err(|e| e.to_string())?;
    if !vault_memories.is_empty() {
        return vault_memories
            .into_iter()
            .map(|m| {
                serde_json::to_value(meux_core::memory_vault::VaultMemoryRecord::from(m))
                    .map_err(|e| e.to_string())
            })
            .collect();
    }

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
    let vault_results = state
        .memory_vault
        .search_memories(&character_id, &user_id, &query, 20)
        .map_err(|e| e.to_string())?;
    if !vault_results.is_empty() {
        return vault_results
            .into_iter()
            .map(|m| {
                serde_json::to_value(meux_core::memory_vault::VaultMemoryRecord::from(m))
                    .map_err(|e| e.to_string())
            })
            .collect();
    }

    let all_memories = state
        .memories
        .list(&character_id, &user_id, None, usize::MAX)
        .map_err(|e| e.to_string())?;
    let relevant = meux_core::memory::retriever::retrieve_relevant(&query, &all_memories, 4);
    let values: Vec<serde_json::Value> = relevant
        .iter()
        .map(|m| serde_json::to_value(m).unwrap_or_default())
        .collect();
    Ok(values)
}

#[tauri::command]
pub fn memory_clear(state: State<Arc<AppState>>, character_id: String) -> Result<(), String> {
    let user_id = get_user_id(&state);
    state
        .memory_vault
        .clear(&character_id, &user_id)
        .map_err(|e| e.to_string())?;
    state
        .memories
        .clear(&character_id, &user_id, None)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_overview(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<serde_json::Value, String> {
    let user_id = get_user_id(&state);
    let overview = state
        .memory_vault
        .overview(&character_id, &user_id)
        .map_err(|e| e.to_string())?;
    serde_json::to_value(overview).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_rebuild_vault(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<String, String> {
    let user_id = get_user_id(&state);
    let path = state
        .memory_vault
        .rebuild_vault(&character_id, &user_id)
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn memory_run_dream(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<serde_json::Value, String> {
    let user_id = get_user_id(&state);
    let dream = state
        .memory_vault
        .run_dream(&character_id, &user_id)
        .map_err(|e| e.to_string())?;
    serde_json::to_value(dream).map_err(|e| e.to_string())
}
