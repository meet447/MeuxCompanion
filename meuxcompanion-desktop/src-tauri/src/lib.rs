mod commands;
mod tray;
mod window;

use meux_core::character::CharacterLoader;
use meux_core::config::ConfigManager;
use meux_core::expressions::ExpressionManager;
use meux_core::llm::OpenAiCompatClient;
use meux_core::memory::store::MemoryStore;
use meux_core::session::SessionStore;
use meux_core::state::StateStore;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;

pub struct AppState {
    pub data_dir: PathBuf,
    pub config: ConfigManager,
    pub characters: CharacterLoader,
    pub sessions: SessionStore,
    pub states: StateStore,
    pub memories: MemoryStore,
    pub expressions: ExpressionManager,
    pub llm: OpenAiCompatClient,
}

// Command to get the app data directory path
#[tauri::command]
fn get_data_dir(state: tauri::State<Arc<AppState>>) -> String {
    state.data_dir.to_string_lossy().to_string()
}

// Command to resolve a relative asset path to a convertFileSrc-compatible URL
#[tauri::command]
fn resolve_asset_path(state: tauri::State<Arc<AppState>>, path: String) -> Result<String, String> {
    let clean = path.trim_start_matches('/');
    let full_path = state.data_dir.join(clean);
    if full_path.exists() {
        Ok(full_path.to_string_lossy().to_string())
    } else {
        Err(format!("Asset not found: {}", full_path.display()))
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");
            std::fs::create_dir_all(&data_dir).expect("Failed to create data directory");

            let state = AppState {
                data_dir: data_dir.clone(),
                config: ConfigManager::new(&data_dir),
                characters: CharacterLoader::new(&data_dir),
                sessions: SessionStore::new(&data_dir),
                states: StateStore::new(&data_dir),
                memories: MemoryStore::new(data_dir.clone()),
                expressions: ExpressionManager::new(&data_dir),
                llm: OpenAiCompatClient::new(),
            };

            app.manage(Arc::new(state));

            // Setup system tray
            tray::setup_tray(app.handle()).expect("Failed to setup tray");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::config::config_get,
            commands::config::config_save,
            commands::config::config_test_llm,
            commands::characters::characters_list,
            commands::characters::characters_get,
            commands::characters::characters_create,
            commands::characters::models_list,
            commands::chat::chat_send,
            commands::chat::chat_history,
            commands::chat::chat_clear,
            commands::memory::memory_get,
            commands::memory::memory_search,
            commands::memory::memory_clear,
            commands::state::state_get,
            commands::state::state_reset,
            commands::expressions::expressions_get,
            commands::expressions::expressions_save,
            commands::tts::tts_voices,
            commands::tts::tts_preview,
            window::window_toggle_mini,
            window::window_expand,
            get_data_dir,
            resolve_asset_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
