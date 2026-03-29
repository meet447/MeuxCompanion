# MeuxCompanion Desktop — Design Spec

**Date:** 2026-03-29
**Status:** Approved
**Scope:** Full Rust rewrite of MeuxCompanion as a Tauri v2 desktop application

## Overview

Rewrite MeuxCompanion as a native desktop app using Tauri v2 with a pure Rust backend, eliminating the Python dependency entirely. The app ships as a single binary (~15-25MB) across macOS, Windows, and Linux. The existing React frontend is adapted to communicate via Tauri's IPC instead of HTTP/SSE.

## Architecture

### Workspace Layout

```
meuxcompanion-desktop/
├── crates/
│   └── meux-core/          # Pure Rust library — all business logic
│       ├── Cargo.toml
│       └── src/
├── src-tauri/               # Tauri app crate — thin command layer
│   ├── Cargo.toml
│   └── src/
├── src/                     # React frontend (adapted from web app)
├── package.json
├── vite.config.ts
├── Cargo.toml               # Workspace root
└── tauri.conf.json
```

### Layer Responsibilities

**meux-core (library crate):**
- All business logic in pure Rust, no Tauri dependency
- Independently testable and reusable (CLI, mobile)
- Modules: llm, tts, memory, character, state, session, prompt, config

**src-tauri (app crate):**
- Thin shell: Tauri commands that call into meux-core
- Window management (main + floating widget)
- System tray, global hotkeys, auto-launch
- No business logic

**src/ (React frontend):**
- Existing components adapted for Tauri IPC
- New API layer replacing fetch/SSE with invoke/events
- New window management hooks

## meux-core Module Structure

```
crates/meux-core/src/
├── lib.rs
├── error.rs                 # MeuxError enum, Result alias
├── llm/
│   ├── mod.rs               # LlmClient trait
│   ├── openai_compat.rs     # reqwest + SSE parsing
│   └── types.rs             # ChatMessage, StreamChunk, provider config
├── tts/
│   ├── mod.rs               # TtsClient trait
│   ├── tiktok.rs
│   ├── elevenlabs.rs
│   └── openai.rs
├── memory/
│   ├── mod.rs               # MemoryEngine
│   ├── extractor.rs         # Heuristic pattern extraction
│   ├── retriever.rs         # Token overlap + tag matching
│   └── store.rs             # JSONL read/write
├── character/
│   ├── mod.rs               # CharacterLoader
│   ├── types.rs             # Character, Soul, Style, Rules
│   └── expressions.rs       # Emotion → expression mapping
├── state/
│   ├── mod.rs               # StateStore
│   └── types.rs             # RelationshipState
├── session/
│   ├── mod.rs               # SessionStore
│   └── types.rs             # SessionMessage, history trimming
├── prompt/
│   └── mod.rs               # PromptBuilder
└── config/
    ├── mod.rs               # ConfigManager
    └── types.rs             # AppConfig, LlmProvider, TtsProvider
```

### Key Traits

```rust
// LLM streaming
trait LlmClient {
    async fn stream_chat(&self, messages: Vec<ChatMessage>, config: &LlmConfig)
        -> impl Stream<Item = Result<StreamChunk>>;
}

// TTS synthesis
trait TtsClient {
    async fn synthesize(&self, text: &str, voice: &str) -> Result<Vec<u8>>;
}

// Memory engine
trait MemoryEngine {
    fn extract(&self, messages: &[SessionMessage]) -> Vec<Memory>;
    fn retrieve(&self, query: &str, memories: &[Memory]) -> Vec<Memory>;
}
```

### Dependencies

- `reqwest` — HTTP client + SSE streaming
- `tokio` — Async runtime
- `serde` + `serde_json` + `serde_yaml` — Serialization
- `pulldown-cmark` — Markdown parsing for character files

## Communication Model

### Chat Streaming (replaces HTTP SSE)

Frontend calls `invoke("chat_send", { characterId, message })` which returns immediately. The Rust backend streams results via Tauri events:

| Event | Payload | Purpose |
|---|---|---|
| `chat:text-chunk` | `{ text: string }` | Partial text from LLM stream |
| `chat:sentence` | `{ index: number, text: string, expression: string }` | Complete sentence with emotion tag |
| `chat:audio` | `{ index: number, data: number[] }` | TTS audio bytes for a sentence |
| `chat:done` | `{ stateUpdate: RelationshipState }` | Stream complete |
| `chat:error` | `{ message: string }` | Error during streaming |

### CRUD Operations (replaces REST)

| Operation | Tauri Command |
|---|---|
| Get config | `invoke("config_get")` |
| Save config | `invoke("config_save", { config })` |
| List characters | `invoke("characters_list")` |
| Get character | `invoke("characters_get", { id })` |
| Create character | `invoke("characters_create", { data })` |
| Get memory | `invoke("memory_get", { characterId })` |
| Search memory | `invoke("memory_search", { characterId, query })` |
| Clear memory | `invoke("memory_clear", { characterId })` |
| Get state | `invoke("state_get", { characterId })` |
| Get expressions | `invoke("expressions_get", { modelId })` |
| Save expression mapping | `invoke("expressions_save", { modelId, mapping })` |
| Get chat history | `invoke("chat_history", { characterId })` |
| Clear chat history | `invoke("chat_clear", { characterId })` |
| Test LLM connection | `invoke("config_test_llm", { provider })` |
| List TTS voices | `invoke("tts_voices", { provider })` |

### TTS Pipeline

TTS generation runs in parallel tokio tasks. When meux-core parses a complete sentence from the LLM stream, it spawns a task to synthesize audio while continuing to process the text stream. Audio events are emitted as each sentence's audio becomes ready. The frontend's audio queue handles playback sequencing.

## Window Management

### Main Window

- Full app UI: chat panel, avatar canvas (Live2D/VRM), settings, onboarding, memory panel
- Standard resizable window with native decorations
- Minimize/close sends to system tray (app stays alive)

### Mini Floating Widget

- Small borderless, always-on-top window
- Shows only the avatar (Live2D or VRM) on transparent background
- Toggle from main window via button or global hotkey
- Click widget → expands to main window
- Draggable, remembers position between sessions
- Expression changes and idle animations remain active

### System Tray

- Persistent tray icon with context menu: Open, Toggle Mini Mode, Settings, Quit
- Left-click opens main window
- App remains running when all windows closed

### Global Hotkey

- Configurable shortcut (default: `Cmd+Shift+M` / `Ctrl+Shift+M`)
- Cycles: hidden → mini widget → main window → hidden

### Platform Notes

- Mini widget transparent background: macOS supports natively, Windows requires WebView2 transparent flags, Linux support varies by compositor. Tauri v2's `transparent: true` window config handles this per platform — fall back to a dark background if transparency is unavailable.

### Tauri Plugins

- `tauri-plugin-global-shortcut` — global hotkey registration
- `tauri-plugin-autostart` — launch on login
- `tauri-plugin-window-state` — persist window position/size

## Data Storage

### Location

Uses OS-standard app data directories via Tauri's path API:

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/com.meuxcompanion.app/` |
| Windows | `%APPDATA%\MeuxCompanion\` |
| Linux | `~/.local/share/meuxcompanion/` |

### Directory Structure

```
meuxcompanion/
├── config.json
├── characters/
│   └── {id}/
│       ├── character.yaml
│       ├── soul.md
│       ├── style.md
│       ├── rules.md
│       ├── context.md
│       └── examples/
│           └── chat_examples.md
├── data/
│   └── users/{user_id}/
│       ├── sessions/{character_id}.jsonl
│       └── memories/{character_id}/
│           ├── episodic.jsonl
│           ├── semantic.jsonl
│           ├── reflections.jsonl
│           └── state.json
└── models/
    ├── live2d/{model_id}/
    ├── vrm/{model_id}/
    └── expression_mappings/{model_id}.json
```

### Bundled Resources

- Default starter character shipped in Tauri's resource directory
- Copied to app data on first run
- Users add characters and models through the UI or by placing files in the directory

## Frontend Adaptation

### API Layer

New `src/api/tauri.ts` wraps all `invoke()` calls, replacing the current fetch-based API layer.

### Hook Changes

| Hook | Change |
|---|---|
| `useChat.ts` | Rewrite: drop SSE parsing, subscribe to Tauri events. Same state shape. |
| `useAudioQueue.ts` | Minimal: receives audio from Tauri events instead of SSE. Queue logic unchanged. |
| `useLive2D.ts` | No change — WebGL rendering is identical in Tauri's webview. |
| `useVRM.ts` | No change — Three.js rendering is identical. |
| `useVoice.ts` | No change — Web Speech API available in webview. |
| `useAudioAnalyser.ts` | No change — Web Audio API available in webview. |
| `useWindow.ts` | New: toggle main/mini mode, listen for hotkey events. |
| `useTray.ts` | New: react to tray menu actions via Tauri events. |

### Components

All existing components carry over: ChatPanel, Live2DCanvas, VRMCanvas, Onboarding, Settings, MemoryStatePanel, CharacterSelect.

New component: **MiniWidget** — lightweight avatar-only view on transparent background for the floating window.

## Build & Distribution

### Development

```bash
npm run tauri dev
```
- Vite dev server on localhost:1420 with hot reload
- Tauri webview points to dev server
- Rust recompiles on change

### Production

```bash
npm run tauri build
```
- Vite builds React → embedded in binary
- Cargo builds workspace → single native binary

### Platform Outputs

| Platform | Artifacts |
|---|---|
| macOS | `.dmg`, `.app` bundle (arm64 + x86_64) |
| Windows | `.msi`, `.exe` NSIS installer |
| Linux | `.deb`, `.AppImage`, `.rpm` |

### CI/CD

- GitHub Actions with `tauri-apps/tauri-action`
- Matrix build: macOS (arm64, x86_64), Windows (x86_64), Linux (x86_64)
- Auto-generates release artifacts for all platforms
- Tauri updater plugin for auto-updates

### Estimated Binary Size

- Rust backend + Tauri shell: ~10-15MB
- React frontend: ~2-3MB
- Total installer: ~15-25MB (models are user-provided)

## LLM Providers

Same provider support as current web app, all via OpenAI-compatible API:
- OpenAI
- Groq
- OpenRouter
- Ollama (local)
- Nectara
- Custom (user-configurable base URL + API key)

## TTS Providers

- TikTok TTS (default, free, no API key)
- ElevenLabs (requires API key)
- OpenAI TTS (requires API key)

## Memory Engine

Port of current heuristic approach to Rust:
- **Extraction:** Pattern matching ("my name is", "I like", "remember") + token importance scoring
- **Retrieval:** Token overlap with query + tag matching + importance/recency weighting, returns top 4
- **Storage:** JSONL files (episodic, semantic, reflections)
- **Deduplication:** Normalized text comparison

## Relationship State

Same model as current:
- `trust` (0.0–1.0) — grows with positive interactions
- `affection` (0.0–1.0) — emotional closeness
- `mood` — "neutral", "warm", "concerned", etc.
- `energy` (0.0–1.0) — fatigue indicator
- `relationship_summary` — narrative description

Persisted as `state.json` per character. Injected into system prompt by PromptBuilder to influence companion tone.
