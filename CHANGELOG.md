# Changelog

All notable changes to Meuxe are documented here.

The GitHub Release workflow uses the version in `package.json` / `src-tauri/tauri.conf.json` and the matching `## [version]` section below as the release title and notes. Write that section before tagging.

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
- Release workflow builds macOS (arm64 + x64) and Linux only; drafts are marked prerelease.
- `config.json` is written owner-only (`0600`) on macOS and Linux.
- Linux `.deb` declares WebKitGTK 4.1 and AppIndicator runtime depends. macOS minimum version is 11.0.

### Fixed
- Production asset resolution uses the resource directory, so avatars work outside `tauri dev`.
- System tray setup no longer aborts startup when an indicator host is missing.
- Privacy copy lists the assistant, Meuxe TTS, optional studio voices, and the one-time Whisper download.

### Known limits
- macOS builds are unsigned; Gatekeeper needs a right-click Open (or removing quarantine) until signing is added.
- Windows is not built for this release.
- Chat requires a separately installed ACP agent (OpenCode, Claude Code, Codex, or custom).
