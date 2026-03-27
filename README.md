# MeuxCompanion

A local-first AI companion app with Live2D and VRM avatars, layered character writing, persistent memory, evolving relationship state, and a backend designed to support multiple clients.

> **Rework of [MeuxVtuber](https://github.com/meuxtw/MeuxVtuber)** — shifted from a stream bot into a reusable companion backend with a richer frontend shell.

![MeuxCompanion Demo](assets/demo.png)

## What It Does

MeuxCompanion lets you talk to an anime-style companion through text or voice while the backend manages:

- layered character identity
- session history
- local long-term memory
- persistent relationship state
- expression-aware response streaming
- TTS playback with per-sentence emotion changes

The frontend is one client for that backend, not the entire product surface.

## Features

### Companion Core

- **Layered characters** — companions are written as `character.yaml` + `soul.md` + `style.md` + `rules.md` + `context.md` + examples
- **Local long-term memory** — the backend stores semantic, episodic, and reflection memories in local files
- **Persistent relationship state** — trust, affection, mood, and energy evolve over time and influence responses
- **Client-agnostic backend** — memory, state, and character logic live on the server side so future desktop/mobile/web clients can share the same core

### Interaction

- **Streaming chat** — text streams in as the LLM generates
- **Per-sentence expressions** — emotion tags are parsed live and applied sentence by sentence
- **Parallel TTS generation** — each sentence can synthesize in parallel while the response is still streaming
- **Voice input** — microphone input via Web Speech API
- **Idle chatter** — the companion greets the user and can initiate conversation when the app is quiet
- **Typing awareness** — model behavior reacts while the user is typing

### Avatar System

- **Live2D support** — Cubism model loading with expression mapping and lip sync
- **VRM support** — 3D avatars with optional animation support
- **Expression mapping UI** — assign frontend model expressions to backend emotion names visually
- **Viewport controls** — zoom, framing, fullscreen, and background customization

### Setup and Authoring

- **Guided onboarding** — first-run setup now creates a layered companion profile instead of only a flat prompt
- **In-app settings** — configure providers, voices, expression mappings, memory inspection, and state controls
- **No bundled default companions required** — fresh clones can onboard into a clean local character folder

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+

### Install

```bash
git clone https://github.com/meuxtw/MeuxVtuber.git
cd MeuxVtuber

python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cd frontend
npm install
npm run build
cd ..
```

### Run

```bash
python main_app.py
```

Then open [http://localhost:8000](http://localhost:8000).

## First Launch

On a fresh clone, the intended path is:

1. open the app
2. complete onboarding
3. configure your LLM and TTS
4. generate your first layered companion

Onboarding now collects:

- your user profile
- LLM provider and model
- TTS provider and voice
- companion name
- core vibe
- relationship dynamic
- speech style
- a layered personality draft you can edit before creation

The generated character is written locally into `characters/` and the runtime state is stored locally under `data/`.

## Development

```bash
# Terminal 1
python main_app.py

# Terminal 2
cd frontend
npm run dev
```

Frontend dev server runs on [http://localhost:5173](http://localhost:5173).

## Providers

### LLM

The backend uses the OpenAI Python SDK against any OpenAI-compatible endpoint.

Supported presets in-app:

| Provider | Base URL | API Key |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | Required |
| Groq | `https://api.groq.com/openai/v1` | Required |
| OpenRouter | `https://openrouter.ai/api/v1` | Required |
| Ollama | `http://localhost:11434/v1` | Not required |
| Nectara | `https://api-nectara.chipling.xyz/v1` | Required |
| Custom | Any OpenAI-compatible endpoint | Varies |

### TTS

Supported presets in-app:

| Provider | API Key | Notes |
|---|---|---|
| TikTok TTS | Not required | Default local-friendly option |
| ElevenLabs | Required | High quality cloud voices |
| OpenAI TTS | Required | OpenAI voice models |

## Character System

Characters are now folder-based and layered.

Example structure:

```text
characters/
  my_companion/
    character.yaml
    soul.md
    style.md
    rules.md
    context.md
    examples/
      chat_examples.md
```

### Character Layers

- `character.yaml` — id, model, voice, default emotion
- `soul.md` — stable identity and emotional core
- `style.md` — speech style and verbal texture
- `rules.md` — behavior constraints and tone boundaries
- `context.md` — user-specific orientation and relational intent
- `examples/chat_examples.md` — example conversational flavor

Legacy `characters/*.md` files are still supported by the loader for backward compatibility, but onboarding and new character creation now use the layered format.

## Local Memory And State

The backend persists runtime data locally in files.

Example layout:

```text
data/
  users/
    default-user/
      sessions/
        my_companion.jsonl
      memories/
        my_companion/
          episodic.jsonl
          semantic.jsonl
          reflections.jsonl
          state.json
          summary.md
```

### What is stored

- **session history** — recent conversation turns per character
- **semantic memory** — user facts and durable preferences
- **episodic memory** — notable conversation events
- **reflection memory** — lightweight relationship observations
- **state** — trust, affection, mood, energy, relationship summary

### Current retrieval model

The current memory system is intentionally lightweight and local-first:

- heuristic memory extraction after each exchange
- retrieval by token overlap, tags, importance, and recency
- relevant memory injection back into the system prompt

This is a practical first step before embeddings or heavier retrieval systems.

## Frontend Support For Memory

The frontend now exposes the new backend systems through Settings:

- inspect stored memories
- search memory
- inspect persistent relationship state
- reset state
- clear long-term memories
- clear session conversation history

Chat history is also restored from the backend when switching characters or reloading the app.

## Expression Pipeline

The response pipeline is still built around inline expression tagging:

1. the LLM streams response text
2. backend parses `<<expression>>` tags
3. response is split into expression-boundary segments
4. each segment can synthesize TTS in parallel
5. SSE events stream text, sentence events, and audio back to the frontend
6. frontend queues playback and switches avatar expressions as audio progresses

## Adding Models

### Live2D

Drop a Live2D model folder into:

```text
models/live2d/my_model/
```

Expected files typically include:

```text
model.model3.json
model.moc3
textures/
expressions/
```

### VRM

Drop VRM files into:

```text
models/vrm/my_model/
  avatar.vrm
  animations/   # optional
```

## Expression Mapping

Expression mapping is configured in-app:

1. open `Settings > Expression Mapping`
2. preview available model expressions
3. assign backend emotion names to model-specific expressions
4. save

Until a model is mapped, the app will prompt the user to configure expressions before chatting.

## Architecture

```text
Frontend Client                          FastAPI Backend
┌─────────────────────────┐              ┌──────────────────────────┐
│ React / Vite UI         │              │ /api/chat/stream         │
│ ├─ ChatPanel            │◄── SSE ────►│ ├─ prompt assembly       │
│ ├─ Live2D / VRM canvas  │              │ ├─ memory retrieval      │
│ ├─ Onboarding           │              │ ├─ state prompt injection│
│ ├─ Settings             │              │ ├─ LLM stream            │
│ └─ Memory & State UI    │              │ └─ TTS per sentence      │
└─────────────────────────┘              │                          │
                                         │ /api/memory              │
                                         │ /api/state               │
                                         │ /api/config              │
                                         │ /api/characters          │
                                         └──────────────────────────┘
```

### Backend responsibilities

- character loading
- prompt assembly
- session persistence
- memory extraction and retrieval
- relationship state updates
- TTS orchestration
- expression resolution

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Live2D | pixi-live2d-display + PixiJS |
| VRM | Three.js + `@pixiv/three-vrm` |
| Backend | FastAPI |
| LLM client | OpenAI SDK against compatible APIs |
| TTS | TikTok TTS / ElevenLabs / OpenAI TTS |
| Voice input | Web Speech API |
| Storage | Local files: `.json`, `.jsonl`, `.md`, `.yaml` |

## Project Structure

```text
MeuxCompanion/
├── main_app.py
├── requirements.txt
├── config.json                  # auto-managed runtime config (local)
├── README.md
├── docs/
│   └── backend-character-memory-architecture.md
├── characters/                  # local onboarding-generated companions
├── data/                        # local session/memory/state data
├── models/
│   ├── live2d/
│   ├── vrm/
│   └── expression_mappings/
│
├── backend/
│   ├── api/
│   │   ├── chat.py
│   │   ├── characters.py
│   │   ├── config.py
│   │   ├── expressions.py
│   │   ├── memory.py
│   │   └── tts.py
│   ├── services/
│   │   ├── character.py
│   │   ├── config.py
│   │   ├── expressions.py
│   │   ├── llm.py
│   │   ├── memory_engine.py
│   │   ├── memory_store.py
│   │   ├── session_store.py
│   │   ├── state_store.py
│   │   └── tts.py
│   └── utils/
│       └── emotion.py
│
├── frontend/
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── index.css
│       ├── components/
│       │   ├── CharacterSelect.tsx
│       │   ├── ChatPanel.tsx
│       │   ├── Live2DCanvas.tsx
│       │   ├── MemoryStatePanel.tsx
│       │   ├── ModelSettings.tsx
│       │   ├── Onboarding.tsx
│       │   ├── Settings.tsx
│       │   └── VRMCanvas.tsx
│       ├── hooks/
│       │   ├── useAudioQueue.ts
│       │   ├── useChat.ts
│       │   ├── useLive2D.ts
│       │   ├── useVoice.ts
│       │   └── useVRM.ts
│       └── types/
```

## API Reference

### Core

| Endpoint | Method | Description |
|---|---|---|
| `/api/chat/stream` | POST | Stream LLM text, sentence events, and TTS audio |
| `/api/chat/history/{character_id}` | GET | Load persisted chat history for a character |
| `/api/chat/clear` | POST | Clear session history for one character or all |

### Config

| Endpoint | Method | Description |
|---|---|---|
| `/api/config` | GET/POST | Read or update app config |
| `/api/config/presets` | GET | List built-in LLM and TTS presets |
| `/api/config/configured` | GET | Show which providers are configured |
| `/api/config/switch-llm` | POST | Switch active LLM provider |
| `/api/config/switch-tts` | POST | Switch active TTS provider |
| `/api/config/test-llm` | POST | Test provider connectivity |

### Characters

| Endpoint | Method | Description |
|---|---|---|
| `/api/characters` | GET | List available characters |
| `/api/characters/{character_id}` | GET | Get one character |
| `/api/characters/create` | POST | Create a new layered character |
| `/api/models` | GET | List available Live2D and VRM models |

### Memory And State

| Endpoint | Method | Description |
|---|---|---|
| `/api/memory/{character_id}` | GET | Inspect state and stored memories |
| `/api/memory/{character_id}/search` | GET | Search relevant memories |
| `/api/memory/{character_id}/clear` | POST | Clear long-term memories and optionally reset state |
| `/api/state/{character_id}` | GET | Read persistent relationship state |
| `/api/state/{character_id}` | POST | Update relationship state manually |
| `/api/state/{character_id}/reset` | POST | Reset relationship state |

### Expressions And Voice

| Endpoint | Method | Description |
|---|---|---|
| `/api/voices/{provider}` | GET | List voices for a TTS provider |
| `/api/tts` | POST | Generate speech audio |
| `/api/expressions/mapping` | GET/POST | Read or save expression mappings |
| `/api/expressions/configured/{model}` | GET | Check whether a model is mapped |

## Notes

- `characters/` and `data/` are local-first runtime folders.
- Fresh clones are expected to use onboarding to create the first companion.
- If you want to inspect the current architecture direction, see [docs/backend-character-memory-architecture.md](docs/backend-character-memory-architecture.md).

## License

MIT
