use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde::Serialize;
use tokio::process::Command as AsyncCommand;
use tokio::time::timeout;

const NPM_INSTALL_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentInstallSource {
    System,
    Npx,
    None,
}

#[derive(Debug, Clone, Serialize)]
pub struct AcpPrerequisitesStatus {
    pub node_available: bool,
    pub npx_available: bool,
    pub node_version: Option<String>,
    pub npx_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentPresetSetupStatus {
    pub preset: String,
    /// A launch method is available; does not verify installation or sign-in.
    pub ready: bool,
    /// A CLI was found on the user/system PATH (or standard global locations).
    pub system_path: bool,
    pub needs_node: bool,
    pub detail: String,
    pub install_source: AgentInstallSource,
    pub system_command: Option<String>,
    /// Regular Claude/Codex CLI, distinct from the ACP adapter Meuxe launches.
    pub cli_command: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentSetupStatusResponse {
    pub prerequisites: AcpPrerequisitesStatus,
    pub agent: AgentPresetSetupStatus,
}

/// Program name on PATH for each preset (system / global install).
pub fn preset_system_binary_name(preset: &str) -> Option<&'static str> {
    match preset {
        "opencode" => Some("opencode"),
        "claude" => Some("claude-agent-acp"),
        "codex" => Some("codex-acp"),
        _ => None,
    }
}

fn candidate_filenames(program: &str) -> Vec<String> {
    let names = vec![program.to_string()];
    #[cfg(windows)]
    {
        for ext in [".exe", ".cmd", ".bat"] {
            names.push(format!("{program}{ext}"));
        }
    }
    names
}

fn is_executable_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = path.metadata() {
            return meta.permissions().mode() & 0o111 != 0;
        }
        false
    }
    #[cfg(not(unix))]
    {
        true
    }
}

fn nvm_node_bin_dirs(home: &Path) -> Vec<PathBuf> {
    let versions_root = home.join(".nvm").join("versions").join("node");
    let mut version_dirs = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&versions_root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                version_dirs.push(path);
            }
        }
    }
    version_dirs.sort_by(|a, b| {
        let a_name = a.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let b_name = b.file_name().and_then(|n| n.to_str()).unwrap_or("");
        b_name.cmp(a_name)
    });
    version_dirs
        .into_iter()
        .map(|dir| dir.join("bin"))
        .collect()
}

/// Extra directories where global npm / user CLIs commonly live (before scanning PATH).
pub fn global_cli_search_dirs_for(home: Option<&Path>, npm_prefix: Option<&Path>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(prefix) = npm_prefix {
        dirs.push(prefix.join("bin"));
    }

    dirs.push(PathBuf::from("/opt/homebrew/bin"));
    dirs.push(PathBuf::from("/usr/local/bin"));

    if let Some(home) = home {
        dirs.extend(nvm_node_bin_dirs(home));
        dirs.push(home.join(".local").join("bin"));
        dirs.push(home.join(".npm-global").join("bin"));
        dirs.push(home.join("bin"));
        dirs.push(
            home.join(".local")
                .join("share")
                .join("fnm")
                .join("aliases")
                .join("default")
                .join("bin"),
        );
        dirs.push(
            home.join(".fnm")
                .join("aliases")
                .join("default")
                .join("bin"),
        );
        dirs.push(home.join(".volta").join("bin"));
        dirs.push(home.join(".local").join("share").join("pnpm"));
        dirs.push(home.join(".bun").join("bin"));
    }

    #[cfg(windows)]
    if let Ok(appdata) = std::env::var("APPDATA") {
        dirs.push(PathBuf::from(appdata).join("npm"));
    }

    dirs
}

/// Extra directories where global npm / user CLIs commonly live (before scanning PATH).
fn global_cli_search_dirs() -> Vec<PathBuf> {
    let npm_prefix = std::env::var("NPM_CONFIG_PREFIX").ok().map(PathBuf::from);
    let home = std::env::var("HOME").ok().map(PathBuf::from);
    global_cli_search_dirs_for(home.as_deref(), npm_prefix.as_deref())
}

/// PATH with Meuxe's extra CLI search directories prepended.
pub fn augmented_path_env() -> OsString {
    let mut paths: Vec<PathBuf> = global_cli_search_dirs();
    if let Some(path_var) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&path_var));
    }
    std::env::join_paths(paths).unwrap_or_else(|_| std::env::var_os("PATH").unwrap_or_default())
}

/// Find an executable in the given search directories.
pub fn find_executable_in_dirs(program: &str, search_dirs: &[PathBuf]) -> Option<PathBuf> {
    for dir in search_dirs {
        for name in candidate_filenames(program) {
            let candidate = dir.join(&name);
            if is_executable_file(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

/// Find an executable on PATH and common global install locations.
pub fn find_executable_on_path(program: &str) -> Option<PathBuf> {
    let mut search_dirs: Vec<PathBuf> = global_cli_search_dirs();
    if let Some(path_var) = std::env::var_os("PATH") {
        search_dirs.extend(std::env::split_paths(&path_var));
    }
    find_executable_in_dirs(program, &search_dirs)
}

pub fn resolve_system_bin(preset: &str) -> Option<PathBuf> {
    let name = preset_system_binary_name(preset)?;
    find_executable_on_path(name)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentResolution {
    pub source: AgentInstallSource,
    pub executable: Option<PathBuf>,
}

/// Global system install first, then npx (Claude/Codex only).
pub async fn resolve_agent(_data_dir: &Path, preset: &str) -> AgentResolution {
    if let Some(system) = resolve_system_bin(preset) {
        return AgentResolution {
            source: AgentInstallSource::System,
            executable: Some(system),
        };
    }

    let prerequisites = check_prerequisites().await;

    match preset {
        "claude" | "codex" if prerequisites.npx_available => AgentResolution {
            source: AgentInstallSource::Npx,
            executable: None,
        },
        _ => AgentResolution {
            source: AgentInstallSource::None,
            executable: None,
        },
    }
}

fn trim_version(stdout: &[u8]) -> Option<String> {
    let s = String::from_utf8_lossy(stdout);
    let trimmed = s.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.lines().next()?.trim().to_string())
    }
}

async fn command_version(program: &str) -> Option<String> {
    let executable = find_executable_on_path(program)?;
    let output = timeout(
        Duration::from_secs(5),
        AsyncCommand::new(&executable)
            .arg("--version")
            .env("PATH", augmented_path_env())
            .kill_on_drop(true)
            .output(),
    )
    .await
    .ok()?
    .ok()?;
    if !output.status.success() {
        return None;
    }
    trim_version(&output.stdout)
}

pub async fn check_prerequisites() -> AcpPrerequisitesStatus {
    let node_version = command_version("node").await;
    let npx_version = command_version("npx").await;
    AcpPrerequisitesStatus {
        node_available: node_version.is_some(),
        npx_available: npx_version.is_some(),
        node_version,
        npx_version,
    }
}

fn status_from_resolution(preset: &str, resolution: AgentResolution) -> AgentPresetSetupStatus {
    let system_path = resolution.source == AgentInstallSource::System;
    let ready = resolution.source != AgentInstallSource::None;
    let system_command = resolution
        .executable
        .as_ref()
        .map(|p| p.to_string_lossy().into_owned());

    let (needs_node, detail) = match preset {
        "opencode" => {
            let needs_node = resolution.source == AgentInstallSource::None;
            let detail = match resolution.source {
                AgentInstallSource::System => format!(
                    "Using OpenCode on your system: {}",
                    system_command.clone().unwrap_or_else(|| "opencode".into())
                ),
                AgentInstallSource::None => {
                    "OpenCode isn't on this computer yet. Click Install, or install it yourself and check again.".into()
                }
                AgentInstallSource::Npx => unreachable!(),
            };
            (needs_node, detail)
        }
        "claude" => {
            let needs_node = resolution.source == AgentInstallSource::None;
            let detail = match resolution.source {
                AgentInstallSource::System => format!(
                    "Using Claude ACP adapter on your system: {}",
                    system_command.clone().unwrap_or_default()
                ),
                AgentInstallSource::Npx => {
                    "Meuxe can download and run the ACP connection adapter through Node.js. The first start may take a few minutes. Installing the adapter locally is optional and does not reinstall your CLI.".into()
                }
                AgentInstallSource::None => {
                    "Claude isn't set up yet. Install Node.js, then click Install, or install the adapter yourself and check again.".into()
                }
            };
            (needs_node, detail)
        }
        "codex" => {
            let needs_node = resolution.source == AgentInstallSource::None;
            let detail = match resolution.source {
                AgentInstallSource::System => format!(
                    "Using Codex ACP adapter on your system: {}",
                    system_command.clone().unwrap_or_default()
                ),
                AgentInstallSource::Npx => {
                    "Meuxe can download and run the ACP connection adapter through Node.js. The first start may take a few minutes. Installing the adapter locally is optional and does not reinstall your CLI.".into()
                }
                AgentInstallSource::None => {
                    "Codex isn't set up yet. Install Node.js, then click Install, or install the adapter yourself and check again.".into()
                }
            };
            (needs_node, detail)
        }
        _ => (false, String::new()),
    };

    AgentPresetSetupStatus {
        preset: preset.to_string(),
        ready,
        system_path,
        needs_node,
        detail,
        install_source: resolution.source,
        system_command,
        cli_command: match preset {
            "claude" | "codex" => {
                find_executable_on_path(preset).map(|path| path.to_string_lossy().into_owned())
            }
            _ => None,
        },
    }
}

fn custom_preset_ready(program: &str) -> (bool, Option<String>) {
    let program = program.trim();
    if program.is_empty() {
        return (false, None);
    }

    let path = Path::new(program);
    if path.is_absolute() && is_executable_file(path) {
        return (true, Some(program.to_string()));
    }

    if let Some(found) = find_executable_on_path(program) {
        return (true, Some(found.to_string_lossy().into_owned()));
    }

    (false, None)
}

pub async fn check_preset(
    data_dir: &Path,
    preset: &str,
    program: Option<&str>,
) -> AgentPresetSetupStatus {
    match preset {
        "opencode" | "claude" | "codex" => {
            let resolution = resolve_agent(data_dir, preset).await;
            status_from_resolution(preset, resolution)
        }
        "custom" => {
            let program = program.unwrap_or("").trim();
            let (ready, system_command) = custom_preset_ready(program);
            let detail = if ready {
                format!(
                    "Using your custom agent: {}",
                    system_command
                        .clone()
                        .unwrap_or_else(|| program.to_string())
                )
            } else if program.is_empty() {
                "Enter the command for your custom agent.".into()
            } else {
                format!(
                    "Could not find an executable for \"{program}\". Use an absolute path or make sure it is on your PATH."
                )
            };
            AgentPresetSetupStatus {
                preset: preset.to_string(),
                ready,
                system_path: ready,
                needs_node: false,
                detail,
                install_source: AgentInstallSource::None,
                system_command,
                cli_command: None,
            }
        }
        other => AgentPresetSetupStatus {
            preset: other.to_string(),
            ready: false,
            system_path: false,
            needs_node: false,
            detail: format!("Unknown preset: {other}"),
            install_source: AgentInstallSource::None,
            system_command: None,
            cli_command: None,
        },
    }
}

/// User-writable npm global prefix (avoids system `/usr/lib/node_modules` when npm prefix is `/`).
pub fn meuxe_npm_global_prefix() -> Result<PathBuf, String> {
    #[cfg(windows)]
    {
        let appdata = std::env::var("APPDATA")
            .map_err(|_| "APPDATA is not set; cannot determine npm global prefix".to_string())?;
        Ok(PathBuf::from(appdata).join("npm"))
    }
    #[cfg(not(windows))]
    {
        let home = std::env::var("HOME")
            .map_err(|_| "HOME is not set; cannot determine npm global prefix".to_string())?;
        Ok(PathBuf::from(home).join(".npm-global"))
    }
}

fn ensure_dir(path: &Path) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|e| format!("Failed to create {}: {e}", path.display()))
}

async fn run_npm_global_install(package: &str) -> Result<(), String> {
    let prefix = meuxe_npm_global_prefix()?;
    ensure_dir(&prefix)?;
    #[cfg(not(windows))]
    ensure_dir(&prefix.join("bin"))?;

    let npm = find_executable_on_path("npm").ok_or_else(|| {
        "Node.js is required. Install it from https://nodejs.org (LTS), then try again.".to_string()
    })?;

    let prefix_str = prefix.to_string_lossy().into_owned();
    let child = AsyncCommand::new(&npm)
        .args([
            "install",
            "-g",
            "--prefix",
            &prefix_str,
            "--no-audit",
            "--no-fund",
            package,
        ])
        .env("NPM_CONFIG_PREFIX", &prefix_str)
        .env("PATH", augmented_path_env())
        .kill_on_drop(true)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run npm: {e}"))?;

    let wait = child.wait_with_output();
    let output = timeout(NPM_INSTALL_TIMEOUT, wait)
        .await
        .map_err(|_| "npm install timed out (5 minutes)".to_string())?
        .map_err(|e| format!("npm install failed: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let message = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else {
            stdout.trim().to_string()
        };
        let mut err = format!("npm install -g failed: {message}");
        if message.contains("EACCES") {
            err.push_str(
                " Hint: Meuxe installs into ~/.npm-global (or %APPDATA%\\npm on Windows); ensure that directory is writable.",
            );
        }
        Err(err)
    }
}

pub(crate) fn preset_npm_package(preset: &str) -> Result<&'static str, String> {
    match preset {
        "opencode" => Ok("opencode-ai"),
        "claude" => Ok("@agentclientprotocol/claude-agent-acp"),
        "codex" => Ok("@agentclientprotocol/codex-acp"),
        "custom" => Err("Nothing to install for a custom agent.".into()),
        other => Err(format!("Unknown preset: {other}")),
    }
}

/// Install the preset's npm package into the Meuxe user npm prefix (`~/.npm-global` / `%APPDATA%\\npm`).
pub async fn install_global_package(preset: &str) -> Result<(), String> {
    let prerequisites = check_prerequisites().await;
    if !prerequisites.node_available {
        return Err(
            "Node.js is required. Install it from https://nodejs.org (LTS), then try again.".into(),
        );
    }
    let package = preset_npm_package(preset)?;
    run_npm_global_install(package).await
}

pub async fn install_preset(
    data_dir: &Path,
    preset: &str,
) -> Result<AgentSetupStatusResponse, String> {
    install_global_package(preset).await?;

    let prerequisites = check_prerequisites().await;
    let agent = check_preset(data_dir, preset, None).await;
    if !agent.ready {
        return Err(format!(
            "Global install finished but the agent is still not ready: {}",
            agent.detail
        ));
    }

    Ok(AgentSetupStatusResponse {
        prerequisites,
        agent,
    })
}

pub async fn full_status(
    data_dir: &Path,
    preset: &str,
    program: Option<&str>,
) -> AgentSetupStatusResponse {
    let prerequisites = check_prerequisites().await;
    let agent = check_preset(data_dir, preset, program).await;
    AgentSetupStatusResponse {
        prerequisites,
        agent,
    }
}

#[tauri::command]
pub async fn agent_setup_status(
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
    preset: String,
    program: Option<String>,
) -> Result<AgentSetupStatusResponse, String> {
    Ok(full_status(&state.data_dir, &preset, program.as_deref()).await)
}

#[tauri::command]
pub async fn agent_setup_install(
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
    preset: String,
) -> Result<AgentSetupStatusResponse, String> {
    install_preset(&state.data_dir, &preset).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn npx_availability_does_not_claim_the_adapter_is_installed() {
        for preset in ["claude", "codex"] {
            let status = status_from_resolution(
                preset,
                AgentResolution {
                    source: AgentInstallSource::Npx,
                    executable: None,
                },
            );
            assert!(status.ready); // launchable, not an authentication check
            assert!(!status.system_path);
            assert!(status.system_command.is_none());
            assert!(status.detail.contains("first start may take a few minutes"));
            assert!(status.detail.contains("does not reinstall your CLI"));
        }
    }

    #[test]
    fn find_executable_in_dirs_discovers_file() {
        let tmp = TempDir::new().unwrap();
        let bin = tmp.path().join("meuxe-test-cli");
        fs::write(&bin, b"#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&bin, fs::Permissions::from_mode(0o755)).unwrap();
        }

        let found = find_executable_in_dirs("meuxe-test-cli", &[tmp.path().to_path_buf()]);
        assert_eq!(found, Some(bin));
    }

    #[test]
    fn resolve_system_bin_finds_executable_in_search_dirs() {
        let tmp = TempDir::new().unwrap();
        let bin = tmp.path().join("opencode");
        fs::write(&bin, b"#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&bin, fs::Permissions::from_mode(0o755)).unwrap();
        }

        let found = find_executable_in_dirs("opencode", &[tmp.path().to_path_buf()]);
        assert!(found.is_some());
    }

    #[test]
    fn global_cli_search_dirs_for_includes_home_bins() {
        let home = PathBuf::from("/fake/home");
        let npm_prefix = PathBuf::from("/fake/npm-prefix");
        let dirs = global_cli_search_dirs_for(Some(&home), Some(&npm_prefix));

        assert!(dirs.contains(&npm_prefix.join("bin")));
        assert!(dirs.contains(&home.join(".local/bin")));
        assert!(dirs.contains(&home.join(".npm-global/bin")));
        assert!(dirs.contains(&home.join("bin")));
        assert!(dirs.contains(&home.join(".volta/bin")));
        assert!(dirs.contains(&home.join(".bun/bin")));
        assert!(dirs.contains(&PathBuf::from("/opt/homebrew/bin")));
        assert!(dirs.contains(&PathBuf::from("/usr/local/bin")));
    }

    #[test]
    fn custom_preset_ready_false_when_program_missing() {
        let (ready, command) = custom_preset_ready("");
        assert!(!ready);
        assert!(command.is_none());
    }

    #[test]
    fn custom_preset_ready_true_for_absolute_executable() {
        let tmp = TempDir::new().unwrap();
        let bin = tmp.path().join("my-agent");
        fs::write(&bin, b"#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&bin, fs::Permissions::from_mode(0o755)).unwrap();
        }

        let (ready, command) = custom_preset_ready(&bin.to_string_lossy());
        assert!(ready);
        assert_eq!(command, Some(bin.to_string_lossy().into_owned()));
    }

    #[test]
    fn custom_preset_ready_false_for_unknown_program() {
        let (ready, command) = custom_preset_ready("definitely-not-installed-meuxe-agent-xyz");
        assert!(!ready);
        assert!(command.is_none());
    }

    #[test]
    fn custom_preset_ready_true_when_on_path() {
        let tmp = TempDir::new().unwrap();
        let bin = tmp.path().join("meuxe-custom-ready");
        fs::write(&bin, b"#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&bin, fs::Permissions::from_mode(0o755)).unwrap();
        }

        let old_path = std::env::var_os("PATH");
        // SAFETY: test runs single-threaded; restore PATH afterward.
        unsafe {
            std::env::set_var("PATH", tmp.path());
        }

        let (ready, command) = custom_preset_ready("meuxe-custom-ready");
        assert!(ready);
        assert_eq!(command, Some(bin.to_string_lossy().into_owned()));

        match old_path {
            Some(path) => unsafe {
                std::env::set_var("PATH", path);
            },
            None => unsafe {
                std::env::remove_var("PATH");
            },
        }
    }

    #[test]
    fn meuxe_npm_global_prefix_uses_home_on_unix() {
        #[cfg(not(windows))]
        {
            let home = std::env::var("HOME").expect("HOME must be set for this test");
            let prefix = meuxe_npm_global_prefix().unwrap();
            assert_eq!(prefix, PathBuf::from(home).join(".npm-global"));
        }
    }

    #[test]
    fn meuxe_npm_global_prefix_uses_appdata_on_windows() {
        #[cfg(windows)]
        {
            let appdata = std::env::var("APPDATA").expect("APPDATA must be set for this test");
            let prefix = meuxe_npm_global_prefix().unwrap();
            assert_eq!(prefix, PathBuf::from(appdata).join("npm"));
        }
    }
}

/// Query the selected (including unsaved) agent configuration without a chat prompt.
#[tauri::command]
pub async fn agent_models_list(
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
    config: meuxe_core::config::AgentConfig,
) -> Result<crate::acp::AgentModels, String> {
    crate::acp::discover_models(&config, &state.data_dir).await
}
