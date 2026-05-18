use crate::AppState;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

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
    app: AppHandle,
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<serde_json::Value, String> {
    let user_id = get_user_id(&state);
    let _ = app.emit(
        "memory:dream-status",
        serde_json::json!({ "character_id": character_id, "status": "running" }),
    );
    let dream = state
        .memory_vault
        .run_dream(&character_id, &user_id)
        .map_err(|e| e.to_string())?;
    let _ = app.emit(
        "memory:dream-status",
        serde_json::json!({ "character_id": character_id, "status": "completed", "dream": dream.clone() }),
    );
    serde_json::to_value(dream).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_dream_status(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<serde_json::Value, String> {
    let user_id = get_user_id(&state);
    let dream = state
        .memory_vault
        .latest_dream(&character_id, &user_id)
        .map_err(|e| e.to_string())?;
    serde_json::to_value(dream).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_migrate_legacy(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<usize, String> {
    let user_id = get_user_id(&state);
    let legacy = state
        .memories
        .list(&character_id, &user_id, None, usize::MAX)
        .map_err(|e| e.to_string())?;
    state
        .memory_vault
        .migrate_legacy_memories(&character_id, &user_id, &legacy)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_delete(
    state: State<Arc<AppState>>,
    character_id: String,
    memory_id: String,
) -> Result<(), String> {
    let user_id = get_user_id(&state);
    state
        .memory_vault
        .delete_memory(&character_id, &user_id, &memory_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_set_pinned(
    state: State<Arc<AppState>>,
    character_id: String,
    memory_id: String,
    pinned: bool,
) -> Result<(), String> {
    let user_id = get_user_id(&state);
    state
        .memory_vault
        .set_memory_pinned(&character_id, &user_id, &memory_id, pinned)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_sources(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<serde_json::Value, String> {
    let user_id = get_user_id(&state);
    let sources = state
        .memory_vault
        .list_sources(&character_id, &user_id, 100)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(meux_core::memory_vault::types::MemorySourceRecord::from)
        .collect::<Vec<_>>();
    serde_json::to_value(sources).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_topics(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<serde_json::Value, String> {
    let user_id = get_user_id(&state);
    let topics = state
        .memory_vault
        .topic_summaries(&character_id, &user_id)
        .map_err(|e| e.to_string())?;
    serde_json::to_value(topics).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_ingest_note(
    state: State<Arc<AppState>>,
    character_id: String,
    title: String,
    body: String,
) -> Result<usize, String> {
    let user_id = get_user_id(&state);
    let saved = state
        .memory_vault
        .ingest_manual_note(&character_id, &user_id, &title, &body)
        .map_err(|e| e.to_string())?;
    Ok(saved.len())
}

#[tauri::command]
pub fn memory_ingest_transcript(
    state: State<Arc<AppState>>,
    character_id: String,
    title: String,
    transcript: String,
) -> Result<usize, String> {
    let user_id = get_user_id(&state);
    let saved = state
        .memory_vault
        .ingest_meeting_transcript(&character_id, &user_id, &title, &transcript)
        .map_err(|e| e.to_string())?;
    Ok(saved.len())
}

#[tauri::command]
pub fn memory_ingest_file_dialog(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<Option<usize>, String> {
    let user_id = get_user_id(&state);
    let Some(path) = rfd::FileDialog::new()
        .add_filter("Text", &["md", "markdown", "txt"])
        .pick_file()
    else {
        return Ok(None);
    };
    let saved = state
        .memory_vault
        .ingest_text_file(&character_id, &user_id, path)
        .map_err(|e| e.to_string())?;
    Ok(Some(saved.len()))
}

#[tauri::command]
pub fn memory_ingest_folder_dialog(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<Option<usize>, String> {
    let user_id = get_user_id(&state);
    let Some(path) = rfd::FileDialog::new().pick_folder() else {
        return Ok(None);
    };
    let saved = state
        .memory_vault
        .ingest_text_folder(&character_id, &user_id, path)
        .map_err(|e| e.to_string())?;
    Ok(Some(saved))
}

#[tauri::command]
pub fn memory_export_zip_dialog(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<Option<String>, String> {
    let user_id = get_user_id(&state);
    let Some(path) = rfd::FileDialog::new()
        .set_file_name("meux-memory-vault.zip")
        .save_file()
    else {
        return Ok(None);
    };
    let exported = state
        .memory_vault
        .export_zip(&character_id, &user_id, path)
        .map_err(|e| e.to_string())?;
    Ok(Some(exported.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn memory_import_zip_dialog(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<Option<usize>, String> {
    let user_id = get_user_id(&state);
    let Some(path) = rfd::FileDialog::new()
        .add_filter("Zip", &["zip"])
        .pick_file()
    else {
        return Ok(None);
    };
    let imported = state
        .memory_vault
        .import_zip(&character_id, &user_id, path)
        .map_err(|e| e.to_string())?;
    Ok(Some(imported))
}

#[tauri::command]
pub fn composio_status(state: State<Arc<AppState>>) -> Result<serde_json::Value, String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    let has_key = config
        .composio
        .api_key
        .as_ref()
        .is_some_and(|key| !key.trim().is_empty() && !key.contains("..."));
    let enabled = if config.composio.enabled_toolkits.is_empty() {
        vec!["github".to_string(), "gmail".to_string()]
    } else {
        config.composio.enabled_toolkits.clone()
    };
    let statuses = enabled
        .into_iter()
        .map(
            |slug| meux_core::memory_vault::types::ComposioToolkitStatus {
                name: slug.to_ascii_uppercase(),
                slug,
                connected: has_key,
                status: if has_key {
                    "api_key_configured".to_string()
                } else {
                    "missing_api_key".to_string()
                },
                last_sync_at: None,
            },
        )
        .collect::<Vec<_>>();
    serde_json::to_value(statuses).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn composio_save_config(
    state: State<Arc<AppState>>,
    api_key: Option<String>,
    enabled_toolkits: Vec<String>,
) -> Result<(), String> {
    let mut config = state.config.load().map_err(|e| e.to_string())?;
    config.composio.api_key = api_key;
    config.composio.enabled_toolkits = enabled_toolkits;
    state.config.save(&config).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn composio_sync_github_readme(
    state: State<'_, Arc<AppState>>,
    character_id: String,
    owner: String,
    repo: String,
) -> Result<usize, String> {
    let user_id = get_user_id(&state);
    let url = format!("https://api.github.com/repos/{owner}/{repo}/readme");
    let readme = reqwest::Client::new()
        .get(url)
        .header("User-Agent", "MeuxCompanion")
        .header("Accept", "application/vnd.github.raw")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let saved = state
        .memory_vault
        .ingest_composio_github_readonly(&character_id, &user_id, &owner, &repo, &readme)
        .map_err(|e| e.to_string())?;
    Ok(saved.len())
}
