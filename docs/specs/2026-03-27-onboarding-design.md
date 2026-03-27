# Onboarding & Config System Design

## Overview

Replace the current `.env`-based configuration with a `config.json` file and add a full-screen onboarding wizard that runs on first launch (or when config is missing/empty). The app is an AI companion app — the onboarding sets up the user's profile, LLM provider, TTS provider, and creates their first companion character.

## config.json

Located at project root (`/config.json`). Single source of truth for all app configuration. Replaces `.env` for LLM and TTS settings.

```json
{
  "user": {
    "name": "Meet",
    "about": "I'm a developer who likes anime and building cool stuff"
  },
  "llm": {
    "provider": "openai",
    "base_url": "https://api.openai.com/v1",
    "api_key": "sk-...",
    "model": "gpt-4o"
  },
  "tts": {
    "provider": "tiktok",
    "api_key": null,
    "voice": "jp_001"
  },
  "active_character": "companion",
  "onboarding_complete": true
}
```

### Field Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user.name` | string | yes | User's display name |
| `user.about` | string | yes | Short self-description, injected into companion prompts |
| `llm.provider` | string | yes | Provider ID from presets or "custom" |
| `llm.base_url` | string | yes | OpenAI-compatible API base URL |
| `llm.api_key` | string | no | API key (null for local providers like Ollama) |
| `llm.model` | string | yes | Model identifier |
| `tts.provider` | string | yes | TTS provider ID |
| `tts.api_key` | string | no | API key if provider requires one |
| `tts.voice` | string | yes | Voice ID for selected provider |
| `active_character` | string | yes | Character ID (filename stem) of active companion |
| `onboarding_complete` | boolean | yes | Gate flag for showing wizard vs main app |

## LLM Provider Presets

| Preset | Base URL | Needs API Key | Default Model |
|--------|----------|---------------|---------------|
| OpenAI | `https://api.openai.com/v1` | yes | `gpt-4o` |
| Groq | `https://api.groq.com/openai/v1` | yes | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | yes | `openai/gpt-4o` |
| Ollama | `http://localhost:11434/v1` | no | `llama3.2` |
| Nectara | `https://api-nectara.chipling.xyz/v1` | yes | `openai/gpt-oss-20b` |
| Custom | user-provided | user-provided | user-provided |

## TTS Provider Presets

| Preset | Needs API Key | Notes |
|--------|---------------|-------|
| TikTok (default) | no | Free, uses existing TikTok TTS service, 38 voices |
| ElevenLabs | yes | High quality, requires subscription |
| OpenAI TTS | yes | Uses OpenAI API key if already configured |

TikTok is pre-selected and works out of the box with no configuration.

## Onboarding Wizard

Full-screen wizard, 4 steps with next/back navigation. Replaces the entire app UI until completed. Progress indicator at the top showing current step.

### Step 1: About You

- Heading: "Let's set up your AI companion"
- Fields:
  - **Name** — text input, required
  - **About yourself** — textarea, required, placeholder: "Tell your companion a bit about yourself — your interests, what you do, what you enjoy talking about..."
- Validation: Both fields non-empty

### Step 2: LLM Provider

- Heading: "Connect your AI brain"
- Fields:
  - **Provider** — preset selector (card-style or dropdown), selecting auto-fills base URL
  - **API Key** — password input, hidden when Ollama selected
  - **Model** — text input, pre-filled with preset default, editable
  - **Base URL** — shown but read-only for presets, editable for Custom
- **Test Connection** button — calls `POST /api/config/test-llm` with the entered creds, shows success/error inline
- Validation: Test must pass before proceeding

### Step 3: Voice & TTS

- Heading: "Choose a voice"
- Fields:
  - **TTS Provider** — selector, TikTok pre-selected
  - **API Key** — shown only if provider requires one
  - **Voice** — dropdown populated from `GET /api/voices` for the selected provider
  - **Play Sample** button — plays a short TTS sample with selected voice
- Validation: Voice must be selected

### Step 4: Your Companion

- Heading: "Create your companion"
- Fields:
  - **Companion Name** — text input, required
  - **Personality** — textarea, placeholder: "Describe your companion's personality... e.g., cheerful and energetic, calm and wise, playful and sarcastic"
  - **Vibe** — optional quick-pick chips: Cheerful, Chill, Tsundere, Gothic, Mysterious, Sassy, Wise, Energetic (selecting a chip populates the personality textarea with a template)
  - **Model** — Display: "Using default model (haru)" with info text: "To use a custom model, place it in the models/live2d/ or models/vrm/ directory and it will appear here"
  - If custom models detected in directories, show a dropdown to pick between haru and the custom ones
- Validation: Name and personality non-empty

### Completion

- Writes `config.json` via `POST /api/config`
- Generates companion `.md` file via `POST /api/characters/create`
- Shows brief success screen: "You're all set! Meet [companion name]"
- Transitions to main app

## Generated Character .md Template

When onboarding completes, a character markdown file is created at `characters/{companion_id}.md`:

```markdown
---
name: {companion_name}
live2d_model: {selected_model_id}
voice: {selected_voice}
default_emotion: neutral
---

## Personality
You are {companion_name}. {personality_description}

## User Context
Your companion user's name is {user_name}. They describe themselves as: "{user_about}". Use their name naturally in conversation and relate to their interests when appropriate. You are their personal AI companion.

## Speech Style
{generated_based_on_vibe_or_personality}
```

### Dynamic User Info Injection

`build_system_prompt()` in `character.py` already appends the full markdown body to the system prompt. The user info is baked directly into the `.md` file during creation — no runtime template resolution needed. If the user updates their info in settings, the `.md` files that reference user context should be regenerated or the user context section updated.

## Backend Changes

### New Endpoints

**`GET /api/config`**
- Returns config with API keys masked (e.g., `sk-...abc`)
- Returns `{ onboarding_complete: false }` if file missing or empty

**`POST /api/config`**
- Accepts full config object, writes to `config.json`
- Validates required fields

**`POST /api/config/test-llm`**
- Request: `{ base_url, api_key, model }`
- Sends a minimal chat completion request to validate connection
- Returns: `{ success: boolean, error?: string }`

**`POST /api/characters/create`**
- Request: `{ name, personality, vibe?, model_id, voice, user_name, user_about }`
- Generates the `.md` file from template
- Returns: `{ id: string }` (the filename stem)

**`GET /api/tts/voices/{provider}`**
- Returns available voices for a given TTS provider

### Modified Services

**`llm.py`**
- Read `base_url`, `api_key`, `model` from `config.json` instead of `.env`
- Reload config on each request (or cache with file mtime check like characters)

**`tts.py`**
- Read `provider`, `api_key`, `voice` from `config.json`
- Route to correct TTS service based on provider
- Keep TikTok as default implementation, add service abstraction for others

**`character.py` — `build_system_prompt()`**
- No changes needed — user context is already in the `.md` body
- If user updates their profile in settings, provide a utility to update the "User Context" section in existing character files

## Frontend Changes

### New Components

**`Onboarding.tsx`**
- Full-screen wizard container
- Manages step state (1-4), form data, navigation
- Each step is a sub-component or section within the wizard
- Submits everything on final step completion

**`Settings.tsx`**
- Full settings page (not a wizard)
- Sections: User Profile, LLM Provider, TTS, Companions
- Companions section: list existing, create new, edit, delete
- Same fields as onboarding but in editable form layout

### Modified Components

**`App.tsx`**
- On mount: `GET /api/config` to check `onboarding_complete`
- If false or missing: render `<Onboarding />` instead of main app
- On onboarding complete: reload config, render main app
- Add navigation to Settings page (gear icon or menu)

## File Structure

```
New files:
  frontend/src/components/Onboarding.tsx
  frontend/src/components/Settings.tsx
  config.json (generated at runtime)

Modified files:
  frontend/src/App.tsx
  backend/api/characters.py (new create endpoint)
  backend/services/llm.py (read from config.json)
  backend/services/tts.py (read from config.json, provider abstraction)
  main_app.py (mount new config routes)

New backend files:
  backend/api/config.py (config endpoints)
```
