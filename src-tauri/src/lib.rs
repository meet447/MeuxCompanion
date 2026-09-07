mod acp;
mod bundled_assets;
mod commands;
mod tray;
mod whisper;
mod window;

use meuxe_core::character::CharacterLoader;
use meuxe_core::config::ConfigManager;
use meuxe_core::expressions::ExpressionManager;
use meuxe_core::memory::CompanionMemory;
use meuxe_core::session::SessionStore;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use crate::acp::AcpConnectionManager;
use tauri::Manager;

pub struct AppState {
    pub data_dir: PathBuf,
    pub resource_dir: Option<PathBuf>,
    pub config: ConfigManager,
    pub characters: CharacterLoader,
    pub sessions: SessionStore,
    pub memory: CompanionMemory,
    pub expressions: ExpressionManager,
    pub chat_cancel: std::sync::Mutex<Option<tokio_util::sync::CancellationToken>>,
    pub chat_permission_responders:
        std::sync::Mutex<HashMap<String, tokio::sync::oneshot::Sender<bool>>>,
    pub acp: Mutex<AcpConnectionManager>,
}

// Broadcast an event to ALL windows (used by global shortcuts)
#[tauri::command]
fn broadcast_event(app: tauri::AppHandle, event: String) -> Result<(), String> {
    use tauri::Emitter;
    app.emit(&event, ()).map_err(|e| e.to_string())
}

// Command to get the app data directory path
#[tauri::command]
fn get_data_dir(state: tauri::State<Arc<AppState>>) -> String {
    state.data_dir.to_string_lossy().to_string()
}

// Command to resolve a relative asset path to a convertFileSrc-compatible URL
#[derive(serde::Serialize)]
#[serde(rename_all = "snake_case")]
struct ResolvedAssetPath {
    path: String,
    root: String,
}

#[tauri::command]
fn resolve_asset_path(
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
    path: String,
) -> Result<ResolvedAssetPath, String> {
    let clean = path.trim_start_matches('/');
    if clean.is_empty() {
        return Err("Asset path is empty".into());
    }
    if Path::new(clean).is_absolute() {
        return Err(format!("Absolute asset paths are not allowed: {clean}"));
    }
    if Path::new(clean)
        .components()
        .any(|c| c == std::path::Component::ParentDir)
    {
        return Err(format!("Asset path must not contain '..': {clean}"));
    }

    if let Some(resolved) = resolve_under_root(&state.data_dir, clean) {
        return Ok(ResolvedAssetPath {
            path: resolved.to_string_lossy().to_string(),
            root: "app_data".to_string(),
        });
    }

    if let Some(resource_dir) = &state.resource_dir {
        if let Some(resolved) = resolve_under_root(resource_dir, clean) {
            return Ok(ResolvedAssetPath {
                path: resolved.to_string_lossy().to_string(),
                root: "resources".to_string(),
            });
        }
    } else if let Ok(resource_dir) = app.path().resource_dir() {
        if let Some(resolved) = resolve_under_root(&resource_dir, clean) {
            return Ok(ResolvedAssetPath {
                path: resolved.to_string_lossy().to_string(),
                root: "resources".to_string(),
            });
        }
    }

    if cfg!(debug_assertions) {
        let dev_candidates = [PathBuf::from(clean), PathBuf::from("..").join(clean)];
        for candidate in dev_candidates {
            if candidate.is_file() {
                let resolved = std::path::absolute(&candidate).unwrap_or(candidate);
                return Ok(ResolvedAssetPath {
                    path: resolved.to_string_lossy().to_string(),
                    root: "dev".to_string(),
                });
            }
        }
    }

    Err(format!("Asset not found: {clean}"))
}

fn resolve_under_root(root: &Path, relative: &str) -> Option<PathBuf> {
    let rel = Path::new(relative);
    if rel.is_absolute() {
        return None;
    }
    if rel
        .components()
        .any(|c| c == std::path::Component::ParentDir)
    {
        return None;
    }

    let candidate = root.join(rel);
    if !candidate.is_file() {
        return None;
    }

    let canonical_root = root.canonicalize().ok()?;
    let canonical_file = candidate.canonicalize().ok()?;
    // Canonical paths are only for the containment check; return the plain join so
    // Windows callers don't get a `\\?\` UNC prefix that breaks asset-scope matching.
    if canonical_file.starts_with(&canonical_root) {
        Some(candidate)
    } else {
        None
    }
}

fn allow_webview_autoplay(app: &mut tauri::App) {
    #[cfg(target_os = "linux")]
    {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.with_webview(|webview| {
                use webkit2gtk::{SettingsExt, WebViewExt};
                if let Some(settings) = webview.inner().settings() {
                    settings.set_media_playback_requires_user_gesture(false);
                }
            });
        }
    }
    let _ = app;
}

pub fn run() {
    std::env::set_var("PATH", commands::agent_setup::augmented_path_env());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");
            std::fs::create_dir_all(&data_dir).expect("Failed to create data directory");
            if let Err(err) = acp::ensure_companion_home(&data_dir) {
                eprintln!("[acp] failed to create companion-home: {err}");
            }

            whisper::load_whisper_model(&data_dir);

            let resource_dir = app.path().resource_dir().ok();
            if let Some(resource_dir) = resource_dir.as_ref() {
                if let Err(err) = bundled_assets::seed_bundled_models(resource_dir, &data_dir) {
                    eprintln!("[bundled_assets] failed to seed bundled models: {err}");
                }
            }

            let bundled_expression_root = resource_dir.as_ref().map(|dir| dir.join("models"));

            let state = AppState {
                data_dir: data_dir.clone(),
                resource_dir,
                config: ConfigManager::new(&data_dir),
                characters: CharacterLoader::new(&data_dir),
                sessions: SessionStore::new(&data_dir),
                memory: CompanionMemory::new(&data_dir),
                expressions: ExpressionManager::new_with_bundled_root(
                    &data_dir,
                    bundled_expression_root,
                ),
                chat_cancel: std::sync::Mutex::new(None),
                chat_permission_responders: std::sync::Mutex::new(HashMap::new()),
                acp: Mutex::new(AcpConnectionManager::default()),
            };

            app.manage(Arc::new(state));

            // Setup system tray
            if let Err(err) = tray::setup_tray(app.handle()) {
                eprintln!("[tray] disabled: {err}");
            }

            allow_webview_autoplay(app);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::config::config_get,
            commands::config::config_save,
            commands::config::config_set_active_character,
            commands::config::config_reset_all,
            commands::config::config_reset_onboarding,
            commands::characters::characters_list,
            commands::characters::characters_get,
            commands::characters::characters_create,
            commands::characters::models_list,
            commands::characters::models_import_live2d_dialog,
            commands::characters::models_import_vrm_dialog,
            commands::characters::models_install_from_url,
            commands::chat::chat_send,
            commands::chat::chat_cancel,
            commands::chat::chat_tool_confirm,
            commands::chat::chat_history,
            commands::chat::chat_clear,
            commands::agent_setup::agent_setup_status,
            commands::agent_setup::agent_setup_install,
            commands::memory::memory_snapshot,
            commands::memory::memory_add_fact,
            commands::memory::memory_update_fact,
            commands::memory::memory_forget_fact,
            commands::memory::memory_forget_moment,
            commands::memory::memory_reset,
            commands::expressions::expressions_supported,
            commands::expressions::expressions_model_list,
            commands::expressions::expressions_get,
            commands::expressions::expressions_save,
            commands::tts::tts_voices,
            commands::tts::tts_preview,
            commands::voice::voice_transcribe,
            commands::voice::voice_transcribe_local,
            commands::voice::voice_whisper_status,
            commands::voice::voice_whisper_download,
            window::window_toggle_mini,
            window::window_expand,
            get_data_dir,
            broadcast_event,
            resolve_asset_path,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(
                event,
                tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
            ) {
                if let Some(state) = app.try_state::<Arc<AppState>>() {
                    acp::invalidate_acp(state.inner());
                }
            }
        });
}
