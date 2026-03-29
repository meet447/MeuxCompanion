# MeuxCompanion

A local-first AI companion desktop app with Live2D and VRM avatars, layered character writing, persistent memory, and evolving relationship state.

> **Desktop Port** — This application has been ported from a web app to a standalone desktop application using **Tauri 2**.

![MeuxCompanion Demo](assets/demo.png)

## What It Does

MeuxCompanion is a native desktop application that lets you talk to an anime-style companion through text or voice. It features a high-performance Rust backend for:

- **Layered character identity** — written as `.yaml` and `.md` files
- **Session history** — local persistence of chats
- **Local long-term memory** — semantic, episodic, and reflection memories
- **Persistent relationship state** — trust, affection, mood, and energy
- **Expression-aware streaming** — parse LLM output for emotion tags in real-time
- **Parallel TTS generation** — high-speed speech synthesis per sentence

## Quick Start

### Prerequisites

- **Node.js 18+**
- **Rust (Cargo) 1.75+**

### Install & Run

```bash
git clone https://github.com/meuxtw/MeuxVtuber.git
cd MeuxVtuber

# Install frontend dependencies
npm install

# Run the desktop app in development mode
npm run tauri dev
```

## Features

### Companion Core
- **Layered Characters**: companions are modularly written (`soul.md`, `style.md`, `rules.md`, etc.)
- **Local Memory**: Semantic and episodic memories stored as local JSONL files.
- **Relationship State**: Trust and affection evolve over time based on your interactions.

### Interaction
- **Streaming Chat**: Real-time text streaming.
- **Per-sentence Expressions**: Live parsing of `<<expression>>` tags for avatar reaction.
- **Parallel TTS**: Synthesizes speech segments in parallel for minimal latency.
- **Voice Input**: Integrated microphone support.

### Avatar System
- **Live2D**: Support for Cubism models with lip sync and expression mapping.
- **VRM**: Support for 3D avatars with custom animations.
- **Mini-Mode**: Toggle a transparent "Mini Widget" that floats on your desktop.

## Development

The project is structured as a Tauri monorepo:

- `src/`: React frontend (Vite)
- `src-tauri/`: Tauri Rust core and command handlers
- `crates/meux-core/`: Shared Rust logic for LLM, TTS, and memory

```bash
# Start development server
npm run tauri dev
```

## Providers

### LLM
Uses the OpenAI SDK protocol against any compatible endpoint (OpenAI, Groq, Ollama, OpenRouter, etc.).

### TTS
Supports multiple providers including:
- **TikTok TTS**: Local-friendly, no API key required.
- **ElevenLabs**: High-quality neural voices.
- **OpenAI TTS**: Native OpenAI voice support.

## Project Structure

```text
MeuxCompanion/
├── src/                # React / Vite Frontend
├── src-tauri/          # Tauri Rust App
├── crates/             # Shared Rust logic
│   └── meux-core/      # Core logic (LLM, Memory, State)
├── characters/         # Local companion profiles
├── models/             # Live2D and VRM models
└── data/               # Persistent session and memory data
```

## License

MIT
