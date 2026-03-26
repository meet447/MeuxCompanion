# MeuxCompanion — Design Spec

**Date:** 2026-03-27
**Status:** Draft

## Overview

MeuxCompanion is a self-hosted web app where users talk with customizable anime companions. Characters are Live2D models with facial expressions and lip sync, powered by free LLM and TTS APIs. Users interact via text or voice in a real-time conversational experience.

**Evolved from:** MeuxVtuber (AI-powered YouTube VTuber that reads live chat and responds with TTS).

## Architecture

Monolith FastAPI + React SPA. Single process — `python main.py` starts FastAPI which serves the built React frontend on `localhost:8000` and exposes API endpoints. In dev mode, React runs separately on port 3000 with a proxy to FastAPI.

```
┌─────────────────────────────────────────────┐
│                  Browser                     │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │  Chat UI     │  │  Live2D Canvas       │  │
│  │  (React)     │  │  (pixi-live2d-display│  │
│  │  - text input│  │   + PixiJS)          │  │
│  │  - mic btn   │  │  - expressions       │  │
│  │  - history   │  │  - lip sync          │  │
│  └──────┬───────┘  └──────────┬───────────┘  │
│         │                     │              │
│         └────────┬────────────┘              │
│                  │ REST API                  │
└──────────────────┼───────────────────────────┘
                   │
┌──────────────────┼───────────────────────────┐
│           FastAPI Server                      │
│  ┌───────────────┴──────────────────────┐    │
│  │  /api/chat    - LLM response + emotion│    │
│  │  /api/tts     - generate speech audio │    │
│  │  /api/char    - list characters       │    │
│  │  /api/models  - list Live2D models    │    │
│  └───────────────┬──────────────────────┘    │
│         ┌────────┼────────┐                  │
│    ┌────┴───┐ ┌──┴──┐ ┌──┴──────┐           │
│    │Nectara │ │TTS  │ │Local .md│           │
│    │  LLM   │ │API  │ │ Storage │           │
│    └────────┘ └─────┘ └─────────┘           │
└──────────────────────────────────────────────┘
```

## Character System

Each character is a `.md` file in `characters/` with YAML frontmatter:

```markdown
---
name: Rika
live2d_model: rika_model
voice: jp_001
default_emotion: neutral
---

## Personality
Tsundere anime girl who pretends to not like the user but secretly cares.

## Backstory
A high school student from Tokyo who loves anime but won't admit it...

## Speech Style
- Uses "b-baka!" when embarrassed
- Dramatic and energetic
- Short sentences when flustered
```

- `live2d_model` maps to a folder name inside `models/live2d/`
- `voice` maps to a TTS voice ID
- Users create/edit `.md` files directly or through an in-app editor
- The full `.md` content is injected as the LLM system prompt

**Live2D model discovery:** Backend scans `models/live2d/` for `.model3.json` files.

```
models/live2d/
  rika_model/
    rika.model3.json
    rika.moc3
    textures/
    motions/
    expressions/
```

## Chat & LLM Flow

1. User sends message (text or voice-transcribed)
2. `POST /api/chat` receives it
3. Backend loads the character `.md` as system prompt
4. Sends to Nectara API (`nectara.vercel.app`) with system prompt + chat history + user message
5. LLM responds with emotion tag: `[emotion: excited] Oh wow, you really think so?`
6. Backend parses emotion tag and clean text
7. Returns `{ "text": "...", "emotion": "excited" }`

**System prompt template:**
```
You are {name}. Stay in character at all times.
Every response must start with an emotion tag in this format: [emotion: <emotion>]
Valid emotions: neutral, happy, sad, angry, surprised, embarrassed, thinking, excited

{full .md content}
```

**Chat history:**
- In-memory during the session (Python list)
- Persisted to `chats/<character_name>/<timestamp>.md` for cross-session continuity

**Emotion mapping:**
- Valid: `neutral`, `happy`, `sad`, `angry`, `surprised`, `embarrassed`, `thinking`, `excited`
- Maps directly to Live2D expression files
- Unrecognized emotions fall back to `neutral`

## Voice I/O & TTS

**Voice input (STT):**
- Browser Web Speech API (`SpeechRecognition`)
- No backend needed — transcription in browser
- Mic button toggles listening on/off
- Transcribed text sent to `/api/chat` like normal text

**Voice output (TTS):**
- TikTok TTS API (same as MeuxVtuber)
- Text chunking for messages over 300 chars
- Returns base64-encoded MP3 in the chat response
- Frontend plays via `<audio>` element

**Lip sync:**
- Random mouth open/close toggling on the Live2D model while audio plays
- Toggle interval: ~100-150ms
- Stops when audio ends

**Response flow:**
- `/api/chat` returns text + emotion only: `{ "text": "...", "emotion": "embarrassed" }`
- Frontend then calls `/api/tts` with the text to get audio separately
- This keeps chat fast (text appears immediately) and TTS non-blocking

**TTS response format:**
```json
{
  "audio": "base64-encoded-mp3-data..."
}
```

## Frontend UI

Split-screen layout:

```
┌──────────────────────────────────────────┐
│  MeuxCompanion          [Settings] [Char]│
├────────────────────┬─────────────────────┤
│                    │                     │
│    Live2D Canvas   │    Chat Panel       │
│                    │                     │
│   ┌────────────┐   │  ┌───────────────┐  │
│   │            │   │  │ Char: hello!  │  │
│   │   Anime    │   │  │               │  │
│   │ Character  │   │  │ You: hey!     │  │
│   │            │   │  │               │  │
│   │            │   │  │ Char: baka!   │  │
│   └────────────┘   │  └───────────────┘  │
│                    │                     │
│                    │  ┌───────────┐ ┌──┐ │
│                    │  │ Type here │ │🎤│ │
│                    │  └───────────┘ └──┘ │
└────────────────────┴─────────────────────┘
```

**Components:**
- **Live2D Canvas** — left side, PixiJS + pixi-live2d-display
- **Chat Panel** — right side, scrollable message history + text input + mic button
- **Character Selector** — top-right drawer to pick from available characters
- **Settings** — TTS voice selection, volume control

**Tech:** React + Vite + Tailwind CSS. Single page, no routing.

## Project Structure

```
MeuxCompanion/
├── main.py                    # FastAPI entry point, serves built frontend
├── requirements.txt           # Python dependencies
│
├── backend/
│   ├── api/
│   │   ├── chat.py            # POST /api/chat
│   │   └── tts.py             # POST /api/tts
│   ├── services/
│   │   ├── llm.py             # Nectara API client
│   │   ├── tts.py             # TikTok TTS logic
│   │   └── character.py       # Load/list characters from .md files
│   └── utils/
│       └── emotion.py         # Parse emotion tags from LLM response
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── components/
│       │   ├── Live2DCanvas.tsx
│       │   ├── ChatPanel.tsx
│       │   ├── MicButton.tsx
│       │   └── CharacterSelect.tsx
│       ├── hooks/
│       │   ├── useChat.ts
│       │   ├── useLive2D.ts
│       │   └── useVoice.ts
│       └── types/
│           └── index.ts
│
├── characters/
│   ├── rika.md
│   └── ...
│
├── models/
│   └── live2d/
│       └── rika_model/
│
└── chats/
```

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Live2D | pixi-live2d-display + PixiJS |
| Backend | FastAPI (Python) |
| LLM | Nectara API (free) |
| TTS | TikTok TTS API (free) |
| STT | Web Speech API (browser-native) |
| Storage | Local `.md` files |
| Deployment | Fully local, clone and run |

## Key Constraints

- Zero cost — all APIs are free
- No database — local file storage only
- No auth — self-hosted, single user
- No cloud — fully local deployment
- Live2D models provided in-repo or user-dropped into `models/live2d/`
