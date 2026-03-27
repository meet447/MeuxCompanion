# MeuxCompanion

A self-hosted AI companion web app with anime-style Live2D and VRM characters. Talk with your companion via text or voice — they respond with expressive facial animations, lip-synced speech, and per-sentence emotional reactions.

> **Rework of [MeuxVtuber](https://github.com/meuxtw/MeuxVtuber)** — evolved from a YouTube chat VTuber bot into a full interactive companion experience.

## Features

- **Live2D & VRM model support** — use 2D (Live2D Cubism) or 3D (VRM) anime characters
- **Per-sentence expression changes** — character changes facial expression with each sentence, not just once per response
- **Audio-driven lip sync** — mouth movement follows actual speech audio via Web Audio API frequency analysis
- **Streaming responses** — text appears word-by-word as the LLM generates, TTS runs in parallel per sentence
- **Idle animations** — breathing, blinking, eye saccades, body sway, random pose shifts
- **Voice input** — speak via microphone using Web Speech API
- **Idle chatter** — character greets you on load and initiates conversation if you're quiet
- **Typing awareness** — character tilts head curiously when you're typing
- **Customizable backgrounds** — preset gradients or custom colors
- **Expression mapping UI** — configure which model expressions map to which emotions
- **Any OpenAI-compatible LLM** — works with Nectara, OpenAI, Groq, Ollama, OpenRouter, etc.
- **Zero cost** — uses free TTS (TikTok TTS API) and supports free LLM providers

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- An API key for any OpenAI-compatible LLM provider

### Setup

```bash
# Clone the repo
git clone https://github.com/meuxtw/MeuxVtuber.git
cd MeuxVtuber

# Set up Python environment
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt

# Set up frontend
cd frontend
npm install
npm run build
cd ..

# Configure your LLM
cp .env.example .env
# Edit .env with your API key
```

### Run

```bash
python main_app.py
# Open http://localhost:8000
```

### Development Mode

```bash
# Terminal 1: Backend
python main_app.py

# Terminal 2: Frontend (hot reload)
cd frontend && npm run dev
# Open http://localhost:5173
```

## Configuration

### `.env`

```env
LLM_BASE_URL=https://api-nectara.chipling.xyz/v1
LLM_API_KEY=your_api_key_here
LLM_MODEL=openai/gpt-oss-20b
```

Works with any OpenAI-compatible API — just change `LLM_BASE_URL` and `LLM_API_KEY`:

| Provider | Base URL |
|----------|----------|
| OpenAI | `https://api.openai.com/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| Ollama (local) | `http://localhost:11434/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Nectara (free) | `https://api-nectara.chipling.xyz/v1` |

### Characters

Characters are defined as `.md` files in `characters/`:

```markdown
---
name: Rika
live2d_model: haru
voice: jp_001
---

## Personality
A tsundere anime girl who loves anime but won't admit it...

## Speech Style
- Uses "b-baka!" when embarrassed
- Energetic and dramatic
```

### Adding Models

**Live2D models** — drop the model folder into `models/live2d/`:
```
models/live2d/my_model/
  model.model3.json
  model.moc3
  textures/
  expressions/
```

**VRM models** — drop `.vrm` files into `models/vrm/`:
```
models/vrm/my_model/
  character.vrm
  animations/        # Optional Mixamo FBX files
    idle.fbx
    talking.fbx
```

### Expression Mapping

Click **Settings** in the app header to open the expression mapping panel:
1. Preview each model expression by clicking it
2. Map global emotions (happy, sad, angry...) to model expressions
3. Save — the LLM will use these mappings automatically

## Architecture

```
Browser                              FastAPI Server
┌─────────────────────┐              ┌──────────────────┐
│  Live2D / VRM Canvas│              │  /api/chat/stream│
│  (PixiJS / Three.js)│◄── SSE ────►│  ├─ LLM (stream) │
│                     │              │  ├─ Sentence split│
│  Chat Panel         │              │  └─ TTS (parallel)│
│  Audio Queue        │              │                  │
│  Expression System  │              │  /api/expressions│
└─────────────────────┘              └──────────────────┘
```

**Per-sentence reactive pipeline:**
1. LLM streams tokens with inline `<<expression>>` tags
2. Backend splits on expression boundaries in real-time
3. Each sentence gets its own TTS thread (parallel generation)
4. Audio events are sent via SSE as soon as each TTS completes
5. Frontend queues audio and plays sequentially, switching expressions at each boundary

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Live2D | pixi-live2d-display + PixiJS |
| VRM/3D | Three.js + @pixiv/three-vrm |
| Backend | FastAPI (Python) |
| LLM | OpenAI SDK (any compatible provider) |
| TTS | TikTok TTS API (free) |
| STT | Web Speech API (browser) |
| Storage | Local `.md` and `.json` files |

## Project Structure

```
MeuxCompanion/
├── main_app.py              # FastAPI entry point
├── requirements.txt
├── .env.example             # Environment template
│
├── backend/
│   ├── api/                 # API endpoints
│   │   ├── chat.py          # Streaming chat with per-sentence TTS
│   │   ├── tts.py           # Text-to-speech
│   │   ├── characters.py    # Character CRUD
│   │   └── expressions.py   # Expression mapping
│   ├── services/            # Business logic
│   │   ├── llm.py           # LLM client (OpenAI SDK)
│   │   ├── tts.py           # TikTok TTS with connection pooling
│   │   ├── character.py     # Character loading with caching
│   │   └── expressions.py   # Expression mapping system
│   └── utils/
│       └── emotion.py       # Expression tag parsing
│
├── frontend/src/
│   ├── App.tsx
│   ├── components/
│   │   ├── Live2DCanvas.tsx  # Live2D renderer
│   │   ├── VRMCanvas.tsx     # VRM 3D renderer
│   │   ├── ChatPanel.tsx     # Chat interface
│   │   ├── ModelSettings.tsx # Expression mapping UI
│   │   ├── CharacterSelect.tsx
│   │   └── MicButton.tsx
│   ├── hooks/
│   │   ├── useChat.ts        # Streaming chat with SSE
│   │   ├── useAudioQueue.ts  # Per-sentence audio playback
│   │   ├── useLive2D.ts      # Live2D animations
│   │   ├── useVRM.ts         # VRM animations + FBX loading
│   │   ├── useVoice.ts       # Voice input/output
│   │   └── useAudioAnalyser.ts # Audio frequency analysis
│   └── utils/
│       └── mixamoRigMap.ts   # Mixamo→VRM bone mapping
│
├── characters/               # Character definitions (.md)
├── models/
│   ├── live2d/              # Live2D models
│   ├── vrm/                 # VRM models
│   └── expression_mappings/ # User expression configs
└── docs/
    └── specs/               # Design specs
```

## License

MIT
