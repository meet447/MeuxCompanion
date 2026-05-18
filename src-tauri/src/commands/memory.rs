use crate::AppState;
use chrono::Utc;
use meux_core::config::types::ComposioConnectionConfig;
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

const COMPOSIO_BASE_URL: &str = "https://backend.composio.dev";

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

fn composio_api_key(state: &AppState) -> Result<String, String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    config
        .composio
        .api_key
        .filter(|key| !key.trim().is_empty() && !key.contains("..."))
        .ok_or_else(|| "Composio API key is not configured".to_string())
}

fn composio_client(api_key: &str) -> reqwest::Client {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        "x-api-key",
        reqwest::header::HeaderValue::from_str(api_key)
            .unwrap_or_else(|_| reqwest::header::HeaderValue::from_static("")),
    );
    headers.insert(
        reqwest::header::CONTENT_TYPE,
        reqwest::header::HeaderValue::from_static("application/json"),
    );
    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

async fn composio_request_json(request: reqwest::RequestBuilder) -> Result<Value, String> {
    let response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Composio request failed ({status}): {text}"));
    }
    serde_json::from_str(&text).map_err(|e| format!("Invalid Composio response: {e}"))
}

fn composio_items(value: &Value) -> Vec<Value> {
    value
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .or_else(|| value.get("data").and_then(Value::as_array).cloned())
        .unwrap_or_default()
}

fn value_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str).map(str::to_string))
}

fn connection_status_from_value(value: &Value) -> String {
    value_string(value, &["status"])
        .or_else(|| {
            value
                .get("connection")
                .and_then(|c| value_string(c, &["status"]))
        })
        .unwrap_or_else(|| "unknown".to_string())
}

async fn composio_find_or_create_auth_config(
    client: &reqwest::Client,
    toolkit: &str,
) -> Result<String, String> {
    let list_url = format!("{COMPOSIO_BASE_URL}/api/v3/auth_configs");
    let listed = composio_request_json(
        client
            .get(&list_url)
            .query(&[("toolkit_slug", toolkit), ("limit", "20")]),
    )
    .await?;
    if let Some(id) = composio_items(&listed)
        .iter()
        .find_map(|item| value_string(item, &["id", "nanoid"]))
    {
        return Ok(id);
    }

    let created = composio_request_json(client.post(&list_url).json(&serde_json::json!({
        "toolkit": { "slug": toolkit },
        "auth_config": {
            "type": "use_composio_managed_auth",
            "name": format!("MeuxCompanion {toolkit} Auth")
        }
    })))
    .await?;
    value_string(&created, &["id", "nanoid"])
        .or_else(|| {
            created
                .get("auth_config")
                .and_then(|v| value_string(v, &["id", "nanoid"]))
        })
        .ok_or_else(|| "Composio did not return an auth config id".to_string())
}

async fn composio_connected_account(
    client: &reqwest::Client,
    connected_account_id: &str,
) -> Result<Value, String> {
    composio_request_json(client.get(format!(
        "{COMPOSIO_BASE_URL}/api/v3/connected_accounts/{connected_account_id}"
    )))
    .await
}

async fn composio_list_connected_accounts(
    client: &reqwest::Client,
    user_id: &str,
    auth_config_id: Option<&str>,
) -> Result<Vec<Value>, String> {
    let mut query: Vec<(&str, &str)> = vec![("user_ids", user_id), ("limit", "100")];
    if let Some(auth_config_id) = auth_config_id {
        query.push(("auth_config_ids", auth_config_id));
    }
    let value = composio_request_json(
        client
            .get(format!("{COMPOSIO_BASE_URL}/api/v3/connected_accounts"))
            .query(&query),
    )
    .await?;
    Ok(composio_items(&value))
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
pub async fn composio_status(state: State<'_, Arc<AppState>>) -> Result<serde_json::Value, String> {
    let mut config = state.config.load().map_err(|e| e.to_string())?;
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

    let mut dirty = false;
    let client = config
        .composio
        .api_key
        .as_deref()
        .filter(|_| has_key)
        .map(composio_client);
    let mut statuses = Vec::new();
    for slug in enabled {
        let mut connection = config
            .composio
            .connections
            .get(&slug)
            .cloned()
            .unwrap_or_default();

        if let (Some(client), Some(account_id)) = (&client, connection.connected_account_id.clone())
        {
            match composio_connected_account(client, &account_id).await {
                Ok(value) => {
                    connection.status = connection_status_from_value(&value);
                    connection.last_checked_at = Some(Utc::now().to_rfc3339());
                    dirty = true;
                }
                Err(err) => {
                    connection.status = format!("refresh_failed: {err}");
                    connection.last_checked_at = Some(Utc::now().to_rfc3339());
                    dirty = true;
                }
            }
        }

        let connected = connection.status.eq_ignore_ascii_case("active")
            || connection.status.eq_ignore_ascii_case("connected");
        statuses.push(serde_json::json!({
            "slug": slug,
            "name": slug.to_ascii_uppercase(),
            "connected": connected,
            "status": if !has_key {
                "missing_api_key".to_string()
            } else if connection.status.is_empty() {
                "not_connected".to_string()
            } else {
                connection.status.clone()
            },
            "auth_config_id": connection.auth_config_id,
            "connected_account_id": connection.connected_account_id,
            "redirect_url": connection.redirect_url,
            "last_sync_at": connection.last_checked_at,
        }));
        config.composio.connections.insert(slug, connection);
    }

    if dirty {
        let _ = state.config.save(&config);
    }
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
pub async fn composio_authorize_toolkit(
    state: State<'_, Arc<AppState>>,
    toolkit: String,
) -> Result<serde_json::Value, String> {
    let user_id = get_user_id(&state);
    let api_key = composio_api_key(&state)?;
    let client = composio_client(&api_key);
    let auth_config_id = composio_find_or_create_auth_config(&client, &toolkit).await?;
    let response = composio_request_json(
        client
            .post(format!(
                "{COMPOSIO_BASE_URL}/api/v3/connected_accounts/link"
            ))
            .json(&serde_json::json!({
                "auth_config_id": auth_config_id,
                "user_id": user_id,
            })),
    )
    .await?;
    let connected_account_id = value_string(&response, &["connected_account_id", "id"])
        .ok_or_else(|| "Composio did not return a connected account id".to_string())?;
    let redirect_url = value_string(&response, &["redirect_url", "redirectUrl"])
        .ok_or_else(|| "Composio did not return a redirect URL".to_string())?;

    let mut config = state.config.load().map_err(|e| e.to_string())?;
    let enabled = if config.composio.enabled_toolkits.is_empty() {
        vec!["github".to_string(), "gmail".to_string()]
    } else {
        config.composio.enabled_toolkits.clone()
    };
    if !enabled.contains(&toolkit) {
        config.composio.enabled_toolkits.push(toolkit.clone());
    }
    config.composio.connections.insert(
        toolkit.clone(),
        ComposioConnectionConfig {
            auth_config_id: Some(auth_config_id.clone()),
            connected_account_id: Some(connected_account_id.clone()),
            status: "initiated".to_string(),
            redirect_url: Some(redirect_url.clone()),
            last_checked_at: Some(Utc::now().to_rfc3339()),
        },
    );
    state.config.save(&config).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "toolkit": toolkit,
        "auth_config_id": auth_config_id,
        "connected_account_id": connected_account_id,
        "redirect_url": redirect_url,
        "status": "initiated",
    }))
}

#[tauri::command]
pub async fn composio_refresh_toolkit(
    state: State<'_, Arc<AppState>>,
    toolkit: String,
) -> Result<serde_json::Value, String> {
    let user_id = get_user_id(&state);
    let api_key = composio_api_key(&state)?;
    let client = composio_client(&api_key);
    let mut config = state.config.load().map_err(|e| e.to_string())?;
    let mut connection = config
        .composio
        .connections
        .get(&toolkit)
        .cloned()
        .unwrap_or_default();

    if connection.auth_config_id.is_none() {
        connection.auth_config_id =
            Some(composio_find_or_create_auth_config(&client, &toolkit).await?);
    }

    if let Some(account_id) = connection.connected_account_id.clone() {
        let value = composio_connected_account(&client, &account_id).await?;
        connection.status = connection_status_from_value(&value);
    } else {
        let accounts = composio_list_connected_accounts(
            &client,
            &user_id,
            connection.auth_config_id.as_deref(),
        )
        .await?;
        if let Some(account) = accounts.first() {
            connection.connected_account_id = value_string(account, &["id", "nanoid"]);
            connection.status = connection_status_from_value(account);
        } else {
            connection.status = "not_connected".to_string();
        }
    }
    connection.last_checked_at = Some(Utc::now().to_rfc3339());
    config
        .composio
        .connections
        .insert(toolkit.clone(), connection.clone());
    state.config.save(&config).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "toolkit": toolkit,
        "auth_config_id": connection.auth_config_id,
        "connected_account_id": connection.connected_account_id,
        "status": connection.status,
        "redirect_url": connection.redirect_url,
        "last_checked_at": connection.last_checked_at,
    }))
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
