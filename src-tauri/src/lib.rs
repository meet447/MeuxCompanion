mod commands;
mod tray;
mod window;

use dashmap::DashMap;
use meux_core::character::CharacterLoader;
use meux_core::config::ConfigManager;
use meux_core::expressions::ExpressionManager;
use meux_core::llm::OpenAiCompatClient;
use meux_core::memory::store::MemoryStore;
use meux_core::session::SessionStore;
use meux_core::state::StateStore;
use meux_core::tools::ToolRegistry;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use whisper_rs::{WhisperContext, WhisperContextParameters};

pub struct AppState {
    pub data_dir: PathBuf,
    pub config: ConfigManager,
    pub characters: CharacterLoader,
    pub sessions: SessionStore,
    pub states: StateStore,
    pub memories: MemoryStore,
    pub expressions: ExpressionManager,
    pub llm: OpenAiCompatClient,
    pub whisper_ctx: Option<Arc<WhisperContext>>,
    pub tool_registry: ToolRegistry,
    pub pending_confirmations: DashMap<String, tokio::sync::oneshot::Sender<bool>>,
    pub chat_cancel: std::sync::Mutex<Option<tokio_util::sync::CancellationToken>>,
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

fn load_whisper_model(data_dir: &PathBuf) -> Option<Arc<WhisperContext>> {
    // Search for model in multiple locations
    let candidates = [
        data_dir.join("models/whisper/ggml-tiny.bin"),
        PathBuf::from("models/whisper/ggml-tiny.bin"),
        PathBuf::from("../models/whisper/ggml-tiny.bin"),
    ];

    for path in &candidates {
        if path.exists() {
            let path_str = path.to_string_lossy().to_string();
            match WhisperContext::new_with_params(
                &path_str,
                WhisperContextParameters::default(),
            ) {
                Ok(ctx) => {
                    println!("Whisper model loaded from: {path_str}");
                    return Some(Arc::new(ctx));
                }
                Err(e) => {
                    eprintln!("Failed to load whisper model from {path_str}: {e}");
                }
            }
        }
    }

    eprintln!("Whisper model not found. Local transcription disabled.");
    None
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");
            std::fs::create_dir_all(&data_dir).expect("Failed to create data directory");

            let whisper_ctx = load_whisper_model(&data_dir);

            let state = AppState {
                data_dir: data_dir.clone(),
                config: ConfigManager::new(&data_dir),
                characters: CharacterLoader::new(&data_dir),
                sessions: SessionStore::new(&data_dir),
                states: StateStore::new(&data_dir),
                memories: MemoryStore::new(data_dir.clone()),
                expressions: ExpressionManager::new(&data_dir),
                llm: OpenAiCompatClient::new(),
                whisper_ctx,
                tool_registry: ToolRegistry::with_defaults(),
                pending_confirmations: DashMap::new(),
                chat_cancel: std::sync::Mutex::new(None),
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
            commands::characters::models_import_live2d_dialog,
            commands::characters::models_import_vrm_dialog,
            commands::chat::chat_send,
            commands::chat::chat_history,
            commands::chat::chat_clear,
            commands::chat::tool_confirm,
            commands::memory::memory_get,
            commands::memory::memory_search,
            commands::memory::memory_clear,
            commands::state::state_get,
            commands::state::state_reset,
            commands::expressions::expressions_supported,
            commands::expressions::expressions_model_list,
            commands::expressions::expressions_get,
            commands::expressions::expressions_save,
            commands::tts::tts_voices,
            commands::tts::tts_preview,
            commands::voice::voice_transcribe,
            commands::voice::voice_transcribe_local,
            window::window_toggle_mini,
            window::window_expand,
            get_data_dir,
            resolve_asset_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
