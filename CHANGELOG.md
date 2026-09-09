# Changelog

All notable changes to Meuxe are documented here.

The GitHub Release workflow uses the version in `package.json` / `src-tauri/tauri.conf.json` and the matching `## [version]` section below as the release title and notes. Write that section before tagging.

## [Unreleased]

## [0.1.3] - 2026-09-09

### Added
- Settings → Agent now lists the models advertised by the selected ACP agent. Choose a model or use the agent default; saved selections are applied before chat starts.

### Fixed
- Tool auto-approval is now opt-in and grants permission for one request at a time instead of persisting approval for the session.
- Chat handles duplicate sends, event-listener setup races, timeouts, errors, and cancellation more reliably, and clears active speech when a response is cancelled or fails.
- Development asset middleware rejects parent-directory traversal and symlinks that escape the allowed asset root.

### Changed
- Companion-session and global-shortcut logic now live in dedicated hooks, and memory deduplication and mood rules have separate modules.
- Character and model IPC types are generated from Rust and checked for drift.
- Added coverage for ACP session lifecycle, permission handling, model discovery and selection, and frontend streaming chat.

### Known limits
- macOS builds are not signed or notarized. After dragging the app to Applications, run `xattr -c /Applications/Meuxe.app`.
- Intel Macs and Windows are not built for this release.
- Chat requires a separately installed ACP agent (OpenCode, Claude Code, Codex, or custom). Model selection depends on the models that agent exposes through ACP.

### Build improvements
- Release CI restores a shared Rust compile cache from `main` (weekly cache-warm job) instead of rebuilding whisper.cpp from scratch on every tag, and only packages the bundles each OS needs.

## [0.1.2] - 2026-09-08

Patch for the 0.1.1 macOS and Linux prerelease.

### Fixed
- Live2D (Haru) in the packaged app: PixiJS now uses `@pixi/unsafe-eval` so shader compilation works under Tauri CSP without allowing `'unsafe-eval'`.
- Marketplace look cards: Arweave thumbnail redirects to `*.arweave.net` gateways are allowed in `img-src`, so preview images load in the packaged app.

### Known limits
- macOS builds are not signed or notarized. After dragging the app to Applications, run `xattr -c /Applications/Meuxe.app`.
- Intel Macs and Windows are not built for this release.
- Chat requires a separately installed ACP agent (OpenCode, Claude Code, Codex, or custom).

## [0.1.1] - 2026-09-08

First public **macOS and Linux** prerelease.

### Added
- Bundled default avatars (Haru Live2D, Utsuwa VRM) and expression maps in the app package, seeded into app data on first launch.
- Local Figtree and JetBrains Mono fonts, and Cubism Core fetched at build time so the packaged app does not load CDNs.
- On-device Whisper download (~75 MB) from Hugging Face on first microphone use, with progress in Settings → Voice.
- Chat, microphone, and missing-assistant errors shown in the UI.
- Main-stage “say hello” empty state and a one-time mini-widget hover hint.
- Agent lookup on Homebrew, nvm, fnm, Volta, pnpm, and Bun paths so Dock-launched macOS builds can find CLIs.
- In-app auto-updates from GitHub Releases (Settings → Privacy & data, or the launch banner). See `docs/UPDATES.md`.
- `THIRD_PARTY_NOTICES.md` and Haru’s Live2D Free Material License file.

### Changed
- Default voice is **Meuxe TTS** (free, no API key). System speech on this computer, ElevenLabs, and OpenAI remain optional.
- Onboarding cannot finish until an assistant is actually ready. Tool permissions stay in Settings.
- Release workflow builds macOS (Apple Silicon) and Linux only; drafts are marked prerelease.
- `config.json` is written owner-only (`0600`) on macOS and Linux.
- Linux `.deb` declares WebKitGTK 4.1 and AppIndicator runtime depends. macOS minimum version is 11.0.

### Fixed
- Production asset resolution uses the resource directory, so avatars work outside `tauri dev`.
- System tray setup no longer aborts startup when an indicator host is missing.
- Privacy copy lists the assistant, Meuxe TTS, optional studio voices, and the one-time Whisper download.

### Known limits
- macOS builds are not signed or notarized. After dragging the app to Applications, run `xattr -c /Applications/Meuxe.app`.
- Intel Macs and Windows are not built for this release.
- Chat requires a separately installed ACP agent (OpenCode, Claude Code, Codex, or custom).
