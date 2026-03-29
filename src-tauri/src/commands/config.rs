use crate::AppState;
use meux_core::config::types::AppConfig;
use meux_core::llm::types::{ChatMessage, LlmStreamConfig};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn config_get(state: State<Arc<AppState>>) -> Result<AppConfig, String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    Ok(meux_core::config::ConfigManager::mask_config(&config))
}

#[tauri::command]
pub fn config_save(state: State<Arc<AppState>>, config: AppConfig) -> Result<(), String> {
    state.config.save(&config).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn config_test_llm(
    state: State<'_, Arc<AppState>>,
    provider: serde_json::Value,
) -> Result<String, String> {
    let base_url = provider
        .get("base_url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let api_key = provider
        .get("api_key")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let model = provider
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("gpt-4o")
        .to_string();

    let config = LlmStreamConfig {
        base_url,
        api_key,
        model,
        temperature: 0.7,
        max_tokens: 50,
    };
    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: "Say hello in one word.".to_string(),
    }];
    state
        .llm
        .chat(messages, &config)
        .await
        .map_err(|e| e.to_string())
}
