# MeuxCompanion Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite MeuxCompanion as a native Tauri v2 desktop app with a pure Rust backend, shipping as a single binary across macOS, Windows, and Linux.

**Architecture:** Cargo workspace with `meux-core` library crate (all business logic, no Tauri dependency) + `src-tauri` app crate (thin Tauri command shell + window management). Existing React frontend adapted to use Tauri IPC instead of HTTP/SSE.

**Tech Stack:** Rust, Tauri v2, React 19, TypeScript, Vite, reqwest, tokio, serde, PixiJS (Live2D), Three.js (VRM)

**Spec:** `docs/specs/2026-03-29-meuxcompanion-desktop-design.md`

---

## File Structure

```
meuxcompanion-desktop/
├── Cargo.toml                          # Workspace root
├── package.json                        # Frontend deps + Tauri scripts
├── vite.config.ts                      # Vite config (Tauri dev URL)
├── tsconfig.json
├── crates/
│   └── meux-core/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── error.rs
│           ├── config/
│           │   ├── mod.rs
│           │   └── types.rs
│           ├── character/
│           │   ├── mod.rs
│           │   ├── types.rs
│           │   └── expressions.rs
│           ├── session/
│           │   ├── mod.rs
│           │   └── types.rs
│           ├── state/
│           │   ├── mod.rs
│           │   └── types.rs
│           ├── memory/
│           │   ├── mod.rs
│           │   ├── store.rs
│           │   ├── extractor.rs
│           │   └── retriever.rs
│           ├── llm/
│           │   ├── mod.rs
│           │   ├── types.rs
│           │   └── openai_compat.rs
│           ├── tts/
│           │   ├── mod.rs
│           │   ├── tiktok.rs
│           │   ├── elevenlabs.rs
│           │   └── openai.rs
│           ├── expressions/
│           │   └── mod.rs
│           └── prompt/
│               └── mod.rs
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── commands/
│       │   ├── mod.rs
│       │   ├── config.rs
│       │   ├── characters.rs
│       │   ├── chat.rs
│       │   ├── memory.rs
│       │   ├── state.rs
│       │   ├── expressions.rs
│       │   └── tts.rs
│       ├── window.rs
│       └── tray.rs
├── src/                                # React frontend (new, adapted)
│   ├── main.tsx
│   ├── App.tsx
│   ├── api/
│   │   └── tauri.ts
│   ├── hooks/
│   │   ├── useChat.ts
│   │   ├── useAudioQueue.ts
│   │   ├── useLive2D.ts
│   │   ├── useVRM.ts
│   │   ├── useVoice.ts
│   │   ├── useAudioAnalyser.ts
│   │   ├── useWindow.ts
│   │   └── useTray.ts
│   └── components/
│       ├── ChatPanel.tsx
│       ├── Live2DCanvas.tsx
│       ├── VRMCanvas.tsx
│       ├── Onboarding.tsx
│       ├── Settings.tsx
│       ├── MemoryStatePanel.tsx
│       ├── CharacterSelect.tsx
│       └── MiniWidget.tsx
└── .github/
    └── workflows/
        └── release.yml
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `meuxcompanion-desktop/Cargo.toml`
- Create: `meuxcompanion-desktop/crates/meux-core/Cargo.toml`
- Create: `meuxcompanion-desktop/crates/meux-core/src/lib.rs`
- Create: `meuxcompanion-desktop/crates/meux-core/src/error.rs`
- Create: `meuxcompanion-desktop/package.json`
- Create: `meuxcompanion-desktop/vite.config.ts`
- Create: `meuxcompanion-desktop/tsconfig.json`
- Create: `meuxcompanion-desktop/src-tauri/Cargo.toml`
- Create: `meuxcompanion-desktop/src-tauri/tauri.conf.json`
- Create: `meuxcompanion-desktop/src-tauri/capabilities/default.json`
- Create: `meuxcompanion-desktop/src-tauri/src/main.rs`
- Create: `meuxcompanion-desktop/src-tauri/src/lib.rs`
- Create: `meuxcompanion-desktop/src/main.tsx`
- Create: `meuxcompanion-desktop/index.html`

- [ ] **Step 1: Create workspace root Cargo.toml**

```toml
# meuxcompanion-desktop/Cargo.toml
[workspace]
members = ["crates/meux-core", "src-tauri"]
resolver = "2"
```

- [ ] **Step 2: Create meux-core Cargo.toml**

```toml
# meuxcompanion-desktop/crates/meux-core/Cargo.toml
[package]
name = "meux-core"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
serde_yaml = "0.9"
reqwest = { version = "0.12", features = ["stream", "json"] }
tokio = { version = "1", features = ["full"] }
tokio-stream = "0.1"
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
regex = "1"
pulldown-cmark = "0.12"
thiserror = "2"
base64 = "0.22"
futures = "0.3"
```

- [ ] **Step 3: Create meux-core error types and lib.rs**

```rust
// meuxcompanion-desktop/crates/meux-core/src/error.rs
use thiserror::Error;

#[derive(Error, Debug)]
pub enum MeuxError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("YAML error: {0}")]
    Yaml(#[from] serde_yaml::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Character not found: {0}")]
    CharacterNotFound(String),

    #[error("Invalid config: {0}")]
    InvalidConfig(String),

    #[error("LLM error: {0}")]
    Llm(String),

    #[error("TTS error: {0}")]
    Tts(String),

    #[error("Memory error: {0}")]
    Memory(String),
}

pub type Result<T> = std::result::Result<T, MeuxError>;

impl serde::Serialize for MeuxError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
```

```rust
// meuxcompanion-desktop/crates/meux-core/src/lib.rs
pub mod error;
pub mod config;
pub mod character;
pub mod session;
pub mod state;
pub mod memory;
pub mod llm;
pub mod tts;
pub mod expressions;
pub mod prompt;

pub use error::{MeuxError, Result};
```

- [ ] **Step 4: Create src-tauri Cargo.toml**

```toml
# meuxcompanion-desktop/src-tauri/Cargo.toml
[package]
name = "meuxcompanion-desktop"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
tauri-plugin-global-shortcut = "2"
tauri-plugin-autostart = "2"
tauri-plugin-window-state = "2"
meux-core = { path = "../crates/meux-core" }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
```

- [ ] **Step 5: Create Tauri app entry points**

```rust
// meuxcompanion-desktop/src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    meuxcompanion_desktop::run();
}
```

```rust
// meuxcompanion-desktop/src-tauri/src/lib.rs
mod commands;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 6: Create tauri.conf.json**

```json
{
  "$schema": "https://raw.githubusercontent.com/nicepkg/aide/refs/heads/master/packages/aide-tauri/schemas/tauri-v2.json",
  "productName": "MeuxCompanion",
  "version": "0.1.0",
  "identifier": "com.meuxcompanion.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "MeuxCompanion",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- [ ] **Step 7: Create capabilities/default.json**

```json
{
  "$schema": "https://raw.githubusercontent.com/nicepkg/aide/refs/heads/master/packages/aide-tauri/schemas/tauri-v2-capability.json",
  "identifier": "default",
  "description": "Default capabilities for MeuxCompanion",
  "windows": ["main", "mini"],
  "permissions": [
    "core:default",
    "shell:allow-open",
    "global-shortcut:default",
    "autostart:default",
    "window-state:default"
  ]
}
```

- [ ] **Step 8: Create package.json and frontend scaffolding**

```json
{
  "name": "meuxcompanion-desktop",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "tauri": "tauri"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-global-shortcut": "^2.0.0",
    "@tauri-apps/plugin-autostart": "^2.0.0",
    "@tauri-apps/plugin-window-state": "^2.0.0",
    "pixi.js": "^6.5.10",
    "pixi-live2d-display": "^0.4.0",
    "three": "^0.183.2",
    "@pixiv/three-vrm": "^3.5.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@types/three": "^0.183.0",
    "@vitejs/plugin-react": "^4.0.0",
    "tailwindcss": "^4.2.0",
    "@tailwindcss/vite": "^4.2.0",
    "typescript": "^5.8.0",
    "vite": "^6.0.0"
  }
}
```

```typescript
// meuxcompanion-desktop/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
```

```html
<!-- meuxcompanion-desktop/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MeuxCompanion</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
// meuxcompanion-desktop/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

```tsx
// meuxcompanion-desktop/src/App.tsx
function App() {
  return <div>MeuxCompanion Desktop</div>;
}

export default App;
```

- [ ] **Step 9: Create src-tauri build.rs**

```rust
// meuxcompanion-desktop/src-tauri/build.rs
fn main() {
    tauri_build::build();
}
```

- [ ] **Step 10: Verify the project compiles**

Run: `cd meuxcompanion-desktop && npm install && npm run tauri build -- --debug 2>&1 | tail -20`
Expected: Build succeeds (or at least Rust compiles — icons may be missing, that's fine)

- [ ] **Step 11: Create placeholder Tauri icons**

Run: `cd meuxcompanion-desktop && npx @tauri-apps/cli icon --input src-tauri/icons/icon.png` (or create placeholder PNGs)

If no source icon exists, create a minimal placeholder:
Run: `mkdir -p meuxcompanion-desktop/src-tauri/icons && cd meuxcompanion-desktop && npx @tauri-apps/cli icon` (uses Tauri default icon)

- [ ] **Step 12: Commit**

```bash
cd meuxcompanion-desktop
git init
git add -A
git commit -m "feat: scaffold Tauri v2 workspace with meux-core and React frontend"
```

---

## Task 2: Config Module (meux-core)

**Files:**
- Create: `crates/meux-core/src/config/mod.rs`
- Create: `crates/meux-core/src/config/types.rs`
- Test: `crates/meux-core/src/config/mod.rs` (inline tests)

- [ ] **Step 1: Write config types**

```rust
// crates/meux-core/src/config/types.rs
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    #[serde(default)]
    pub user: UserConfig,
    #[serde(default)]
    pub llm: LlmConfig,
    #[serde(default)]
    pub tts: TtsConfig,
    #[serde(default)]
    pub llm_providers: HashMap<String, LlmProviderConfig>,
    #[serde(default)]
    pub tts_providers: HashMap<String, TtsProviderConfig>,
    #[serde(default)]
    pub active_character: String,
    #[serde(default)]
    pub onboarding_complete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UserConfig {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub about: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LlmConfig {
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TtsConfig {
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub voice: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LlmProviderConfig {
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TtsProviderConfig {
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub voice: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmPreset {
    pub base_url: &'static str,
    pub needs_key: bool,
    pub default_model: &'static str,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TtsPreset {
    pub name: &'static str,
    pub needs_key: bool,
}
```

- [ ] **Step 2: Write config manager with tests**

```rust
// crates/meux-core/src/config/mod.rs
pub mod types;

use crate::error::Result;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use types::*;

pub const LLM_PRESETS: &[(&str, LlmPreset)] = &[
    ("openai", LlmPreset { base_url: "https://api.openai.com/v1", needs_key: true, default_model: "gpt-4o" }),
    ("groq", LlmPreset { base_url: "https://api.groq.com/openai/v1", needs_key: true, default_model: "llama-3.3-70b-versatile" }),
    ("openrouter", LlmPreset { base_url: "https://openrouter.ai/api/v1", needs_key: true, default_model: "openai/gpt-4o" }),
    ("ollama", LlmPreset { base_url: "http://localhost:11434/v1", needs_key: false, default_model: "llama3.2" }),
    ("nectara", LlmPreset { base_url: "https://api-nectara.chipling.xyz/v1", needs_key: true, default_model: "openai/gpt-oss-20b" }),
    ("custom", LlmPreset { base_url: "", needs_key: true, default_model: "" }),
];

pub const TTS_PRESETS: &[(&str, TtsPreset)] = &[
    ("tiktok", TtsPreset { name: "TikTok TTS", needs_key: false }),
    ("elevenlabs", TtsPreset { name: "ElevenLabs", needs_key: true }),
    ("openai_tts", TtsPreset { name: "OpenAI TTS", needs_key: true }),
];

pub struct ConfigManager {
    config_path: PathBuf,
}

impl ConfigManager {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            config_path: data_dir.join("config.json"),
        }
    }

    pub fn load(&self) -> Result<AppConfig> {
        if !self.config_path.exists() {
            return Ok(AppConfig::default());
        }
        let content = std::fs::read_to_string(&self.config_path)?;
        let config: AppConfig = serde_json::from_str(&content)?;
        Ok(config)
    }

    pub fn save(&self, config: &AppConfig) -> Result<()> {
        if let Some(parent) = self.config_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(config)?;
        std::fs::write(&self.config_path, content)?;
        Ok(())
    }

    pub fn mask_config(config: &AppConfig) -> AppConfig {
        let mut masked = config.clone();
        masked.llm.api_key = config.llm.api_key.as_ref().map(|k| mask_key(k));
        masked.tts.api_key = config.tts.api_key.as_ref().map(|k| mask_key(k));
        for (_, provider) in masked.llm_providers.iter_mut() {
            provider.api_key = provider.api_key.as_ref().map(|k| mask_key(k));
        }
        for (_, provider) in masked.tts_providers.iter_mut() {
            provider.api_key = provider.api_key.as_ref().map(|k| mask_key(k));
        }
        masked
    }

    pub fn get_configured_providers(config: &AppConfig) -> HashMap<String, HashMap<String, serde_json::Value>> {
        let mut result = HashMap::new();

        let mut llm_map = HashMap::new();
        for (id, _) in LLM_PRESETS {
            let configured = config.llm_providers.contains_key(*id);
            let model = config.llm_providers.get(*id)
                .map(|p| p.model.clone())
                .unwrap_or_default();
            llm_map.insert(id.to_string(), serde_json::json!({
                "configured": configured,
                "model": model,
            }));
        }
        result.insert("llm".to_string(), llm_map);

        let mut tts_map = HashMap::new();
        for (id, _) in TTS_PRESETS {
            let configured = config.tts_providers.contains_key(*id);
            tts_map.insert(id.to_string(), serde_json::json!({
                "configured": configured,
            }));
        }
        result.insert("tts".to_string(), tts_map);

        result
    }
}

fn mask_key(key: &str) -> String {
    if key.len() > 8 {
        format!("{}...{}", &key[..4], &key[key.len()-4..])
    } else {
        "***".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_load_missing_config_returns_default() {
        let tmp = TempDir::new().unwrap();
        let mgr = ConfigManager::new(tmp.path());
        let config = mgr.load().unwrap();
        assert_eq!(config.onboarding_complete, false);
        assert_eq!(config.tts.provider, "");
    }

    #[test]
    fn test_save_and_load_roundtrip() {
        let tmp = TempDir::new().unwrap();
        let mgr = ConfigManager::new(tmp.path());
        let mut config = AppConfig::default();
        config.user.name = "Meet".to_string();
        config.onboarding_complete = true;
        mgr.save(&config).unwrap();

        let loaded = mgr.load().unwrap();
        assert_eq!(loaded.user.name, "Meet");
        assert_eq!(loaded.onboarding_complete, true);
    }

    #[test]
    fn test_mask_key() {
        assert_eq!(mask_key("sk-1234567890abcdef"), "sk-1...cdef");
        assert_eq!(mask_key("short"), "***");
    }

    #[test]
    fn test_mask_config() {
        let mut config = AppConfig::default();
        config.llm.api_key = Some("sk-1234567890abcdef".to_string());
        let masked = ConfigManager::mask_config(&config);
        assert_eq!(masked.llm.api_key.unwrap(), "sk-1...cdef");
    }
}
```

- [ ] **Step 3: Add tempfile dev-dependency to Cargo.toml**

Add to `crates/meux-core/Cargo.toml`:
```toml
[dev-dependencies]
tempfile = "3"
tokio = { version = "1", features = ["full", "test-util"] }
```

- [ ] **Step 4: Run tests**

Run: `cd meuxcompanion-desktop && cargo test -p meux-core -- config`
Expected: All 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add crates/meux-core/src/config/ crates/meux-core/Cargo.toml
git commit -m "feat: add config module with load/save/mask and provider presets"
```

---

## Task 3: Character Types & Loader (meux-core)

**Files:**
- Create: `crates/meux-core/src/character/types.rs`
- Create: `crates/meux-core/src/character/mod.rs`
- Create: `crates/meux-core/src/character/expressions.rs`

- [ ] **Step 1: Write character types**

```rust
// crates/meux-core/src/character/types.rs
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Character {
    pub id: String,
    pub name: String,
    pub live2d_model: String,
    pub voice: String,
    pub default_emotion: String,
    pub system_prompt: String,
    pub prompt_sections: PromptSections,
    pub source_type: SourceType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptSections {
    #[serde(default)]
    pub soul: String,
    #[serde(default)]
    pub style: String,
    #[serde(default)]
    pub rules: String,
    #[serde(default)]
    pub context: String,
    #[serde(default)]
    pub lorebook: String,
    #[serde(default)]
    pub examples: String,
    #[serde(default)]
    pub legacy: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceType {
    Directory,
    Markdown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterSummary {
    pub id: String,
    pub name: String,
    pub live2d_model: String,
    pub voice: String,
    pub default_emotion: String,
    pub source_type: SourceType,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CharacterYaml {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub live2d_model: Option<String>,
    #[serde(default, alias = "model")]
    pub vrm_model: Option<String>,
    #[serde(default)]
    pub voice: Option<String>,
    #[serde(default)]
    pub default_emotion: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    #[serde(rename = "type")]
    pub model_type: String,
    pub model_file: String,
    pub path: String,
}

pub const DEFAULT_EXPRESSIONS: &[&str] = &[
    "neutral", "happy", "sad", "angry", "surprised",
    "embarrassed", "thinking", "excited",
];

pub const VRM_EXPRESSIONS: &[&str] = &[
    "happy", "angry", "sad", "relaxed", "surprised",
];

pub const DEFAULT_PARAMS: &[(&str, &str)] = &[
    ("mouthOpen", "ParamMouthOpenY"),
    ("mouthForm", "ParamMouthForm"),
    ("eyeLeftOpen", "ParamEyeLOpen"),
    ("eyeRightOpen", "ParamEyeROpen"),
    ("breath", "ParamBreath"),
    ("bodyAngleX", "ParamBodyAngleX"),
];
```

- [ ] **Step 2: Write character loader**

```rust
// crates/meux-core/src/character/mod.rs
pub mod types;
pub mod expressions;

use crate::error::{MeuxError, Result};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use types::*;

pub struct CharacterLoader {
    characters_dir: PathBuf,
    cache: RwLock<HashMap<String, (Vec<(String, u128)>, Character)>>,
}

impl CharacterLoader {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            characters_dir: data_dir.join("characters"),
            cache: RwLock::new(HashMap::new()),
        }
    }

    pub fn list_characters(&self) -> Result<Vec<CharacterSummary>> {
        let mut characters = Vec::new();
        if !self.characters_dir.exists() {
            return Ok(characters);
        }

        for source in self.iter_character_sources()? {
            match self.load_character_summary(&source.0, &source.1, &source.2) {
                Ok(summary) => characters.push(summary),
                Err(e) => eprintln!("Warning: skipping character {}: {}", source.0, e),
            }
        }
        Ok(characters)
    }

    pub fn load_character(&self, character_id: &str) -> Result<Character> {
        let sources = self.iter_character_sources()?;
        let source = sources.iter()
            .find(|(id, _, _)| id == character_id)
            .ok_or_else(|| MeuxError::CharacterNotFound(character_id.to_string()))?;

        let signature = self.get_signature(&source.1, &source.2)?;

        // Check cache
        {
            let cache = self.cache.read().unwrap();
            if let Some((cached_sig, cached_char)) = cache.get(character_id) {
                if *cached_sig == signature {
                    return Ok(cached_char.clone());
                }
            }
        }

        // Load fresh
        let character = match source.2 {
            SourceType::Directory => self.load_from_directory(character_id, &source.1)?,
            SourceType::Markdown => self.load_from_markdown(character_id, &source.1)?,
        };

        // Update cache
        {
            let mut cache = self.cache.write().unwrap();
            cache.insert(character_id.to_string(), (signature, character.clone()));
        }

        Ok(character)
    }

    fn iter_character_sources(&self) -> Result<Vec<(String, PathBuf, SourceType)>> {
        let mut sources = Vec::new();
        if !self.characters_dir.exists() {
            return Ok(sources);
        }

        let entries = std::fs::read_dir(&self.characters_dir)?;
        for entry in entries {
            let entry = entry?;
            let path = entry.path();

            if path.is_dir() {
                if path.join("character.yaml").exists() {
                    let id = path.file_name().unwrap().to_string_lossy().to_string();
                    sources.push((id, path, SourceType::Directory));
                }
            } else if path.extension().map_or(false, |e| e == "md") {
                let id = path.file_stem().unwrap().to_string_lossy().to_string();
                sources.push((id, path, SourceType::Markdown));
            }
        }

        sources.sort_by(|a, b| a.0.cmp(&b.0));
        Ok(sources)
    }

    fn load_from_directory(&self, id: &str, dir: &Path) -> Result<Character> {
        let yaml_path = dir.join("character.yaml");
        let yaml_content = std::fs::read_to_string(&yaml_path)?;
        let yaml: CharacterYaml = serde_yaml::from_str(&yaml_content)?;

        let sections = PromptSections {
            soul: read_optional_file(&dir.join("soul.md")),
            style: read_optional_file(&dir.join("style.md")),
            rules: read_optional_file(&dir.join("rules.md")),
            context: read_optional_file(&dir.join("context.md")),
            lorebook: read_optional_file(&dir.join("lorebook.md")),
            examples: read_optional_file(&dir.join("examples").join("chat_examples.md")),
            legacy: String::new(),
        };

        let name = yaml.name.unwrap_or_else(|| id.to_string());
        let system_prompt = build_prompt_sections_body(&name, &sections);

        Ok(Character {
            id: id.to_string(),
            name,
            live2d_model: yaml.live2d_model.or(yaml.vrm_model).unwrap_or_default(),
            voice: yaml.voice.unwrap_or_else(|| "jp_001".to_string()),
            default_emotion: yaml.default_emotion.unwrap_or_else(|| "neutral".to_string()),
            system_prompt,
            prompt_sections: sections,
            source_type: SourceType::Directory,
        })
    }

    fn load_from_markdown(&self, id: &str, path: &Path) -> Result<Character> {
        let content = std::fs::read_to_string(path)?;
        let (frontmatter, body) = parse_md_frontmatter(&content);

        let name = frontmatter.get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(id)
            .to_string();

        let sections = PromptSections {
            legacy: body.clone(),
            soul: String::new(),
            style: String::new(),
            rules: String::new(),
            context: String::new(),
            lorebook: String::new(),
            examples: String::new(),
        };

        let system_prompt = build_prompt_sections_body(&name, &sections);

        Ok(Character {
            id: id.to_string(),
            name,
            live2d_model: frontmatter.get("live2d_model")
                .or_else(|| frontmatter.get("model"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            voice: frontmatter.get("voice")
                .and_then(|v| v.as_str())
                .unwrap_or("jp_001")
                .to_string(),
            default_emotion: frontmatter.get("default_emotion")
                .and_then(|v| v.as_str())
                .unwrap_or("neutral")
                .to_string(),
            system_prompt,
            prompt_sections: sections,
            source_type: SourceType::Markdown,
        })
    }

    fn load_character_summary(&self, id: &str, path: &Path, source_type: &SourceType) -> Result<CharacterSummary> {
        match source_type {
            SourceType::Directory => {
                let yaml_path = path.join("character.yaml");
                let yaml_content = std::fs::read_to_string(&yaml_path)?;
                let yaml: CharacterYaml = serde_yaml::from_str(&yaml_content)?;
                Ok(CharacterSummary {
                    id: id.to_string(),
                    name: yaml.name.unwrap_or_else(|| id.to_string()),
                    live2d_model: yaml.live2d_model.or(yaml.vrm_model).unwrap_or_default(),
                    voice: yaml.voice.unwrap_or_else(|| "jp_001".to_string()),
                    default_emotion: yaml.default_emotion.unwrap_or_else(|| "neutral".to_string()),
                    source_type: SourceType::Directory,
                })
            }
            SourceType::Markdown => {
                let content = std::fs::read_to_string(path)?;
                let (fm, _) = parse_md_frontmatter(&content);
                Ok(CharacterSummary {
                    id: id.to_string(),
                    name: fm.get("name").and_then(|v| v.as_str()).unwrap_or(id).to_string(),
                    live2d_model: fm.get("live2d_model").or_else(|| fm.get("model"))
                        .and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    voice: fm.get("voice").and_then(|v| v.as_str()).unwrap_or("jp_001").to_string(),
                    default_emotion: fm.get("default_emotion").and_then(|v| v.as_str()).unwrap_or("neutral").to_string(),
                    source_type: SourceType::Markdown,
                })
            }
        }
    }

    fn get_signature(&self, path: &Path, source_type: &SourceType) -> Result<Vec<(String, u128)>> {
        let mut sig = Vec::new();
        match source_type {
            SourceType::Directory => {
                let files = ["character.yaml", "soul.md", "style.md", "rules.md", "context.md", "lorebook.md"];
                for f in &files {
                    let fp = path.join(f);
                    if fp.exists() {
                        let meta = std::fs::metadata(&fp)?;
                        let mtime = meta.modified()?.duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default().as_nanos();
                        sig.push((f.to_string(), mtime));
                    }
                }
            }
            SourceType::Markdown => {
                let meta = std::fs::metadata(path)?;
                let mtime = meta.modified()?.duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default().as_nanos();
                sig.push((path.to_string_lossy().to_string(), mtime));
            }
        }
        Ok(sig)
    }

    pub fn create_character(
        &self,
        name: &str,
        personality: &str,
        model_id: &str,
        voice: &str,
        user_name: &str,
        user_about: &str,
    ) -> Result<String> {
        let id = slugify(name);
        let char_dir = self.characters_dir.join(&id);
        std::fs::create_dir_all(&char_dir)?;
        std::fs::create_dir_all(char_dir.join("examples"))?;

        let yaml = format!(
            "name: \"{}\"\nlive2d_model: \"{}\"\nvoice: \"{}\"\ndefault_emotion: neutral\n",
            name, model_id, voice
        );
        std::fs::write(char_dir.join("character.yaml"), yaml)?;
        std::fs::write(char_dir.join("soul.md"), format!("You are {}, a companion. {}", name, personality))?;
        std::fs::write(char_dir.join("style.md"), "Speak naturally and warmly.")?;
        std::fs::write(char_dir.join("rules.md"), "Stay in character. Never break the fourth wall.")?;
        std::fs::write(
            char_dir.join("context.md"),
            format!("Your user's name is {}. About them: {}", user_name, user_about),
        )?;
        std::fs::write(char_dir.join("examples").join("chat_examples.md"), "")?;

        Ok(id)
    }
}

fn read_optional_file(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap_or_default()
}

fn build_prompt_sections_body(name: &str, sections: &PromptSections) -> String {
    let mut body = format!("You are {}. Stay in character at all times.\n\n", name);

    let parts = [
        ("Soul", &sections.soul),
        ("Speaking Style", &sections.style),
        ("Rules", &sections.rules),
        ("Context", &sections.context),
        ("Lorebook", &sections.lorebook),
        ("Examples", &sections.examples),
        ("Character", &sections.legacy),
    ];

    for (label, content) in parts {
        if !content.is_empty() {
            body.push_str(&format!("## {}\n{}\n\n", label, content));
        }
    }
    body
}

fn parse_md_frontmatter(content: &str) -> (HashMap<String, serde_yaml::Value>, String) {
    let re = regex::Regex::new(r"(?s)^---\s*\n(.*?)\n---\s*\n(.*)").unwrap();
    if let Some(caps) = re.captures(content) {
        let yaml_str = caps.get(1).unwrap().as_str();
        let body = caps.get(2).unwrap().as_str().to_string();
        let fm: HashMap<String, serde_yaml::Value> = serde_yaml::from_str(yaml_str).unwrap_or_default();
        (fm, body)
    } else {
        (HashMap::new(), content.to_string())
    }
}

pub fn slugify(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

pub fn build_system_prompt(character: &Character, expressions: Option<&[String]>) -> String {
    let mut prompt = character.system_prompt.clone();

    if let Some(exprs) = expressions {
        if !exprs.is_empty() {
            prompt.push_str("\n\nEXPRESSION RULES:\n");
            prompt.push_str("- Tag each response segment with an expression: <<expression_name>>\n");
            prompt.push_str("- Start EVERY response with an expression tag.\n");
            prompt.push_str("- Change expression mid-response when the emotional tone shifts.\n");
            prompt.push_str(&format!("- Available expressions: {}\n", exprs.join(", ")));
            prompt.push_str("- Example: <<happy>> That's wonderful to hear! <<thinking>> Let me consider that...\n");
        }
    }

    prompt
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_list_empty_characters() {
        let tmp = TempDir::new().unwrap();
        let loader = CharacterLoader::new(tmp.path());
        let chars = loader.list_characters().unwrap();
        assert!(chars.is_empty());
    }

    #[test]
    fn test_create_and_load_character() {
        let tmp = TempDir::new().unwrap();
        let loader = CharacterLoader::new(tmp.path());

        let id = loader.create_character("Test Char", "A test personality", "model1", "jp_001", "User", "A developer").unwrap();
        assert_eq!(id, "test_char");

        let character = loader.load_character(&id).unwrap();
        assert_eq!(character.name, "Test Char");
        assert_eq!(character.voice, "jp_001");
        assert!(character.system_prompt.contains("Test Char"));
    }

    #[test]
    fn test_load_from_markdown() {
        let tmp = TempDir::new().unwrap();
        let chars_dir = tmp.path().join("characters");
        std::fs::create_dir_all(&chars_dir).unwrap();
        std::fs::write(
            chars_dir.join("test.md"),
            "---\nname: TestMD\nvoice: en_us_001\n---\nYou are a test character.",
        ).unwrap();

        let loader = CharacterLoader::new(tmp.path());
        let character = loader.load_character("test").unwrap();
        assert_eq!(character.name, "TestMD");
        assert_eq!(character.voice, "en_us_001");
    }

    #[test]
    fn test_build_system_prompt_with_expressions() {
        let character = Character {
            id: "test".to_string(),
            name: "Test".to_string(),
            live2d_model: String::new(),
            voice: "jp_001".to_string(),
            default_emotion: "neutral".to_string(),
            system_prompt: "You are Test.".to_string(),
            prompt_sections: PromptSections::default(),
            source_type: SourceType::Directory,
        };
        let exprs = vec!["happy".to_string(), "sad".to_string()];
        let prompt = build_system_prompt(&character, Some(&exprs));
        assert!(prompt.contains("EXPRESSION RULES"));
        assert!(prompt.contains("happy, sad"));
    }

    #[test]
    fn test_slugify() {
        assert_eq!(slugify("Hello World"), "hello_world");
        assert_eq!(slugify("Test-Name 123"), "test_name_123");
    }

    #[test]
    fn test_parse_md_frontmatter() {
        let content = "---\nname: Test\nvoice: jp_001\n---\nBody content here.";
        let (fm, body) = parse_md_frontmatter(content);
        assert_eq!(fm.get("name").unwrap().as_str().unwrap(), "Test");
        assert_eq!(body, "Body content here.");
    }
}

impl Default for PromptSections {
    fn default() -> Self {
        Self {
            soul: String::new(),
            style: String::new(),
            rules: String::new(),
            context: String::new(),
            lorebook: String::new(),
            examples: String::new(),
            legacy: String::new(),
        }
    }
}
```

- [ ] **Step 3: Run tests**

Run: `cd meuxcompanion-desktop && cargo test -p meux-core -- character`
Expected: All 6 tests pass

- [ ] **Step 4: Commit**

```bash
git add crates/meux-core/src/character/
git commit -m "feat: add character loader with directory and markdown format support"
```

---

## Task 4: Session Store (meux-core)

**Files:**
- Create: `crates/meux-core/src/session/types.rs`
- Create: `crates/meux-core/src/session/mod.rs`

- [ ] **Step 1: Write session types**

```rust
// crates/meux-core/src/session/types.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMessage {
    pub ts: String,
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}
```

- [ ] **Step 2: Write session store**

```rust
// crates/meux-core/src/session/mod.rs
pub mod types;

use crate::error::Result;
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use types::SessionMessage;

pub struct SessionStore {
    data_dir: PathBuf,
    lock: RwLock<()>,
}

impl SessionStore {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            data_dir: data_dir.join("data"),
            lock: RwLock::new(()),
        }
    }

    fn session_path(&self, character_id: &str, user_id: &str) -> PathBuf {
        self.data_dir.join("users").join(user_id).join("sessions").join(format!("{}.jsonl", character_id))
    }

    pub fn load_history(&self, character_id: &str, user_id: &str, limit: Option<usize>) -> Result<Vec<SessionMessage>> {
        let path = self.session_path(character_id, user_id);
        if !path.exists() {
            return Ok(Vec::new());
        }

        let _guard = self.lock.read().unwrap();
        let file = std::fs::File::open(&path)?;
        let reader = std::io::BufReader::new(file);

        let mut messages: Vec<SessionMessage> = Vec::new();
        for line in reader.lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(msg) = serde_json::from_str::<SessionMessage>(&line) {
                messages.push(msg);
            }
        }

        if let Some(limit) = limit {
            if limit > 0 && messages.len() > limit {
                messages = messages.split_off(messages.len() - limit);
            }
        }

        Ok(messages)
    }

    pub fn append_message(
        &self,
        character_id: &str,
        user_id: &str,
        role: &str,
        content: &str,
        metadata: Option<serde_json::Value>,
    ) -> Result<()> {
        let path = self.session_path(character_id, user_id);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let msg = SessionMessage {
            ts: chrono::Utc::now().to_rfc3339(),
            role: role.to_string(),
            content: content.to_string(),
            metadata,
        };

        let _guard = self.lock.write().unwrap();
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?;
        let line = serde_json::to_string(&msg)?;
        writeln!(file, "{}", line)?;

        Ok(())
    }

    pub fn clear_history(&self, character_id: &str, user_id: &str) -> Result<()> {
        let path = self.session_path(character_id, user_id);
        if path.exists() {
            let _guard = self.lock.write().unwrap();
            std::fs::remove_file(&path)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_empty_session() {
        let tmp = TempDir::new().unwrap();
        let store = SessionStore::new(tmp.path());
        let history = store.load_history("char1", "user1", None).unwrap();
        assert!(history.is_empty());
    }

    #[test]
    fn test_append_and_load() {
        let tmp = TempDir::new().unwrap();
        let store = SessionStore::new(tmp.path());

        store.append_message("char1", "user1", "user", "Hello!", None).unwrap();
        store.append_message("char1", "user1", "assistant", "Hi there!", None).unwrap();

        let history = store.load_history("char1", "user1", None).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].role, "user");
        assert_eq!(history[1].content, "Hi there!");
    }

    #[test]
    fn test_load_with_limit() {
        let tmp = TempDir::new().unwrap();
        let store = SessionStore::new(tmp.path());

        for i in 0..10 {
            store.append_message("char1", "user1", "user", &format!("msg {}", i), None).unwrap();
        }

        let history = store.load_history("char1", "user1", Some(3)).unwrap();
        assert_eq!(history.len(), 3);
        assert_eq!(history[0].content, "msg 7");
    }

    #[test]
    fn test_clear_history() {
        let tmp = TempDir::new().unwrap();
        let store = SessionStore::new(tmp.path());

        store.append_message("char1", "user1", "user", "Hello!", None).unwrap();
        store.clear_history("char1", "user1").unwrap();

        let history = store.load_history("char1", "user1", None).unwrap();
        assert!(history.is_empty());
    }
}
```

- [ ] **Step 3: Run tests**

Run: `cd meuxcompanion-desktop && cargo test -p meux-core -- session`
Expected: All 4 tests pass

- [ ] **Step 4: Commit**

```bash
git add crates/meux-core/src/session/
git commit -m "feat: add session store with JSONL persistence"
```

---

## Task 5: State Store (meux-core)

**Files:**
- Create: `crates/meux-core/src/state/types.rs`
- Create: `crates/meux-core/src/state/mod.rs`

- [ ] **Step 1: Write state types**

```rust
// crates/meux-core/src/state/types.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationshipState {
    #[serde(default)]
    pub trust: f64,
    #[serde(default)]
    pub affection: f64,
    #[serde(default = "default_mood")]
    pub mood: String,
    #[serde(default = "default_energy")]
    pub energy: f64,
    #[serde(default)]
    pub relationship_summary: String,
    #[serde(default)]
    pub updated_at: String,
}

fn default_mood() -> String { "neutral".to_string() }
fn default_energy() -> f64 { 0.7 }

impl Default for RelationshipState {
    fn default() -> Self {
        Self {
            trust: 0.0,
            affection: 0.0,
            mood: "neutral".to_string(),
            energy: 0.7,
            relationship_summary: String::new(),
            updated_at: String::new(),
        }
    }
}
```

- [ ] **Step 2: Write state store with update logic**

```rust
// crates/meux-core/src/state/mod.rs
pub mod types;

use crate::error::Result;
use regex::Regex;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use types::RelationshipState;

const POSITIVE_TOKENS: &[&str] = &["thanks", "thank", "love", "great", "awesome", "helpful", "sweet", "nice"];
const NEGATIVE_TOKENS: &[&str] = &["hate", "annoying", "bad", "upset", "angry", "frustrated", "sad"];
const ATTACHMENT_TOKENS: &[&str] = &["remember", "miss", "stay", "together", "companion", "care"];

pub struct StateStore {
    data_dir: PathBuf,
}

impl StateStore {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            data_dir: data_dir.join("data"),
        }
    }

    fn state_path(&self, character_id: &str, user_id: &str) -> PathBuf {
        self.data_dir.join("users").join(user_id).join("memories").join(character_id).join("state.json")
    }

    pub fn load(&self, character_id: &str, user_id: &str) -> Result<RelationshipState> {
        let path = self.state_path(character_id, user_id);
        if !path.exists() {
            return Ok(RelationshipState::default());
        }
        let content = std::fs::read_to_string(&path)?;
        let state: RelationshipState = serde_json::from_str(&content)?;
        Ok(state)
    }

    pub fn save(&self, character_id: &str, user_id: &str, state: &RelationshipState) -> Result<()> {
        let path = self.state_path(character_id, user_id);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut state = state.clone();
        state.trust = clamp(state.trust);
        state.affection = clamp(state.affection);
        state.energy = clamp(state.energy);
        state.updated_at = chrono::Utc::now().to_rfc3339();
        let content = serde_json::to_string_pretty(&state)?;
        std::fs::write(&path, content)?;
        Ok(())
    }

    pub fn update_from_exchange(
        &self,
        character_id: &str,
        user_id: &str,
        user_message: &str,
        assistant_message: &str,
    ) -> Result<RelationshipState> {
        let mut state = self.load(character_id, user_id)?;
        let token_re = Regex::new(r"[a-zA-Z0-9']+").unwrap();

        let user_tokens: HashSet<String> = token_re.find_iter(&user_message.to_lowercase())
            .map(|m| m.as_str().to_string())
            .collect();
        let assistant_tokens: HashSet<String> = token_re.find_iter(&assistant_message.to_lowercase())
            .map(|m| m.as_str().to_string())
            .collect();

        let positive: HashSet<&str> = POSITIVE_TOKENS.iter().copied().collect();
        let negative: HashSet<&str> = NEGATIVE_TOKENS.iter().copied().collect();
        let attachment: HashSet<&str> = ATTACHMENT_TOKENS.iter().copied().collect();

        let has_positive = user_tokens.iter().any(|t| positive.contains(t.as_str()));
        let has_negative = user_tokens.iter().any(|t| negative.contains(t.as_str()));
        let has_attachment = user_tokens.iter().any(|t| attachment.contains(t.as_str()));

        if has_positive {
            state.trust += 0.04;
            state.affection += 0.05;
            state.mood = "warm".to_string();
        }
        if has_negative {
            state.trust -= 0.01;
            state.energy = (state.energy - 0.03).max(0.35);
            state.mood = "concerned".to_string();
        }
        if has_attachment {
            state.affection += 0.03;
            state.trust += 0.02;
        }

        if assistant_tokens.contains("proud") || assistant_tokens.contains("glad") {
            state.affection += 0.01;
        }

        // Update relationship summary
        if state.trust >= 0.7 && state.affection >= 0.7 {
            state.relationship_summary = "close, trusting, emotionally open".to_string();
        } else if state.trust >= 0.4 || state.affection >= 0.4 {
            state.relationship_summary = "growing warmer and more familiar".to_string();
        } else {
            state.relationship_summary = "still early and getting to know each other".to_string();
        }

        self.save(character_id, user_id, &state)?;
        Ok(state)
    }

    pub fn reset(&self, character_id: &str, user_id: &str) -> Result<RelationshipState> {
        let state = RelationshipState::default();
        self.save(character_id, user_id, &state)?;
        Ok(state)
    }
}

pub fn format_state_prompt(state: &RelationshipState) -> String {
    format!(
        "Current relational state:\n\
         - Mood: {}\n\
         - Trust: {:.2}\n\
         - Affection: {:.2}\n\
         - Energy: {:.2}\n\
         - Relationship: {}\n\n\
         Let this influence tone naturally, but do not mention numeric values directly.",
        state.mood, state.trust, state.affection, state.energy, state.relationship_summary
    )
}

fn clamp(value: f64) -> f64 {
    value.clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_default_state() {
        let tmp = TempDir::new().unwrap();
        let store = StateStore::new(tmp.path());
        let state = store.load("char1", "user1").unwrap();
        assert_eq!(state.trust, 0.0);
        assert_eq!(state.mood, "neutral");
        assert_eq!(state.energy, 0.7);
    }

    #[test]
    fn test_save_and_load() {
        let tmp = TempDir::new().unwrap();
        let store = StateStore::new(tmp.path());
        let mut state = RelationshipState::default();
        state.trust = 0.5;
        state.mood = "warm".to_string();
        store.save("char1", "user1", &state).unwrap();

        let loaded = store.load("char1", "user1").unwrap();
        assert_eq!(loaded.trust, 0.5);
        assert_eq!(loaded.mood, "warm");
    }

    #[test]
    fn test_update_positive_exchange() {
        let tmp = TempDir::new().unwrap();
        let store = StateStore::new(tmp.path());
        let state = store.update_from_exchange("char1", "user1", "Thanks for the help!", "Glad I could assist!").unwrap();
        assert!(state.trust > 0.0);
        assert!(state.affection > 0.0);
        assert_eq!(state.mood, "warm");
    }

    #[test]
    fn test_update_negative_exchange() {
        let tmp = TempDir::new().unwrap();
        let store = StateStore::new(tmp.path());
        let mut initial = RelationshipState::default();
        initial.trust = 0.5;
        store.save("char1", "user1", &initial).unwrap();

        let state = store.update_from_exchange("char1", "user1", "This is annoying and bad", "I understand your frustration.").unwrap();
        assert!(state.trust < 0.5);
        assert_eq!(state.mood, "concerned");
    }

    #[test]
    fn test_clamp_values() {
        let tmp = TempDir::new().unwrap();
        let store = StateStore::new(tmp.path());
        let mut state = RelationshipState::default();
        state.trust = 1.5;
        state.affection = -0.5;
        store.save("char1", "user1", &state).unwrap();

        let loaded = store.load("char1", "user1").unwrap();
        assert_eq!(loaded.trust, 1.0);
        assert_eq!(loaded.affection, 0.0);
    }

    #[test]
    fn test_format_state_prompt() {
        let state = RelationshipState {
            trust: 0.5,
            affection: 0.3,
            mood: "warm".to_string(),
            energy: 0.8,
            relationship_summary: "growing warmer".to_string(),
            updated_at: String::new(),
        };
        let prompt = format_state_prompt(&state);
        assert!(prompt.contains("Mood: warm"));
        assert!(prompt.contains("Trust: 0.50"));
    }
}
```

- [ ] **Step 3: Run tests**

Run: `cd meuxcompanion-desktop && cargo test -p meux-core -- state`
Expected: All 6 tests pass

- [ ] **Step 4: Commit**

```bash
git add crates/meux-core/src/state/
git commit -m "feat: add state store with relationship tracking and heuristic updates"
```

---

## Task 6: Memory Store & Engine (meux-core)

**Files:**
- Create: `crates/meux-core/src/memory/mod.rs`
- Create: `crates/meux-core/src/memory/store.rs`
- Create: `crates/meux-core/src/memory/extractor.rs`
- Create: `crates/meux-core/src/memory/retriever.rs`

- [ ] **Step 1: Write memory store (JSONL persistence)**

```rust
// crates/meux-core/src/memory/store.rs
use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};
use std::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Memory {
    pub id: String,
    pub ts: String,
    #[serde(rename = "type")]
    pub memory_type: String,
    pub summary: String,
    pub importance: f64,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub metadata: serde_json::Value,
}

const MEMORY_FILES: &[(&str, &str)] = &[
    ("episodic", "episodic.jsonl"),
    ("semantic", "semantic.jsonl"),
    ("reflections", "reflections.jsonl"),
];

pub struct MemoryStore {
    data_dir: PathBuf,
    lock: RwLock<()>,
}

impl MemoryStore {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            data_dir: data_dir.join("data"),
            lock: RwLock::new(()),
        }
    }

    fn memory_dir(&self, character_id: &str, user_id: &str) -> PathBuf {
        self.data_dir.join("users").join(user_id).join("memories").join(character_id)
    }

    pub fn ensure_store(&self, character_id: &str, user_id: &str) -> Result<PathBuf> {
        let dir = self.memory_dir(character_id, user_id);
        std::fs::create_dir_all(&dir)?;
        for (_, filename) in MEMORY_FILES {
            let path = dir.join(filename);
            if !path.exists() {
                std::fs::File::create(&path)?;
            }
        }
        Ok(dir)
    }

    pub fn append(&self, character_id: &str, user_id: &str, memory_type: &str, summary: &str, importance: f64, tags: Vec<String>) -> Result<Memory> {
        let filename = MEMORY_FILES.iter()
            .find(|(t, _)| *t == memory_type)
            .map(|(_, f)| *f)
            .ok_or_else(|| crate::error::MeuxError::Memory(format!("Invalid memory type: {}", memory_type)))?;

        let dir = self.memory_dir(character_id, user_id);
        std::fs::create_dir_all(&dir)?;
        let path = dir.join(filename);

        let memory = Memory {
            id: format!("mem_{}", &uuid::Uuid::new_v4().to_string()[..12]),
            ts: chrono::Utc::now().to_rfc3339(),
            memory_type: memory_type.to_string(),
            summary: summary.to_string(),
            importance,
            tags,
            metadata: serde_json::Value::Object(serde_json::Map::new()),
        };

        let _guard = self.lock.write().unwrap();
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?;
        let line = serde_json::to_string(&memory)?;
        writeln!(file, "{}", line)?;

        Ok(memory)
    }

    pub fn list(&self, character_id: &str, user_id: &str, memory_type: Option<&str>, limit: usize) -> Result<Vec<Memory>> {
        let dir = self.memory_dir(character_id, user_id);
        if !dir.exists() {
            return Ok(Vec::new());
        }

        let _guard = self.lock.read().unwrap();
        let mut memories = Vec::new();

        let files_to_read: Vec<&str> = if let Some(mt) = memory_type {
            MEMORY_FILES.iter()
                .filter(|(t, _)| *t == mt)
                .map(|(_, f)| *f)
                .collect()
        } else {
            MEMORY_FILES.iter().map(|(_, f)| *f).collect()
        };

        for filename in files_to_read {
            let path = dir.join(filename);
            if !path.exists() {
                continue;
            }
            let file = std::fs::File::open(&path)?;
            for line in std::io::BufReader::new(file).lines() {
                let line = line?;
                if line.trim().is_empty() {
                    continue;
                }
                if let Ok(mem) = serde_json::from_str::<Memory>(&line) {
                    memories.push(mem);
                }
            }
        }

        memories.sort_by(|a, b| a.ts.cmp(&b.ts));

        if limit > 0 && memories.len() > limit {
            memories = memories.split_off(memories.len() - limit);
        }

        Ok(memories)
    }

    pub fn clear(&self, character_id: &str, user_id: &str, memory_type: Option<&str>) -> Result<()> {
        let dir = self.memory_dir(character_id, user_id);
        if !dir.exists() {
            return Ok(());
        }

        let _guard = self.lock.write().unwrap();
        let files_to_clear: Vec<&str> = if let Some(mt) = memory_type {
            MEMORY_FILES.iter()
                .filter(|(t, _)| *t == mt)
                .map(|(_, f)| *f)
                .collect()
        } else {
            MEMORY_FILES.iter().map(|(_, f)| *f).collect()
        };

        for filename in files_to_clear {
            let path = dir.join(filename);
            if path.exists() {
                std::fs::write(&path, "")?;
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_append_and_list() {
        let tmp = TempDir::new().unwrap();
        let store = MemoryStore::new(tmp.path());

        store.append("char1", "user1", "semantic", "User's name is Meet", 1.0, vec!["identity".to_string()]).unwrap();
        store.append("char1", "user1", "episodic", "Had a fun chat", 0.7, vec![]).unwrap();

        let all = store.list("char1", "user1", None, 50).unwrap();
        assert_eq!(all.len(), 2);

        let semantic = store.list("char1", "user1", Some("semantic"), 50).unwrap();
        assert_eq!(semantic.len(), 1);
        assert_eq!(semantic[0].summary, "User's name is Meet");
    }

    #[test]
    fn test_clear_memories() {
        let tmp = TempDir::new().unwrap();
        let store = MemoryStore::new(tmp.path());

        store.append("char1", "user1", "semantic", "test", 0.5, vec![]).unwrap();
        store.clear("char1", "user1", None).unwrap();

        let all = store.list("char1", "user1", None, 50).unwrap();
        assert!(all.is_empty());
    }

    #[test]
    fn test_invalid_memory_type() {
        let tmp = TempDir::new().unwrap();
        let store = MemoryStore::new(tmp.path());
        let result = store.append("char1", "user1", "invalid", "test", 0.5, vec![]);
        assert!(result.is_err());
    }
}
```

- [ ] **Step 2: Write memory extractor (heuristic patterns)**

```rust
// crates/meux-core/src/memory/extractor.rs
use regex::Regex;
use std::collections::HashSet;

pub struct ExtractedMemory {
    pub memory_type: String,
    pub summary: String,
    pub importance: f64,
    pub tags: Vec<String>,
}

const STOPWORDS: &[&str] = &[
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours",
    "he", "him", "his", "she", "her", "hers", "it", "its", "they", "them", "their",
    "what", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are",
    "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does",
    "did", "doing", "a", "an", "the", "and", "but", "if", "or", "because", "as", "until",
    "while", "of", "at", "by", "for", "with", "about", "against", "between", "through",
    "during", "before", "after", "above", "below", "to", "from", "up", "down", "in", "out",
    "on", "off", "over", "under", "again", "further", "then", "once",
];

struct Pattern {
    prefix: &'static str,
    memory_type: &'static str,
    importance: f64,
    tags: &'static [&'static str],
}

const PATTERNS: &[Pattern] = &[
    Pattern { prefix: "my name is ", memory_type: "semantic", importance: 1.0, tags: &["identity", "user_profile"] },
    Pattern { prefix: "i am building ", memory_type: "semantic", importance: 0.95, tags: &["project", "user_goal"] },
    Pattern { prefix: "i'm building ", memory_type: "semantic", importance: 0.95, tags: &["project", "user_goal"] },
    Pattern { prefix: "i am working on ", memory_type: "semantic", importance: 0.9, tags: &["project", "user_goal"] },
    Pattern { prefix: "i'm working on ", memory_type: "semantic", importance: 0.9, tags: &["project", "user_goal"] },
    Pattern { prefix: "i study ", memory_type: "semantic", importance: 0.85, tags: &["education", "user_profile"] },
    Pattern { prefix: "i like ", memory_type: "semantic", importance: 0.8, tags: &["preferences"] },
    Pattern { prefix: "i love ", memory_type: "semantic", importance: 0.85, tags: &["preferences"] },
    Pattern { prefix: "i enjoy ", memory_type: "semantic", importance: 0.8, tags: &["preferences"] },
    Pattern { prefix: "i prefer ", memory_type: "semantic", importance: 0.8, tags: &["preferences"] },
    Pattern { prefix: "i hate ", memory_type: "semantic", importance: 0.85, tags: &["preferences"] },
    Pattern { prefix: "i don't like ", memory_type: "semantic", importance: 0.85, tags: &["preferences"] },
    Pattern { prefix: "my favorite ", memory_type: "semantic", importance: 0.8, tags: &["preferences"] },
    Pattern { prefix: "i want ", memory_type: "semantic", importance: 0.75, tags: &["desire"] },
    Pattern { prefix: "i need ", memory_type: "semantic", importance: 0.7, tags: &["desire"] },
    Pattern { prefix: "i am ", memory_type: "semantic", importance: 0.75, tags: &["identity", "user_profile"] },
    Pattern { prefix: "i'm ", memory_type: "semantic", importance: 0.75, tags: &["identity", "user_profile"] },
];

const PROJECT_KEYWORDS: &[&str] = &["backend", "frontend", "client", "server", "api", "database", "deploy"];

pub fn extract_memories(user_message: &str) -> Vec<ExtractedMemory> {
    let sentence_re = Regex::new(r"[.!?\n]+").unwrap();
    let sentences: Vec<&str> = sentence_re.split(user_message)
        .map(|s| s.trim())
        .filter(|s| s.len() >= 8)
        .collect();

    let mut memories = Vec::new();
    let mut seen_normalized: HashSet<String> = HashSet::new();

    for sentence in sentences {
        if let Some(mem) = build_memory_from_sentence(sentence) {
            let normalized = normalize_for_compare(&mem.summary);
            if seen_normalized.insert(normalized) {
                memories.push(mem);
            }
        }
    }

    memories
}

pub fn check_positive_response(user_message: &str) -> bool {
    let lower = user_message.to_lowercase();
    ["thanks", "thank", "helped", "helpful"].iter().any(|t| lower.contains(t))
}

fn build_memory_from_sentence(sentence: &str) -> Option<ExtractedMemory> {
    let lower = sentence.to_lowercase();

    // Direct pattern matching
    for pattern in PATTERNS {
        if lower.starts_with(pattern.prefix) {
            return Some(ExtractedMemory {
                memory_type: pattern.memory_type.to_string(),
                summary: normalize_text(sentence),
                importance: pattern.importance,
                tags: pattern.tags.iter().map(|t| t.to_string()).collect(),
            });
        }
    }

    // Heuristic: contains "remember"
    if lower.contains("remember") {
        return Some(ExtractedMemory {
            memory_type: "episodic".to_string(),
            summary: normalize_text(sentence),
            importance: 0.95,
            tags: vec!["explicit_memory".to_string()],
        });
    }

    // Heuristic: project context keywords
    if PROJECT_KEYWORDS.iter().any(|kw| lower.contains(kw)) {
        return Some(ExtractedMemory {
            memory_type: "episodic".to_string(),
            summary: normalize_text(sentence),
            importance: 0.68,
            tags: vec!["project_context".to_string()],
        });
    }

    None
}

fn normalize_text(value: &str) -> String {
    let re = Regex::new(r"\s+").unwrap();
    re.replace_all(value.trim(), " ").to_string()
}

fn normalize_for_compare(value: &str) -> String {
    let re = Regex::new(r"[^a-z0-9]+").unwrap();
    re.replace_all(&value.to_lowercase(), " ").trim().to_string()
}

pub fn extract_tokens(text: &str) -> HashSet<String> {
    let token_re = Regex::new(r"[a-zA-Z0-9']+").unwrap();
    let stopwords: HashSet<&str> = STOPWORDS.iter().copied().collect();

    token_re.find_iter(text)
        .map(|m| m.as_str().to_lowercase())
        .filter(|t| t.len() > 1 && !stopwords.contains(t.as_str()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_name() {
        let memories = extract_memories("My name is Meet");
        assert_eq!(memories.len(), 1);
        assert_eq!(memories[0].memory_type, "semantic");
        assert!(memories[0].importance >= 1.0);
        assert!(memories[0].tags.contains(&"identity".to_string()));
    }

    #[test]
    fn test_extract_preference() {
        let memories = extract_memories("I love programming and I like rust");
        assert_eq!(memories.len(), 2);
    }

    #[test]
    fn test_extract_remember() {
        let memories = extract_memories("Please remember that I have a meeting tomorrow");
        assert_eq!(memories.len(), 1);
        assert_eq!(memories[0].memory_type, "episodic");
    }

    #[test]
    fn test_extract_project_context() {
        let memories = extract_memories("I'm working on the backend api for this project");
        assert!(!memories.is_empty());
    }

    #[test]
    fn test_deduplication() {
        let memories = extract_memories("My name is Meet. My name is Meet!");
        assert_eq!(memories.len(), 1);
    }

    #[test]
    fn test_extract_tokens() {
        let tokens = extract_tokens("I love programming in Rust");
        assert!(tokens.contains("love"));
        assert!(tokens.contains("programming"));
        assert!(tokens.contains("rust"));
        assert!(!tokens.contains("i")); // stopword
        assert!(!tokens.contains("in")); // stopword
    }

    #[test]
    fn test_check_positive() {
        assert!(check_positive_response("Thanks for the help!"));
        assert!(!check_positive_response("Hello there"));
    }
}
```

- [ ] **Step 3: Write memory retriever**

```rust
// crates/meux-core/src/memory/retriever.rs
use super::store::Memory;
use super::extractor::extract_tokens;

pub fn retrieve_relevant(query: &str, memories: &[Memory], limit: usize) -> Vec<Memory> {
    let query_tokens = extract_tokens(query);
    if query_tokens.is_empty() || memories.is_empty() {
        return Vec::new();
    }

    let now = chrono::Utc::now();
    let mut scored: Vec<(f64, &Memory)> = memories.iter()
        .map(|mem| {
            let mem_tokens = extract_tokens(&mem.summary);
            let tag_set: std::collections::HashSet<String> = mem.tags.iter().cloned().collect();

            let token_overlap = query_tokens.intersection(&mem_tokens).count() as f64 * 1.6;
            let tag_overlap = query_tokens.intersection(&tag_set).count() as f64 * 1.2;
            let importance = mem.importance;

            let age_days = chrono::DateTime::parse_from_rfc3339(&mem.ts)
                .map(|ts| (now - ts.with_timezone(&chrono::Utc)).num_seconds() as f64 / 86400.0)
                .unwrap_or(365.0);
            let recency_bonus = (0.3 - (age_days / 365.0).min(0.3)).max(0.0);

            let score = token_overlap + tag_overlap + importance + recency_bonus;
            (score, mem)
        })
        .filter(|(score, _)| *score > 0.0)
        .collect();

    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(limit);
    scored.into_iter().map(|(_, mem)| mem.clone()).collect()
}

pub fn format_memory_prompt(memories: &[Memory]) -> String {
    if memories.is_empty() {
        return String::new();
    }

    let mut prompt = "You have relevant long-term memories about this user and relationship:\n".to_string();
    for mem in memories {
        prompt.push_str(&format!("- [{}] {}\n", mem.memory_type, mem.summary));
    }
    prompt
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_memory(summary: &str, memory_type: &str, importance: f64, tags: Vec<String>) -> Memory {
        Memory {
            id: "test".to_string(),
            ts: chrono::Utc::now().to_rfc3339(),
            memory_type: memory_type.to_string(),
            summary: summary.to_string(),
            importance,
            tags,
            metadata: serde_json::Value::Null,
        }
    }

    #[test]
    fn test_retrieve_relevant() {
        let memories = vec![
            make_memory("User's name is Meet", "semantic", 1.0, vec!["identity".to_string()]),
            make_memory("User likes Rust programming", "semantic", 0.8, vec!["preferences".to_string()]),
            make_memory("Had a fun chat about games", "episodic", 0.5, vec![]),
        ];

        let results = retrieve_relevant("What is my name?", &memories, 4);
        assert!(!results.is_empty());
        // "name" token should match "User's name is Meet"
        assert_eq!(results[0].summary, "User's name is Meet");
    }

    #[test]
    fn test_retrieve_empty() {
        let results = retrieve_relevant("hello", &[], 4);
        assert!(results.is_empty());
    }

    #[test]
    fn test_format_memory_prompt() {
        let memories = vec![
            make_memory("User likes Rust", "semantic", 0.8, vec![]),
        ];
        let prompt = format_memory_prompt(&memories);
        assert!(prompt.contains("[semantic] User likes Rust"));
    }
}
```

- [ ] **Step 4: Write memory module root**

```rust
// crates/meux-core/src/memory/mod.rs
pub mod store;
pub mod extractor;
pub mod retriever;

use crate::error::Result;
use store::{Memory, MemoryStore};

pub fn remember_exchange(
    store: &MemoryStore,
    character_id: &str,
    user_id: &str,
    user_message: &str,
    _assistant_message: &str,
) -> Result<Vec<Memory>> {
    let extracted = extractor::extract_memories(user_message);
    let existing = store.list(character_id, user_id, None, 0)?;
    let existing_normalized: std::collections::HashSet<String> = existing.iter()
        .map(|m| normalize_for_compare(&m.summary))
        .collect();

    let mut created = Vec::new();
    for mem in extracted {
        let normalized = normalize_for_compare(&mem.summary);
        if existing_normalized.contains(&normalized) {
            continue;
        }
        let record = store.append(character_id, user_id, &mem.memory_type, &mem.summary, mem.importance, mem.tags)?;
        created.push(record);
    }

    // Positive response reflection
    if extractor::check_positive_response(user_message) {
        let reflection = "The user responded positively to the conversation.";
        let norm = normalize_for_compare(reflection);
        if !existing_normalized.contains(&norm) {
            let record = store.append(
                character_id, user_id, "reflections", reflection,
                0.6, vec!["positive_feedback".to_string()],
            )?;
            created.push(record);
        }
    }

    Ok(created)
}

fn normalize_for_compare(value: &str) -> String {
    let re = regex::Regex::new(r"[^a-z0-9]+").unwrap();
    re.replace_all(&value.to_lowercase(), " ").trim().to_string()
}
```

- [ ] **Step 5: Run tests**

Run: `cd meuxcompanion-desktop && cargo test -p meux-core -- memory`
Expected: All tests pass (store: 3, extractor: 7, retriever: 3)

- [ ] **Step 6: Commit**

```bash
git add crates/meux-core/src/memory/
git commit -m "feat: add memory engine with heuristic extraction and token-overlap retrieval"
```

---

## Task 7: LLM Client (meux-core)

**Files:**
- Create: `crates/meux-core/src/llm/types.rs`
- Create: `crates/meux-core/src/llm/openai_compat.rs`
- Create: `crates/meux-core/src/llm/mod.rs`

- [ ] **Step 1: Write LLM types**

```rust
// crates/meux-core/src/llm/types.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct LlmStreamConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub temperature: f64,
    pub max_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunk {
    pub text: String,
}

// OpenAI API response structures
#[derive(Debug, Deserialize)]
pub struct ChatCompletionChunk {
    pub choices: Vec<ChunkChoice>,
}

#[derive(Debug, Deserialize)]
pub struct ChunkChoice {
    pub delta: ChunkDelta,
}

#[derive(Debug, Deserialize)]
pub struct ChunkDelta {
    pub content: Option<String>,
}
```

- [ ] **Step 2: Write OpenAI-compatible streaming client**

```rust
// crates/meux-core/src/llm/openai_compat.rs
use crate::error::{MeuxError, Result};
use super::types::*;
use futures::Stream;
use reqwest::Client;
use std::pin::Pin;

pub struct OpenAiCompatClient {
    http: Client,
}

impl OpenAiCompatClient {
    pub fn new() -> Self {
        Self {
            http: Client::new(),
        }
    }

    pub fn stream_chat(
        &self,
        messages: Vec<ChatMessage>,
        config: &LlmStreamConfig,
    ) -> Pin<Box<dyn Stream<Item = Result<StreamChunk>> + Send + '_>> {
        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
        let body = serde_json::json!({
            "model": config.model,
            "messages": messages,
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
            "stream": true,
        });

        let request = self.http.post(&url)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", config.api_key))
            .json(&body);

        Box::pin(async_stream::try_stream! {
            let response = request.send().await
                .map_err(|e| MeuxError::Llm(format!("Request failed: {}", e)))?;

            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                Err(MeuxError::Llm(format!("LLM API error {}: {}", status, text)))?;
            }

            let mut stream = response.bytes_stream();
            let mut buffer = String::new();

            use futures::StreamExt;
            while let Some(chunk) = stream.next().await {
                let bytes = chunk.map_err(|e| MeuxError::Llm(format!("Stream error: {}", e)))?;
                buffer.push_str(&String::from_utf8_lossy(&bytes));

                while let Some(line_end) = buffer.find('\n') {
                    let line = buffer[..line_end].trim().to_string();
                    buffer = buffer[line_end + 1..].to_string();

                    if line.is_empty() || line == "data: [DONE]" {
                        continue;
                    }

                    if let Some(json_str) = line.strip_prefix("data: ") {
                        if let Ok(chunk) = serde_json::from_str::<ChatCompletionChunk>(json_str) {
                            if let Some(choice) = chunk.choices.first() {
                                if let Some(content) = &choice.delta.content {
                                    if !content.is_empty() {
                                        yield StreamChunk { text: content.clone() };
                                    }
                                }
                            }
                        }
                    }
                }
            }
        })
    }

    pub async fn chat(
        &self,
        messages: Vec<ChatMessage>,
        config: &LlmStreamConfig,
    ) -> Result<String> {
        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
        let body = serde_json::json!({
            "model": config.model,
            "messages": messages,
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
        });

        let response = self.http.post(&url)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", config.api_key))
            .json(&body)
            .send()
            .await
            .map_err(|e| MeuxError::Llm(format!("Request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(MeuxError::Llm(format!("LLM API error {}: {}", status, text)));
        }

        let json: serde_json::Value = response.json().await
            .map_err(|e| MeuxError::Llm(format!("Parse error: {}", e)))?;

        json["choices"][0]["message"]["content"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| MeuxError::Llm("No content in response".to_string()))
    }
}
```

- [ ] **Step 3: Write LLM module root**

```rust
// crates/meux-core/src/llm/mod.rs
pub mod types;
pub mod openai_compat;

pub use openai_compat::OpenAiCompatClient;
pub use types::*;
```

- [ ] **Step 4: Add async-stream dependency**

Add to `crates/meux-core/Cargo.toml` dependencies:
```toml
async-stream = "0.3"
```

- [ ] **Step 5: Verify compilation**

Run: `cd meuxcompanion-desktop && cargo check -p meux-core`
Expected: Compiles successfully (integration tests require a running LLM, so we skip them here)

- [ ] **Step 6: Commit**

```bash
git add crates/meux-core/src/llm/ crates/meux-core/Cargo.toml
git commit -m "feat: add LLM client with OpenAI-compatible streaming via reqwest"
```

---

## Task 8: TTS Clients (meux-core)

**Files:**
- Create: `crates/meux-core/src/tts/mod.rs`
- Create: `crates/meux-core/src/tts/tiktok.rs`
- Create: `crates/meux-core/src/tts/elevenlabs.rs`
- Create: `crates/meux-core/src/tts/openai.rs`

- [ ] **Step 1: Write TTS module root with trait and voice lists**

```rust
// crates/meux-core/src/tts/mod.rs
pub mod tiktok;
pub mod elevenlabs;
pub mod openai;

use crate::config::types::TtsConfig;
use crate::error::{MeuxError, Result};

#[derive(Debug, Clone, serde::Serialize)]
pub struct VoiceInfo {
    pub id: String,
    pub name: String,
}

pub async fn generate_tts_auto(text: &str, config: &TtsConfig) -> Result<Vec<u8>> {
    let voice = if config.voice.is_empty() { "jp_001" } else { &config.voice };

    match config.provider.as_str() {
        "tiktok" | "" => tiktok::generate(text, voice).await,
        "elevenlabs" => {
            let key = config.api_key.as_deref()
                .ok_or_else(|| MeuxError::Tts("ElevenLabs requires an API key".to_string()))?;
            elevenlabs::generate(text, voice, key).await
        }
        "openai_tts" => {
            let key = config.api_key.as_deref()
                .ok_or_else(|| MeuxError::Tts("OpenAI TTS requires an API key".to_string()))?;
            openai::generate(text, voice, key).await
        }
        other => Err(MeuxError::Tts(format!("Unknown TTS provider: {}", other))),
    }
}

pub fn list_voices(provider: &str) -> Vec<VoiceInfo> {
    match provider {
        "tiktok" | "" => tiktok::list_voices(),
        "elevenlabs" => elevenlabs::list_voices(),
        "openai_tts" => openai::list_voices(),
        _ => Vec::new(),
    }
}
```

- [ ] **Step 2: Write TikTok TTS client**

```rust
// crates/meux-core/src/tts/tiktok.rs
use crate::error::{MeuxError, Result};
use super::VoiceInfo;
use reqwest::Client;
use std::sync::OnceLock;

const ENDPOINTS: &[&str] = &[
    "https://tiktok-tts.weilnet.workers.dev/api/generation",
    "https://tiktoktts.com/api/tiktok-tts",
];
const TEXT_BYTE_LIMIT: usize = 300;

static HTTP: OnceLock<Client> = OnceLock::new();

fn client() -> &'static Client {
    HTTP.get_or_init(Client::new)
}

pub async fn generate(text: &str, voice: &str) -> Result<Vec<u8>> {
    let chunks = split_text(text, TEXT_BYTE_LIMIT);
    if chunks.is_empty() {
        return Err(MeuxError::Tts("Empty text".to_string()));
    }

    let mut audio_parts = Vec::new();
    for chunk in &chunks {
        let audio = generate_chunk(chunk, voice).await?;
        audio_parts.push(audio);
    }

    Ok(audio_parts.concat())
}

async fn generate_chunk(text: &str, voice: &str) -> Result<Vec<u8>> {
    for (i, endpoint) in ENDPOINTS.iter().enumerate() {
        match try_endpoint(endpoint, text, voice, i).await {
            Ok(bytes) => return Ok(bytes),
            Err(_) => continue,
        }
    }
    Err(MeuxError::Tts("All TTS endpoints failed".to_string()))
}

async fn try_endpoint(endpoint: &str, text: &str, voice: &str, idx: usize) -> Result<Vec<u8>> {
    let body = serde_json::json!({
        "text": text,
        "voice": voice,
    });

    let response = client().post(*endpoint)
        .json(&body)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| MeuxError::Tts(format!("Endpoint {} failed: {}", idx, e)))?;

    let json: serde_json::Value = response.json().await
        .map_err(|e| MeuxError::Tts(format!("Parse error: {}", e)))?;

    let b64 = json.get("data")
        .or_else(|| json.get("audio"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| MeuxError::Tts("No audio data in response".to_string()))?;

    use base64::Engine;
    base64::engine::general_purpose::STANDARD.decode(b64)
        .map_err(|e| MeuxError::Tts(format!("Base64 decode error: {}", e)))
}

fn split_text(text: &str, chunk_size: usize) -> Vec<String> {
    if text.len() <= chunk_size {
        return vec![text.to_string()];
    }

    let mut chunks = Vec::new();
    let mut current = String::new();

    for word in text.split_whitespace() {
        if current.len() + word.len() + 1 > chunk_size && !current.is_empty() {
            chunks.push(current.clone());
            current.clear();
        }
        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(word);
    }
    if !current.is_empty() {
        chunks.push(current);
    }
    chunks
}

pub fn list_voices() -> Vec<VoiceInfo> {
    vec![
        VoiceInfo { id: "jp_001".to_string(), name: "Japanese Female 1".to_string() },
        VoiceInfo { id: "jp_006".to_string(), name: "Japanese Male 1".to_string() },
        VoiceInfo { id: "en_us_001".to_string(), name: "English US Female".to_string() },
        VoiceInfo { id: "en_us_006".to_string(), name: "English US Male 1".to_string() },
        VoiceInfo { id: "en_us_010".to_string(), name: "English US Male 2".to_string() },
        VoiceInfo { id: "en_uk_001".to_string(), name: "English UK Male".to_string() },
        VoiceInfo { id: "en_au_001".to_string(), name: "English AU Female".to_string() },
        VoiceInfo { id: "fr_001".to_string(), name: "French Male 1".to_string() },
        VoiceInfo { id: "de_001".to_string(), name: "German Female".to_string() },
        VoiceInfo { id: "kr_002".to_string(), name: "Korean Male 1".to_string() },
        VoiceInfo { id: "en_male_narration".to_string(), name: "English Narrator".to_string() },
        VoiceInfo { id: "en_female_emotional".to_string(), name: "English Emotional Female".to_string() },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_text_short() {
        let chunks = split_text("Hello world", 300);
        assert_eq!(chunks.len(), 1);
    }

    #[test]
    fn test_split_text_long() {
        let long = "word ".repeat(100);
        let chunks = split_text(&long, 50);
        assert!(chunks.len() > 1);
        for chunk in &chunks {
            assert!(chunk.len() <= 54); // some tolerance for word boundaries
        }
    }
}
```

- [ ] **Step 3: Write ElevenLabs TTS client**

```rust
// crates/meux-core/src/tts/elevenlabs.rs
use crate::error::{MeuxError, Result};
use super::VoiceInfo;
use reqwest::Client;
use std::sync::OnceLock;

static HTTP: OnceLock<Client> = OnceLock::new();

fn client() -> &'static Client {
    HTTP.get_or_init(Client::new)
}

pub async fn generate(text: &str, voice_id: &str, api_key: &str) -> Result<Vec<u8>> {
    let url = format!("https://api.elevenlabs.io/v1/text-to-speech/{}", voice_id);

    let response = client().post(&url)
        .header("xi-api-key", api_key)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "text": text,
            "model_id": "eleven_monolingual_v1",
        }))
        .send()
        .await
        .map_err(|e| MeuxError::Tts(format!("ElevenLabs request failed: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(MeuxError::Tts(format!("ElevenLabs error {}: {}", status, text)));
    }

    Ok(response.bytes().await
        .map_err(|e| MeuxError::Tts(format!("ElevenLabs read error: {}", e)))?
        .to_vec())
}

pub fn list_voices() -> Vec<VoiceInfo> {
    vec![
        VoiceInfo { id: "21m00Tcm4TlvDq8ikWAM".to_string(), name: "Rachel".to_string() },
        VoiceInfo { id: "AZnzlk1XvdvUeBnXmlld".to_string(), name: "Domi".to_string() },
        VoiceInfo { id: "EXAVITQu4vr4xnSDxMaL".to_string(), name: "Bella".to_string() },
        VoiceInfo { id: "MF3mGyEYCl7XYWbV9V6O".to_string(), name: "Elli".to_string() },
        VoiceInfo { id: "TxGEqnHWrfWFTfGW9XjX".to_string(), name: "Josh".to_string() },
        VoiceInfo { id: "VR6AewLTigWG4xSOukaG".to_string(), name: "Arnold".to_string() },
        VoiceInfo { id: "pNInz6obpgDQGcFmaJgB".to_string(), name: "Adam".to_string() },
        VoiceInfo { id: "yoZ06aMxZJJ28mfd3POQ".to_string(), name: "Sam".to_string() },
    ]
}
```

- [ ] **Step 4: Write OpenAI TTS client**

```rust
// crates/meux-core/src/tts/openai.rs
use crate::error::{MeuxError, Result};
use super::VoiceInfo;
use reqwest::Client;
use std::sync::OnceLock;

static HTTP: OnceLock<Client> = OnceLock::new();

fn client() -> &'static Client {
    HTTP.get_or_init(Client::new)
}

pub async fn generate(text: &str, voice: &str, api_key: &str) -> Result<Vec<u8>> {
    let response = client().post("https://api.openai.com/v1/audio/speech")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": "tts-1",
            "input": text,
            "voice": voice,
        }))
        .send()
        .await
        .map_err(|e| MeuxError::Tts(format!("OpenAI TTS request failed: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(MeuxError::Tts(format!("OpenAI TTS error {}: {}", status, text)));
    }

    Ok(response.bytes().await
        .map_err(|e| MeuxError::Tts(format!("OpenAI TTS read error: {}", e)))?
        .to_vec())
}

pub fn list_voices() -> Vec<VoiceInfo> {
    vec![
        VoiceInfo { id: "alloy".to_string(), name: "Alloy".to_string() },
        VoiceInfo { id: "echo".to_string(), name: "Echo".to_string() },
        VoiceInfo { id: "fable".to_string(), name: "Fable".to_string() },
        VoiceInfo { id: "onyx".to_string(), name: "Onyx".to_string() },
        VoiceInfo { id: "nova".to_string(), name: "Nova".to_string() },
        VoiceInfo { id: "shimmer".to_string(), name: "Shimmer".to_string() },
    ]
}
```

- [ ] **Step 5: Run tests**

Run: `cd meuxcompanion-desktop && cargo test -p meux-core -- tts`
Expected: 2 tests pass (split_text tests)

- [ ] **Step 6: Commit**

```bash
git add crates/meux-core/src/tts/
git commit -m "feat: add TTS clients for TikTok, ElevenLabs, and OpenAI"
```

---

## Task 9: Expression Resolution (meux-core)

**Files:**
- Create: `crates/meux-core/src/expressions/mod.rs`

- [ ] **Step 1: Write expression resolution module**

```rust
// crates/meux-core/src/expressions/mod.rs
use crate::error::Result;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

pub const GLOBAL_EXPRESSIONS: &[&str] = &[
    "neutral", "happy", "sad", "angry", "surprised", "excited",
    "embarrassed", "thinking", "blush", "smirk", "scared", "disgusted",
];

pub struct ExpressionManager {
    mappings_dir: PathBuf,
    cache: RwLock<HashMap<String, HashMap<String, String>>>,
}

impl ExpressionManager {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            mappings_dir: data_dir.join("models").join("expression_mappings"),
            cache: RwLock::new(HashMap::new()),
        }
    }

    pub fn get_mapping(&self, model_id: &str) -> HashMap<String, String> {
        // Check cache
        {
            let cache = self.cache.read().unwrap();
            if let Some(mapping) = cache.get(model_id) {
                return mapping.clone();
            }
        }

        // Load from file
        let path = self.mappings_dir.join(format!("{}.json", model_id));
        let mapping = if path.exists() {
            std::fs::read_to_string(&path)
                .ok()
                .and_then(|content| serde_json::from_str::<HashMap<String, String>>(&content).ok())
                .unwrap_or_default()
        } else {
            HashMap::new()
        };

        // Cache
        {
            let mut cache = self.cache.write().unwrap();
            cache.insert(model_id.to_string(), mapping.clone());
        }

        mapping
    }

    pub fn save_mapping(&self, model_id: &str, mapping: &HashMap<String, String>) -> Result<()> {
        std::fs::create_dir_all(&self.mappings_dir)?;
        let path = self.mappings_dir.join(format!("{}.json", model_id));
        let content = serde_json::to_string_pretty(mapping)?;
        std::fs::write(&path, content)?;

        let mut cache = self.cache.write().unwrap();
        cache.insert(model_id.to_string(), mapping.clone());

        Ok(())
    }

    pub fn resolve(&self, model_id: &str, global_name: &str) -> String {
        let mapping = self.get_mapping(model_id);
        mapping.get(global_name)
            .cloned()
            .unwrap_or_else(|| global_name.to_string())
    }

    pub fn validate_expression(&self, name: &str, available: &[String]) -> Option<String> {
        let lower = name.to_lowercase().trim().to_string();
        available.iter()
            .find(|e| e.to_lowercase() == lower)
            .cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_empty_mapping() {
        let tmp = TempDir::new().unwrap();
        let mgr = ExpressionManager::new(tmp.path());
        let resolved = mgr.resolve("nonexistent", "happy");
        assert_eq!(resolved, "happy");
    }

    #[test]
    fn test_save_and_resolve() {
        let tmp = TempDir::new().unwrap();
        let mgr = ExpressionManager::new(tmp.path());

        let mut mapping = HashMap::new();
        mapping.insert("happy".to_string(), "expr_03".to_string());
        mgr.save_mapping("model1", &mapping).unwrap();

        let resolved = mgr.resolve("model1", "happy");
        assert_eq!(resolved, "expr_03");

        let unresolved = mgr.resolve("model1", "sad");
        assert_eq!(unresolved, "sad");
    }

    #[test]
    fn test_validate_expression() {
        let tmp = TempDir::new().unwrap();
        let mgr = ExpressionManager::new(tmp.path());
        let available = vec!["Happy".to_string(), "Sad".to_string()];

        assert_eq!(mgr.validate_expression("happy", &available), Some("Happy".to_string()));
        assert_eq!(mgr.validate_expression("unknown", &available), None);
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd meuxcompanion-desktop && cargo test -p meux-core -- expressions`
Expected: 3 tests pass

- [ ] **Step 3: Commit**

```bash
git add crates/meux-core/src/expressions/
git commit -m "feat: add expression manager with mapping resolution and caching"
```

---

## Task 10: Prompt Builder (meux-core)

**Files:**
- Create: `crates/meux-core/src/prompt/mod.rs`

- [ ] **Step 1: Write prompt builder**

```rust
// crates/meux-core/src/prompt/mod.rs
use crate::character::{self, CharacterLoader};
use crate::error::Result;
use crate::expressions::{ExpressionManager, GLOBAL_EXPRESSIONS};
use crate::llm::types::ChatMessage;
use crate::memory::retriever;
use crate::memory::store::MemoryStore;
use crate::session::SessionStore;
use crate::state::{self, StateStore};

const DEFAULT_HISTORY_LIMIT: usize = 20;
const DEFAULT_MEMORY_LIMIT: usize = 4;

pub struct ChatPromptResult {
    pub messages: Vec<ChatMessage>,
    pub system_prompt: String,
    pub state_prompt: String,
    pub memory_prompt: String,
}

pub fn build_chat_prompt(
    character_loader: &CharacterLoader,
    session_store: &SessionStore,
    state_store: &StateStore,
    memory_store: &MemoryStore,
    _expression_manager: &ExpressionManager,
    character_id: &str,
    user_id: &str,
    user_message: &str,
    history_limit: Option<usize>,
    memory_limit: Option<usize>,
) -> Result<ChatPromptResult> {
    let history_limit = history_limit.unwrap_or(DEFAULT_HISTORY_LIMIT);
    let memory_limit = memory_limit.unwrap_or(DEFAULT_MEMORY_LIMIT);

    // Load character
    let char_data = character_loader.load_character(character_id)?;

    // Build system prompt with global expressions
    let global_exprs: Vec<String> = GLOBAL_EXPRESSIONS.iter().map(|s| s.to_string()).collect();
    let system_prompt = character::build_system_prompt(&char_data, Some(&global_exprs));

    // Load state
    let char_state = state_store.load(character_id, user_id)?;
    let state_prompt = state::format_state_prompt(&char_state);

    // Ensure memory store exists and retrieve relevant memories
    memory_store.ensure_store(character_id, user_id)?;
    let all_memories = memory_store.list(character_id, user_id, None, 0)?;
    let relevant = retriever::retrieve_relevant(user_message, &all_memories, memory_limit);
    let memory_prompt = retriever::format_memory_prompt(&relevant);

    // Load session history
    let history = session_store.load_history(character_id, user_id, Some(history_limit))?;

    // Assemble messages
    let mut messages = Vec::new();

    // System message
    messages.push(ChatMessage {
        role: "system".to_string(),
        content: system_prompt.clone(),
    });

    // State prompt
    if !state_prompt.is_empty() {
        messages.push(ChatMessage {
            role: "system".to_string(),
            content: state_prompt.clone(),
        });
    }

    // Memory prompt
    if !memory_prompt.is_empty() {
        messages.push(ChatMessage {
            role: "system".to_string(),
            content: memory_prompt.clone(),
        });
    }

    // History
    for msg in &history {
        messages.push(ChatMessage {
            role: msg.role.clone(),
            content: msg.content.clone(),
        });
    }

    // Current user message
    messages.push(ChatMessage {
        role: "user".to_string(),
        content: user_message.to_string(),
    });

    Ok(ChatPromptResult {
        messages,
        system_prompt,
        state_prompt,
        memory_prompt,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_build_chat_prompt() {
        let tmp = TempDir::new().unwrap();
        let char_loader = CharacterLoader::new(tmp.path());
        let session_store = SessionStore::new(tmp.path());
        let state_store = StateStore::new(tmp.path());
        let memory_store = MemoryStore::new(tmp.path());
        let expr_mgr = ExpressionManager::new(tmp.path());

        // Create a test character
        char_loader.create_character("Test", "A helpful companion", "model1", "jp_001", "User", "A dev").unwrap();

        let result = build_chat_prompt(
            &char_loader, &session_store, &state_store, &memory_store, &expr_mgr,
            "test", "default-user", "Hello there!",
            None, None,
        ).unwrap();

        // Should have: system prompt, state prompt, user message (memory prompt empty)
        assert!(result.messages.len() >= 2);
        assert_eq!(result.messages[0].role, "system");
        assert_eq!(result.messages.last().unwrap().role, "user");
        assert_eq!(result.messages.last().unwrap().content, "Hello there!");
        assert!(result.system_prompt.contains("EXPRESSION RULES"));
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd meuxcompanion-desktop && cargo test -p meux-core -- prompt`
Expected: 1 test passes

- [ ] **Step 3: Run all meux-core tests**

Run: `cd meuxcompanion-desktop && cargo test -p meux-core`
Expected: All tests pass (~30+ tests)

- [ ] **Step 4: Commit**

```bash
git add crates/meux-core/src/prompt/
git commit -m "feat: add prompt builder assembling character, state, memory, and history"
```

---

## Task 11: Tauri Commands — Config & Characters

**Files:**
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/config.rs`
- Create: `src-tauri/src/commands/characters.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create app state struct**

```rust
// src-tauri/src/lib.rs
mod commands;
mod window;
mod tray;

use meux_core::config::ConfigManager;
use meux_core::character::CharacterLoader;
use meux_core::session::SessionStore;
use meux_core::state::StateStore;
use meux_core::memory::store::MemoryStore;
use meux_core::expressions::ExpressionManager;
use meux_core::llm::OpenAiCompatClient;
use std::sync::Arc;

pub struct AppState {
    pub config: ConfigManager,
    pub characters: CharacterLoader,
    pub sessions: SessionStore,
    pub states: StateStore,
    pub memories: MemoryStore,
    pub expressions: ExpressionManager,
    pub llm: OpenAiCompatClient,
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()
                .expect("Failed to get app data directory");
            std::fs::create_dir_all(&data_dir).expect("Failed to create data directory");

            let state = AppState {
                config: ConfigManager::new(&data_dir),
                characters: CharacterLoader::new(&data_dir),
                sessions: SessionStore::new(&data_dir),
                states: StateStore::new(&data_dir),
                memories: MemoryStore::new(&data_dir),
                expressions: ExpressionManager::new(&data_dir),
                llm: OpenAiCompatClient::new(),
            };

            app.manage(Arc::new(state));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::config::config_get,
            commands::config::config_save,
            commands::config::config_test_llm,
            commands::characters::characters_list,
            commands::characters::characters_get,
            commands::characters::characters_create,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Create commands module**

```rust
// src-tauri/src/commands/mod.rs
pub mod config;
pub mod characters;
pub mod chat;
pub mod memory;
pub mod state;
pub mod expressions;
pub mod tts;
```

- [ ] **Step 3: Write config commands**

```rust
// src-tauri/src/commands/config.rs
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
pub async fn config_test_llm(state: State<'_, Arc<AppState>>, provider: serde_json::Value) -> Result<String, String> {
    let base_url = provider.get("base_url").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let api_key = provider.get("api_key").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let model = provider.get("model").and_then(|v| v.as_str()).unwrap_or("gpt-4o").to_string();

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

    let response = state.llm.chat(messages, &config).await.map_err(|e| e.to_string())?;
    Ok(response)
}
```

- [ ] **Step 4: Write character commands**

```rust
// src-tauri/src/commands/characters.rs
use crate::AppState;
use meux_core::character::types::{Character, CharacterSummary};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn characters_list(state: State<Arc<AppState>>) -> Result<Vec<CharacterSummary>, String> {
    state.characters.list_characters().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn characters_get(state: State<Arc<AppState>>, id: String) -> Result<Character, String> {
    state.characters.load_character(&id).map_err(|e| e.to_string())
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
    state.characters.create_character(&name, &personality, &model_id, &voice, &user_name, &user_about)
        .map_err(|e| e.to_string())
}
```

- [ ] **Step 5: Create placeholder files for remaining command modules**

```rust
// src-tauri/src/commands/chat.rs
// Chat commands — implemented in Task 12

// src-tauri/src/commands/memory.rs
// Memory commands — implemented in Task 13

// src-tauri/src/commands/state.rs
// State commands — implemented in Task 13

// src-tauri/src/commands/expressions.rs
// Expression commands — implemented in Task 13

// src-tauri/src/commands/tts.rs
// TTS commands — implemented in Task 13
```

```rust
// src-tauri/src/window.rs
// Window management — implemented in Task 14

// src-tauri/src/tray.rs
// Tray — implemented in Task 14
```

- [ ] **Step 6: Verify compilation**

Run: `cd meuxcompanion-desktop && cargo check -p meuxcompanion-desktop`
Expected: Compiles successfully

- [ ] **Step 7: Commit**

```bash
git add src-tauri/
git commit -m "feat: add Tauri commands for config and character management"
```

---

## Task 12: Tauri Chat Streaming Command

**Files:**
- Modify: `src-tauri/src/commands/chat.rs`
- Modify: `src-tauri/src/lib.rs` (register command)

- [ ] **Step 1: Write chat streaming command with expression parsing and parallel TTS**

```rust
// src-tauri/src/commands/chat.rs
use crate::AppState;
use meux_core::config::types::AppConfig;
use meux_core::llm::types::LlmStreamConfig;
use meux_core::prompt;
use regex::Regex;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, serde::Serialize)]
struct TextChunkEvent {
    text: String,
}

#[derive(Clone, serde::Serialize)]
struct SentenceEvent {
    index: u32,
    text: String,
    expression: String,
}

#[derive(Clone, serde::Serialize)]
struct AudioEvent {
    index: u32,
    data: Vec<u8>,
}

#[derive(Clone, serde::Serialize)]
struct ChatDoneEvent {
    state_update: serde_json::Value,
}

#[derive(Clone, serde::Serialize)]
struct ChatErrorEvent {
    message: String,
}

#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    character_id: String,
    message: String,
) -> Result<(), String> {
    let state = state.inner().clone();
    let app = app.clone();

    tokio::spawn(async move {
        if let Err(e) = run_chat_stream(&app, &state, &character_id, &message).await {
            let _ = app.emit("chat:error", ChatErrorEvent { message: e.to_string() });
        }
    });

    Ok(())
}

async fn run_chat_stream(
    app: &AppHandle,
    state: &AppState,
    character_id: &str,
    user_message: &str,
) -> Result<(), meux_core::MeuxError> {
    let config: AppConfig = state.config.load()?;
    let user_id = if config.user.name.is_empty() {
        "default-user".to_string()
    } else {
        meux_core::character::slugify(&config.user.name)
    };

    // Build prompt
    let prompt_result = prompt::build_chat_prompt(
        &state.characters, &state.sessions, &state.states,
        &state.memories, &state.expressions,
        character_id, &user_id, user_message,
        None, None,
    )?;

    // Get LLM config
    let llm_config = LlmStreamConfig {
        base_url: config.llm.base_url.clone(),
        api_key: config.llm.api_key.clone().unwrap_or_default(),
        model: config.llm.model.clone(),
        temperature: 0.7,
        max_tokens: 1024,
    };

    // Load character for expression mapping
    let character = state.characters.load_character(character_id)?;
    let model_id = &character.live2d_model;
    let tts_config = config.tts.clone();

    // Stream LLM
    let stream = state.llm.stream_chat(prompt_result.messages, &llm_config);
    use futures::StreamExt;
    tokio::pin!(stream);

    let expr_tag = Regex::new(r"<<([^/>][^>]*)>>").unwrap();
    let closing_tag = Regex::new(r"<</[^>]*>>").unwrap();

    let mut buffer = String::new();
    let mut pending_text = String::new();
    let mut current_expression = "neutral".to_string();
    let mut sentence_index: u32 = 0;
    let mut full_text = String::new();

    let app_clone = app.clone();
    let state_clone_for_tts = Arc::new(tts_config);

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result?;
        buffer.push_str(&chunk.text);
        full_text.push_str(&chunk.text);

        // Emit text chunk for live display
        let _ = app.emit("chat:text-chunk", TextChunkEvent { text: chunk.text });

        // Remove closing tags
        buffer = closing_tag.replace_all(&buffer, "").to_string();

        // Parse expression tags
        while let Some(m) = expr_tag.find(&buffer) {
            let before = buffer[..m.start()].to_string();
            let tag_content = expr_tag.captures(&buffer[m.start()..])
                .and_then(|c| c.get(1))
                .map(|g| g.as_str().trim().to_string())
                .unwrap_or_default();

            pending_text.push_str(&before);

            // Flush pending text as a sentence
            let clean = clean_text(&pending_text, &expr_tag, &closing_tag);
            if clean.len() >= 2 {
                let mapped = state.expressions.resolve(model_id, &current_expression);
                let _ = app.emit("chat:sentence", SentenceEvent {
                    index: sentence_index,
                    text: clean.clone(),
                    expression: mapped,
                });

                // Spawn TTS in parallel
                let tts_cfg = state_clone_for_tts.clone();
                let app_for_tts = app_clone.clone();
                let idx = sentence_index;
                let text_for_tts = clean;
                tokio::spawn(async move {
                    if let Ok(audio) = meux_core::tts::generate_tts_auto(&text_for_tts, &tts_cfg).await {
                        let _ = app_for_tts.emit("chat:audio", AudioEvent { index: idx, data: audio });
                    }
                });

                sentence_index += 1;
            }

            pending_text.clear();
            current_expression = tag_content;
            buffer = buffer[m.end()..].to_string();
        }

        pending_text.push_str(&buffer);
        buffer.clear();
    }

    // Flush remaining text
    let clean = clean_text(&pending_text, &expr_tag, &closing_tag);
    if clean.len() >= 2 {
        let mapped = state.expressions.resolve(model_id, &current_expression);
        let _ = app.emit("chat:sentence", SentenceEvent {
            index: sentence_index,
            text: clean.clone(),
            expression: mapped,
        });

        let tts_cfg = state_clone_for_tts.clone();
        let app_for_tts = app_clone.clone();
        let idx = sentence_index;
        tokio::spawn(async move {
            if let Ok(audio) = meux_core::tts::generate_tts_auto(&idx_text, &tts_cfg).await {
                let _ = app_for_tts.emit("chat:audio", AudioEvent { index: idx, data: audio });
            }
        });
    }

    // Clean the full response text
    let assistant_text = clean_text(&full_text, &expr_tag, &closing_tag);

    // Save to session
    state.sessions.append_message(character_id, &user_id, "user", user_message, None)?;
    state.sessions.append_message(character_id, &user_id, "assistant", &assistant_text, None)?;

    // Remember exchange for memory
    meux_core::memory::remember_exchange(
        &state.memories, character_id, &user_id, user_message, &assistant_text,
    )?;

    // Update relationship state
    let updated_state = state.states.update_from_exchange(character_id, &user_id, user_message, &assistant_text)?;
    let state_json = serde_json::to_value(&updated_state).unwrap_or_default();

    let _ = app.emit("chat:done", ChatDoneEvent { state_update: state_json });

    Ok(())
}

fn clean_text(text: &str, expr_tag: &Regex, closing_tag: &Regex) -> String {
    let cleaned = expr_tag.replace_all(text, "");
    let cleaned = closing_tag.replace_all(&cleaned, "");
    cleaned.trim().to_string()
}
```

**Note:** There's a typo in the final TTS spawn (`idx_text` should be `clean`). Fix it:

```rust
// In the final flush section, the TTS spawn should use `clean` not `idx_text`:
        let text_for_tts = clean;
        tokio::spawn(async move {
            if let Ok(audio) = meux_core::tts::generate_tts_auto(&text_for_tts, &tts_cfg).await {
                let _ = app_for_tts.emit("chat:audio", AudioEvent { index: idx, data: audio });
            }
        });
```

- [ ] **Step 2: Register chat command in lib.rs**

Add `commands::chat::chat_send` to the `invoke_handler` macro and add `commands::chat::chat_history` and `commands::chat::chat_clear`:

```rust
// Append to src-tauri/src/commands/chat.rs

#[tauri::command]
pub fn chat_history(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    let user_id = if config.user.name.is_empty() {
        "default-user".to_string()
    } else {
        meux_core::character::slugify(&config.user.name)
    };

    let history = state.sessions.load_history(&character_id, &user_id, Some(50))
        .map_err(|e| e.to_string())?;
    let json: Vec<serde_json::Value> = history.iter()
        .map(|m| serde_json::to_value(m).unwrap_or_default())
        .collect();
    Ok(json)
}

#[tauri::command]
pub fn chat_clear(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<(), String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    let user_id = if config.user.name.is_empty() {
        "default-user".to_string()
    } else {
        meux_core::character::slugify(&config.user.name)
    };

    state.sessions.clear_history(&character_id, &user_id).map_err(|e| e.to_string())
}
```

Update invoke_handler in `src-tauri/src/lib.rs`:
```rust
        .invoke_handler(tauri::generate_handler![
            commands::config::config_get,
            commands::config::config_save,
            commands::config::config_test_llm,
            commands::characters::characters_list,
            commands::characters::characters_get,
            commands::characters::characters_create,
            commands::chat::chat_send,
            commands::chat::chat_history,
            commands::chat::chat_clear,
        ])
```

- [ ] **Step 3: Add regex dependency to src-tauri**

Add to `src-tauri/Cargo.toml`:
```toml
regex = "1"
futures = "0.3"
```

- [ ] **Step 4: Verify compilation**

Run: `cd meuxcompanion-desktop && cargo check -p meuxcompanion-desktop`
Expected: Compiles (fix any type issues)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/
git commit -m "feat: add chat streaming command with expression parsing and parallel TTS"
```

---

## Task 13: Remaining Tauri Commands (Memory, State, Expressions, TTS)

**Files:**
- Modify: `src-tauri/src/commands/memory.rs`
- Modify: `src-tauri/src/commands/state.rs`
- Modify: `src-tauri/src/commands/expressions.rs`
- Modify: `src-tauri/src/commands/tts.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write memory commands**

```rust
// src-tauri/src/commands/memory.rs
use crate::AppState;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn memory_get(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    let user_id = if config.user.name.is_empty() { "default-user".to_string() } else { meux_core::character::slugify(&config.user.name) };

    let memories = state.memories.list(&character_id, &user_id, None, 50).map_err(|e| e.to_string())?;
    Ok(memories.into_iter().map(|m| serde_json::to_value(m).unwrap_or_default()).collect())
}

#[tauri::command]
pub fn memory_search(
    state: State<Arc<AppState>>,
    character_id: String,
    query: String,
) -> Result<Vec<serde_json::Value>, String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    let user_id = if config.user.name.is_empty() { "default-user".to_string() } else { meux_core::character::slugify(&config.user.name) };

    let all = state.memories.list(&character_id, &user_id, None, 0).map_err(|e| e.to_string())?;
    let relevant = meux_core::memory::retriever::retrieve_relevant(&query, &all, 4);
    Ok(relevant.into_iter().map(|m| serde_json::to_value(m).unwrap_or_default()).collect())
}

#[tauri::command]
pub fn memory_clear(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<(), String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    let user_id = if config.user.name.is_empty() { "default-user".to_string() } else { meux_core::character::slugify(&config.user.name) };

    state.memories.clear(&character_id, &user_id, None).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Write state commands**

```rust
// src-tauri/src/commands/state.rs
use crate::AppState;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn state_get(
    state: State<Arc<AppState>>,
    character_id: String,
) -> Result<serde_json::Value, String> {
    let config = state.config.load().map_err(|e| e.to_string())?;
    let user_id = if config.user.name.is_empty() { "default-user".to_string() } else { meux_core::character::slugify(&config.user.name) };

    let char_state = state.states.load(&character_id, &user_id).map_err(|e| e.to_string())?;
    serde_json::to_value(char_state).map_err(|e| e.to_string())
}
```

- [ ] **Step 3: Write expression commands**

```rust
// src-tauri/src/commands/expressions.rs
use crate::AppState;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn expressions_get(
    state: State<Arc<AppState>>,
    model_id: String,
) -> Result<HashMap<String, String>, String> {
    Ok(state.expressions.get_mapping(&model_id))
}

#[tauri::command]
pub fn expressions_save(
    state: State<Arc<AppState>>,
    model_id: String,
    mapping: HashMap<String, String>,
) -> Result<(), String> {
    state.expressions.save_mapping(&model_id, &mapping).map_err(|e| e.to_string())
}
```

- [ ] **Step 4: Write TTS commands**

```rust
// src-tauri/src/commands/tts.rs
use crate::AppState;
use meux_core::tts::VoiceInfo;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn tts_voices(
    _state: State<Arc<AppState>>,
    provider: String,
) -> Result<Vec<VoiceInfo>, String> {
    Ok(meux_core::tts::list_voices(&provider))
}
```

- [ ] **Step 5: Register all commands in lib.rs**

Update the invoke_handler in `src-tauri/src/lib.rs`:
```rust
        .invoke_handler(tauri::generate_handler![
            commands::config::config_get,
            commands::config::config_save,
            commands::config::config_test_llm,
            commands::characters::characters_list,
            commands::characters::characters_get,
            commands::characters::characters_create,
            commands::chat::chat_send,
            commands::chat::chat_history,
            commands::chat::chat_clear,
            commands::memory::memory_get,
            commands::memory::memory_search,
            commands::memory::memory_clear,
            commands::state::state_get,
            commands::expressions::expressions_get,
            commands::expressions::expressions_save,
            commands::tts::tts_voices,
        ])
```

- [ ] **Step 6: Verify compilation**

Run: `cd meuxcompanion-desktop && cargo check -p meuxcompanion-desktop`
Expected: Compiles

- [ ] **Step 7: Commit**

```bash
git add src-tauri/
git commit -m "feat: add memory, state, expression, and TTS Tauri commands"
```

---

## Task 14: Window Management & System Tray

**Files:**
- Modify: `src-tauri/src/window.rs`
- Modify: `src-tauri/src/tray.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Write window management**

```rust
// src-tauri/src/window.rs
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub fn create_mini_widget(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window("mini").is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(app, "mini", WebviewUrl::App("index.html?mode=mini".into()))
        .title("MeuxCompanion")
        .inner_size(200.0, 300.0)
        .decorations(false)
        .always_on_top(true)
        .transparent(true)
        .resizable(false)
        .skip_taskbar(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

pub fn close_mini_widget(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("mini") {
        let _ = window.close();
    }
}

#[tauri::command]
pub fn window_toggle_mini(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window("mini").is_some() {
        close_mini_widget(&app);
        show_main_window(&app);
    } else {
        hide_main_window(&app);
        create_mini_widget(&app)?;
    }
    Ok(())
}

#[tauri::command]
pub fn window_expand(app: AppHandle) -> Result<(), String> {
    close_mini_widget(&app);
    show_main_window(&app);
    Ok(())
}

pub fn cycle_window_state(app: &AppHandle) {
    let main_visible = app.get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false);
    let mini_exists = app.get_webview_window("mini").is_some();

    if main_visible {
        // Main visible → hide main, show mini
        hide_main_window(app);
        let _ = create_mini_widget(app);
    } else if mini_exists {
        // Mini visible → hide everything
        close_mini_widget(app);
    } else {
        // Everything hidden → show main
        show_main_window(app);
    }
}
```

- [ ] **Step 2: Write system tray**

```rust
// src-tauri/src/tray.rs
use crate::window;
use tauri::{
    AppHandle,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

pub fn setup_tray(app: &AppHandle) -> Result<(), String> {
    let open = MenuItem::with_id(app, "open", "Open", true, None::<&str>).map_err(|e| e.to_string())?;
    let toggle_mini = MenuItem::with_id(app, "toggle_mini", "Toggle Mini Mode", true, None::<&str>).map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>).map_err(|e| e.to_string())?;

    let menu = Menu::with_items(app, &[&open, &toggle_mini, &quit]).map_err(|e| e.to_string())?;

    TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("MeuxCompanion")
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "open" => window::show_main_window(app),
                "toggle_mini" => { let _ = window::window_toggle_mini(app.clone()); },
                "quit" => { app.exit(0); },
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                window::show_main_window(tray.app_handle());
            }
        })
        .build(app)
        .map_err(|e| e.to_string())?;

    Ok(())
}
```

- [ ] **Step 3: Wire up window management and tray in lib.rs**

Update `src-tauri/src/lib.rs` setup closure and invoke_handler:

```rust
        .setup(|app| {
            let data_dir = app.path().app_data_dir()
                .expect("Failed to get app data directory");
            std::fs::create_dir_all(&data_dir).expect("Failed to create data directory");

            let state = AppState {
                config: ConfigManager::new(&data_dir),
                characters: CharacterLoader::new(&data_dir),
                sessions: SessionStore::new(&data_dir),
                states: StateStore::new(&data_dir),
                memories: MemoryStore::new(&data_dir),
                expressions: ExpressionManager::new(&data_dir),
                llm: OpenAiCompatClient::new(),
            };

            app.manage(Arc::new(state));

            // Setup system tray
            tray::setup_tray(app.handle()).expect("Failed to setup tray");

            // Setup global hotkey
            use tauri_plugin_global_shortcut::ShortcutState;
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_shortcut("CmdOrCtrl+Shift+M")?
                    .with_handler(|app, _shortcut, event| {
                        if event.state == ShortcutState::Pressed {
                            window::cycle_window_state(app);
                        }
                    })
                    .build(),
            )?;

            Ok(())
        })
```

Add window commands to invoke_handler:
```rust
            window::window_toggle_mini,
            window::window_expand,
```

- [ ] **Step 4: Update tauri.conf.json for tray and window labels**

Update the windows array:
```json
    "windows": [
      {
        "label": "main",
        "title": "MeuxCompanion",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "trayIcon": {
      "iconPath": "icons/32x32.png",
      "iconAsTemplate": true
    }
```

- [ ] **Step 5: Verify compilation**

Run: `cd meuxcompanion-desktop && cargo check -p meuxcompanion-desktop`
Expected: Compiles

- [ ] **Step 6: Commit**

```bash
git add src-tauri/
git commit -m "feat: add window management with main/mini modes, system tray, and global hotkey"
```

---

## Task 15: Frontend — Tauri API Layer

**Files:**
- Create: `src/api/tauri.ts`

- [ ] **Step 1: Write the Tauri API layer**

```typescript
// src/api/tauri.ts
import { invoke } from "@tauri-apps/api/core";

// Config
export async function getConfig() {
  return invoke("config_get");
}

export async function saveConfig(config: any) {
  return invoke("config_save", { config });
}

export async function testLlm(provider: { base_url: string; api_key: string; model: string }) {
  return invoke<string>("config_test_llm", { provider });
}

// Characters
export async function listCharacters() {
  return invoke<any[]>("characters_list");
}

export async function getCharacter(id: string) {
  return invoke<any>("characters_get", { id });
}

export async function createCharacter(data: {
  name: string;
  personality: string;
  modelId: string;
  voice: string;
  userName: string;
  userAbout: string;
}) {
  return invoke<string>("characters_create", {
    name: data.name,
    personality: data.personality,
    model_id: data.modelId,
    voice: data.voice,
    user_name: data.userName,
    user_about: data.userAbout,
  });
}

// Chat
export async function sendChat(characterId: string, message: string) {
  return invoke("chat_send", { characterId, message });
}

export async function getChatHistory(characterId: string) {
  return invoke<any[]>("chat_history", { characterId });
}

export async function clearChat(characterId: string) {
  return invoke("chat_clear", { characterId });
}

// Memory
export async function getMemory(characterId: string) {
  return invoke<any[]>("memory_get", { characterId });
}

export async function searchMemory(characterId: string, query: string) {
  return invoke<any[]>("memory_search", { characterId, query });
}

export async function clearMemory(characterId: string) {
  return invoke("memory_clear", { characterId });
}

// State
export async function getState(characterId: string) {
  return invoke<any>("state_get", { characterId });
}

// Expressions
export async function getExpressions(modelId: string) {
  return invoke<Record<string, string>>("expressions_get", { modelId });
}

export async function saveExpressions(modelId: string, mapping: Record<string, string>) {
  return invoke("expressions_save", { modelId, mapping });
}

// TTS
export async function getVoices(provider: string) {
  return invoke<{ id: string; name: string }[]>("tts_voices", { provider });
}

// Window
export async function toggleMiniMode() {
  return invoke("window_toggle_mini");
}

export async function expandWindow() {
  return invoke("window_expand");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/
git commit -m "feat: add Tauri API layer replacing fetch-based endpoints"
```

---

## Task 16: Frontend — useChat Hook Rewrite

**Files:**
- Create: `src/hooks/useChat.ts`

- [ ] **Step 1: Write useChat hook using Tauri events**

```typescript
// src/hooks/useChat.ts
import { useState, useRef, useCallback } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { sendChat } from "../api/tauri";

interface Message {
  role: "user" | "assistant";
  content: string;
  expression?: string;
}

interface SentencePayload {
  index: number;
  text: string;
  expression: string;
}

interface AudioPayload {
  index: number;
  data: number[];
}

interface DonePayload {
  state_update: any;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const onSentenceRef = useRef<((data: SentencePayload) => void) | null>(null);
  const onAudioRef = useRef<((index: number, data: number[]) => void) | null>(null);
  const onDoneRef = useRef<((data: DonePayload) => void) | null>(null);
  const unlistenersRef = useRef<UnlistenFn[]>([]);

  const cleanExpressionTags = (text: string) =>
    text.replace(/<<\/?[^>]*>>\s*/g, "").replace(/\[expression:\s*[^\]]+\]\s*/g, "");

  const send = useCallback(async (characterId: string, message: string) => {
    if (isStreaming) return;

    // Add user message immediately
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setStreamingText("");
    setIsStreaming(true);

    let displayText = "";
    let lastExpression = "neutral";

    // Clean up previous listeners
    for (const unlisten of unlistenersRef.current) {
      unlisten();
    }
    unlistenersRef.current = [];

    // Subscribe to events
    const unlistenText = await listen<{ text: string }>("chat:text-chunk", (event) => {
      displayText += event.payload.text;
      setStreamingText(cleanExpressionTags(displayText));
    });

    const unlistenSentence = await listen<SentencePayload>("chat:sentence", (event) => {
      lastExpression = event.payload.expression;
      onSentenceRef.current?.(event.payload);
    });

    const unlistenAudio = await listen<AudioPayload>("chat:audio", (event) => {
      onAudioRef.current?.(event.payload.index, event.payload.data);
    });

    const unlistenDone = await listen<DonePayload>("chat:done", (event) => {
      const finalText = cleanExpressionTags(displayText);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: finalText, expression: lastExpression },
      ]);
      setStreamingText("");
      setIsStreaming(false);
      onDoneRef.current?.(event.payload);

      // Clean up listeners
      for (const unlisten of unlistenersRef.current) {
        unlisten();
      }
      unlistenersRef.current = [];
    });

    const unlistenError = await listen<{ message: string }>("chat:error", (event) => {
      console.error("Chat error:", event.payload.message);
      setIsStreaming(false);
      for (const unlisten of unlistenersRef.current) {
        unlisten();
      }
      unlistenersRef.current = [];
    });

    unlistenersRef.current = [unlistenText, unlistenSentence, unlistenAudio, unlistenDone, unlistenError];

    // Send the message
    await sendChat(characterId, message);
  }, [isStreaming]);

  const setOnSentence = useCallback((cb: (data: SentencePayload) => void) => {
    onSentenceRef.current = cb;
  }, []);

  const setOnAudio = useCallback((cb: (index: number, data: number[]) => void) => {
    onAudioRef.current = cb;
  }, []);

  const setOnDone = useCallback((cb: (data: DonePayload) => void) => {
    onDoneRef.current = cb;
  }, []);

  return {
    messages,
    setMessages,
    streamingText,
    isStreaming,
    send,
    setOnSentence,
    setOnAudio,
    setOnDone,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useChat.ts
git commit -m "feat: rewrite useChat hook for Tauri event-based streaming"
```

---

## Task 17: Frontend — Window Hooks & Mini Widget

**Files:**
- Create: `src/hooks/useWindow.ts`
- Create: `src/components/MiniWidget.tsx`

- [ ] **Step 1: Write useWindow hook**

```typescript
// src/hooks/useWindow.ts
import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { toggleMiniMode, expandWindow } from "../api/tauri";

export function useWindow() {
  const [isMiniMode, setIsMiniMode] = useState(false);

  useEffect(() => {
    // Detect if we're in mini mode from URL
    const params = new URLSearchParams(window.location.search);
    setIsMiniMode(params.get("mode") === "mini");
  }, []);

  const toggleMini = useCallback(async () => {
    await toggleMiniMode();
  }, []);

  const expand = useCallback(async () => {
    await expandWindow();
  }, []);

  return { isMiniMode, toggleMini, expand };
}
```

- [ ] **Step 2: Write MiniWidget component**

```tsx
// src/components/MiniWidget.tsx
import { useWindow } from "../hooks/useWindow";

interface MiniWidgetProps {
  avatarComponent: React.ReactNode;
}

export function MiniWidget({ avatarComponent }: MiniWidgetProps) {
  const { expand } = useWindow();

  return (
    <div
      onClick={expand}
      style={{
        width: "100vw",
        height: "100vh",
        cursor: "pointer",
        background: "transparent",
        overflow: "hidden",
      }}
      data-tauri-drag-region
    >
      {avatarComponent}
    </div>
  );
}
```

- [ ] **Step 3: Update App.tsx to route between main and mini mode**

```tsx
// src/App.tsx
import { useWindow } from "./hooks/useWindow";
import { MiniWidget } from "./components/MiniWidget";

function App() {
  const { isMiniMode } = useWindow();

  if (isMiniMode) {
    return (
      <MiniWidget
        avatarComponent={<div>Avatar placeholder</div>}
      />
    );
  }

  return (
    <div>
      <h1>MeuxCompanion Desktop</h1>
      <p>Main app view — port existing components here</p>
    </div>
  );
}

export default App;
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useWindow.ts src/components/MiniWidget.tsx src/App.tsx
git commit -m "feat: add window management hooks and mini widget component"
```

---

## Task 18: CI/CD — GitHub Actions Release Workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write the release workflow**

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - "v*"
  workflow_dispatch:

jobs:
  release:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-latest
            args: "--target aarch64-apple-darwin"
          - platform: macos-latest
            args: "--target x86_64-apple-darwin"
          - platform: ubuntu-22.04
            args: ""
          - platform: windows-latest
            args: ""
    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies (Ubuntu)
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

      - uses: actions/setup-node@v4
        with:
          node-version: lts/*

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}

      - uses: swatinem/rust-cache@v2

      - name: Install frontend dependencies
        run: npm install

      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: v__VERSION__
          releaseName: "MeuxCompanion v__VERSION__"
          releaseBody: "See the assets to download this version and install."
          releaseDraft: true
          prerelease: false
          args: ${{ matrix.args }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/
git commit -m "feat: add GitHub Actions release workflow for cross-platform builds"
```

---

## Task 19: Port Existing Frontend Components

**Files:**
- Copy and adapt from `../frontend/src/` to `src/`
- Modify imports to use `../api/tauri` instead of fetch calls

- [ ] **Step 1: Copy component files from the web app**

Copy the following from the existing web app's `frontend/src/` to the desktop app's `src/`:
- `components/ChatPanel.tsx`
- `components/Live2DCanvas.tsx`
- `components/VRMCanvas.tsx`
- `components/Onboarding.tsx`
- `components/Settings.tsx`
- `components/MemoryStatePanel.tsx`
- `components/CharacterSelect.tsx`
- `hooks/useAudioQueue.ts`
- `hooks/useLive2D.ts`
- `hooks/useVRM.ts`
- `hooks/useVoice.ts`
- `hooks/useAudioAnalyser.ts`
- CSS/Tailwind files

Run: `cp -r ../frontend/src/components/*.tsx src/components/ && cp -r ../frontend/src/hooks/useAudio*.ts ../frontend/src/hooks/useLive2D.ts ../frontend/src/hooks/useVRM.ts ../frontend/src/hooks/useVoice.ts src/hooks/`

- [ ] **Step 2: Replace fetch calls with Tauri API imports**

In each copied component, find all `fetch("/api/...")` calls and replace with the corresponding function from `src/api/tauri.ts`.

Key replacements:
- `fetch("/api/config")` → `import { getConfig } from "../api/tauri"; await getConfig()`
- `fetch("/api/characters")` → `import { listCharacters } from "../api/tauri"; await listCharacters()`
- `fetch("/api/chat/stream", ...)` → Handled by `useChat` hook (already rewritten)
- `fetch("/api/memory/...")` → `import { getMemory } from "../api/tauri"; await getMemory(id)`
- `fetch("/api/state/...")` → `import { getState } from "../api/tauri"; await getState(id)`
- `fetch("/api/expressions/...")` → `import { getExpressions } from "../api/tauri"; await getExpressions(id)`
- `fetch("/api/tts")` → TTS is now handled backend-side via chat events
- `fetch("/api/voices/...")` → `import { getVoices } from "../api/tauri"; await getVoices(provider)`

- [ ] **Step 3: Update useAudioQueue to accept Uint8Array from Tauri events**

The existing hook receives base64 audio from SSE. In Tauri, it receives raw bytes as `number[]`. Update the audio decoding:

```typescript
// In useAudioQueue.ts, replace base64 decoding with direct byte array handling:
// Old: const audioBlob = base64ToBlob(audioData);
// New:
const audioBlob = new Blob([new Uint8Array(audioData)], { type: "audio/mp3" });
```

- [ ] **Step 4: Update App.tsx to wire everything together**

```tsx
// src/App.tsx
import { useWindow } from "./hooks/useWindow";
import { MiniWidget } from "./components/MiniWidget";
// Import all existing components as they are ported

function App() {
  const { isMiniMode, toggleMini } = useWindow();

  if (isMiniMode) {
    return (
      <MiniWidget
        avatarComponent={<div>Avatar canvas here</div>}
      />
    );
  }

  // Main app — same structure as existing web app
  // Wire up: ChatPanel, Live2DCanvas/VRMCanvas, Settings, Onboarding, etc.
  // Use useChat hook for chat, existing hooks for avatar/audio

  return (
    <div className="flex h-screen">
      {/* Port the existing App.tsx layout here, replacing API calls */}
      <div className="flex-1">Main App - Port existing layout</div>
      <button onClick={toggleMini}>Mini Mode</button>
    </div>
  );
}

export default App;
```

- [ ] **Step 5: Verify the frontend builds**

Run: `cd meuxcompanion-desktop && npm run build`
Expected: Vite build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat: port existing React components with Tauri API integration"
```

---

## Task 20: Integration Test — Full App Launch

- [ ] **Step 1: Run the full app in dev mode**

Run: `cd meuxcompanion-desktop && npm run tauri dev`
Expected: App window opens, shows the main view

- [ ] **Step 2: Verify Rust backend compiles and runs**

Check the terminal output for any Rust compilation errors. The app should:
- Create the app data directory
- Set up system tray
- Register global hotkey

- [ ] **Step 3: Test basic flow**

Manual checks:
1. App opens main window
2. System tray icon appears
3. Global hotkey (Cmd+Shift+M / Ctrl+Shift+M) cycles window states
4. Onboarding flow works (if no config.json exists)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: MeuxCompanion Desktop v0.1.0 — full Tauri v2 app with Rust backend"
```
