# Onboarding & Config System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `.env`-based config with `config.json`, add a full-screen onboarding wizard on first launch, and enable dynamic companion creation.

**Architecture:** Backend gets a new config service that reads/writes `config.json` and exposes it via REST endpoints. `llm.py` and `tts.py` are updated to read from config instead of env vars. Frontend gets an `Onboarding.tsx` wizard that gates the main app until setup is complete, plus a `Settings.tsx` page for post-onboarding edits.

**Tech Stack:** FastAPI + Pydantic (backend), React + TypeScript + Tailwind (frontend), OpenAI SDK (LLM), existing TikTok TTS + ElevenLabs/OpenAI TTS abstractions.

---

## File Structure

```
New files:
  backend/services/config.py          — Config read/write/validate, provider presets
  backend/api/config.py               — REST endpoints for config + LLM test
  frontend/src/components/Onboarding.tsx — Full-screen 4-step wizard
  frontend/src/components/Settings.tsx   — Post-onboarding settings page

Modified files:
  main_app.py                          — Mount config router
  backend/services/llm.py              — Read from config.json instead of .env
  backend/services/tts.py              — Read provider/voice from config.json, add provider abstraction
  backend/api/tts.py                   — Add voices-by-provider endpoint
  backend/api/characters.py            — Add character creation endpoint
  backend/services/character.py        — Add create_character() function
  frontend/src/App.tsx                 — Gate on onboarding_complete, add settings navigation
```

---

### Task 1: Config Service (backend/services/config.py)

**Files:**
- Create: `backend/services/config.py`

- [ ] **Step 1: Create config service with read/write/presets**

```python
import json
from pathlib import Path
from typing import Optional

CONFIG_PATH = Path(__file__).parent.parent.parent / "config.json"

LLM_PRESETS = {
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "needs_key": True,
        "default_model": "gpt-4o",
    },
    "groq": {
        "name": "Groq",
        "base_url": "https://api.groq.com/openai/v1",
        "needs_key": True,
        "default_model": "llama-3.3-70b-versatile",
    },
    "openrouter": {
        "name": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "needs_key": True,
        "default_model": "openai/gpt-4o",
    },
    "ollama": {
        "name": "Ollama",
        "base_url": "http://localhost:11434/v1",
        "needs_key": False,
        "default_model": "llama3.2",
    },
    "nectara": {
        "name": "Nectara",
        "base_url": "https://api-nectara.chipling.xyz/v1",
        "needs_key": True,
        "default_model": "openai/gpt-oss-20b",
    },
    "custom": {
        "name": "Custom",
        "base_url": "",
        "needs_key": True,
        "default_model": "",
    },
}

TTS_PRESETS = {
    "tiktok": {
        "name": "TikTok TTS",
        "needs_key": False,
    },
    "elevenlabs": {
        "name": "ElevenLabs",
        "needs_key": True,
    },
    "openai_tts": {
        "name": "OpenAI TTS",
        "needs_key": True,
    },
}

DEFAULT_CONFIG = {
    "user": {"name": "", "about": ""},
    "llm": {"provider": "", "base_url": "", "api_key": None, "model": ""},
    "tts": {"provider": "tiktok", "api_key": None, "voice": "jp_001"},
    "active_character": "",
    "onboarding_complete": False,
}


def load_config() -> dict:
    """Load config from disk. Returns default if file missing or invalid."""
    if not CONFIG_PATH.exists():
        return {**DEFAULT_CONFIG}
    try:
        data = json.loads(CONFIG_PATH.read_text())
        # Merge with defaults so new fields are always present
        merged = {**DEFAULT_CONFIG}
        for key in DEFAULT_CONFIG:
            if key in data:
                if isinstance(DEFAULT_CONFIG[key], dict) and isinstance(data[key], dict):
                    merged[key] = {**DEFAULT_CONFIG[key], **data[key]}
                else:
                    merged[key] = data[key]
        return merged
    except (json.JSONDecodeError, OSError):
        return {**DEFAULT_CONFIG}


def save_config(config: dict) -> None:
    """Write config to disk."""
    CONFIG_PATH.write_text(json.dumps(config, indent=2))


def mask_config(config: dict) -> dict:
    """Return config with API keys masked for frontend consumption."""
    masked = json.loads(json.dumps(config))  # deep copy
    for section in ("llm", "tts"):
        key = masked.get(section, {}).get("api_key")
        if key and isinstance(key, str) and len(key) > 8:
            masked[section]["api_key"] = key[:4] + "..." + key[-4:]
        elif key:
            masked[section]["api_key"] = "***"
    return masked
```

- [ ] **Step 2: Commit**

```bash
git add backend/services/config.py
git commit -m "feat: add config service with read/write/presets"
```

---

### Task 2: Config API Endpoints (backend/api/config.py)

**Files:**
- Create: `backend/api/config.py`
- Modify: `main_app.py:11-30`

- [ ] **Step 1: Create config API router**

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from openai import OpenAI

from backend.services.config import (
    load_config, save_config, mask_config,
    LLM_PRESETS, TTS_PRESETS,
)

router = APIRouter()


class ConfigUpdate(BaseModel):
    user: Optional[dict] = None
    llm: Optional[dict] = None
    tts: Optional[dict] = None
    active_character: Optional[str] = None
    onboarding_complete: Optional[bool] = None


class TestLLMRequest(BaseModel):
    base_url: str
    api_key: Optional[str] = None
    model: str


@router.get("/api/config")
def get_config():
    config = load_config()
    return mask_config(config)


@router.post("/api/config")
def update_config(body: ConfigUpdate):
    config = load_config()
    update = body.model_dump(exclude_none=True)
    for key, value in update.items():
        if isinstance(value, dict) and isinstance(config.get(key), dict):
            config[key] = {**config[key], **value}
        else:
            config[key] = value
    save_config(config)
    return {"ok": True}


@router.get("/api/config/presets")
def get_presets():
    return {"llm": LLM_PRESETS, "tts": TTS_PRESETS}


@router.post("/api/config/test-llm")
def test_llm(body: TestLLMRequest):
    try:
        client = OpenAI(
            base_url=body.base_url,
            api_key=body.api_key or "not-needed",
        )
        response = client.chat.completions.create(
            model=body.model,
            messages=[{"role": "user", "content": "Say hi in one word."}],
            max_tokens=10,
            timeout=15,
        )
        text = response.choices[0].message.content or ""
        return {"success": True, "message": text.strip()}
    except Exception as e:
        return {"success": False, "error": str(e)}
```

- [ ] **Step 2: Mount config router in main_app.py**

Add to `main_app.py` after the existing router imports (line 14):

```python
from backend.api.config import router as config_router
```

Add after line 30 (after expressions_router):

```python
app.include_router(config_router)
```

- [ ] **Step 3: Commit**

```bash
git add backend/api/config.py main_app.py
git commit -m "feat: add config API endpoints with LLM test"
```

---

### Task 3: Update LLM Service to Read from config.json

**Files:**
- Modify: `backend/services/llm.py`

- [ ] **Step 1: Rewrite llm.py to use config.json**

Replace the entire file content:

```python
from typing import Generator
from openai import OpenAI

from backend.services.config import load_config

_cached_client: OpenAI | None = None
_cached_key: str = ""


def _get_client() -> tuple[OpenAI, str]:
    """Get or create an OpenAI client from config.json."""
    global _cached_client, _cached_key

    config = load_config()
    llm = config.get("llm", {})
    base_url = llm.get("base_url", "")
    api_key = llm.get("api_key") or "not-needed"
    cache_key = f"{base_url}|{api_key}"

    if _cached_client and _cached_key == cache_key:
        return _cached_client, llm.get("model", "")

    _cached_client = OpenAI(base_url=base_url, api_key=api_key)
    _cached_key = cache_key
    return _cached_client, llm.get("model", "")


def chat(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> str:
    """Send a non-streaming chat completion request."""
    client, default_model = _get_client()
    response = client.chat.completions.create(
        model=model or default_model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=False,
    )
    return response.choices[0].message.content or ""


def chat_stream(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> Generator[str, None, None]:
    """Send a streaming chat completion request, yielding text chunks."""
    client, default_model = _get_client()
    stream = client.chat.completions.create(
        model=model or default_model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True,
    )

    for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content
```

- [ ] **Step 2: Commit**

```bash
git add backend/services/llm.py
git commit -m "feat: update LLM service to read from config.json"
```

---

### Task 4: Update TTS Service with Provider Abstraction

**Files:**
- Modify: `backend/services/tts.py`
- Modify: `backend/api/tts.py`

- [ ] **Step 1: Add provider abstraction to tts.py**

Add these imports and functions at the top of `tts.py`, after the existing imports (line 6):

```python
from backend.services.config import load_config
```

Add the following functions at the end of the file (after `list_voices()`):

```python
# ========================================
# PROVIDER ABSTRACTION
# ========================================

ELEVENLABS_VOICES = {
    "21m00Tcm4TlvDq8ikWAM": "Rachel",
    "AZnzlk1XvdvUeBnXmlld": "Domi",
    "EXAVITQu4vr4xnSDxMaL": "Bella",
    "ErXwobaYiN019PkySvjV": "Antoni",
    "MF3mGyEYCl7XYWbV9V6O": "Elli",
    "TxGEqnHWrfWFTfGW9XjX": "Josh",
    "VR6AewLTigWG4xSOukaG": "Arnold",
    "pNInz6obpgDQGcFmaJgB": "Adam",
}

OPENAI_TTS_VOICES = {
    "alloy": "Alloy",
    "echo": "Echo",
    "fable": "Fable",
    "onyx": "Onyx",
    "nova": "Nova",
    "shimmer": "Shimmer",
}


def _generate_elevenlabs(text: str, voice: str, api_key: str) -> Optional[str]:
    """Generate TTS via ElevenLabs API."""
    try:
        resp = _session.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
            json={"text": text, "model_id": "eleven_monolingual_v1"},
            timeout=15,
        )
        if resp.status_code == 200:
            return base64.b64encode(resp.content).decode("utf-8")
    except requests.RequestException:
        pass
    return None


def _generate_openai_tts(text: str, voice: str, api_key: str) -> Optional[str]:
    """Generate TTS via OpenAI TTS API."""
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        response = client.audio.speech.create(
            model="tts-1",
            voice=voice,
            input=text,
        )
        return base64.b64encode(response.content).decode("utf-8")
    except Exception:
        return None


def generate_tts_auto(text: str) -> Optional[str]:
    """Generate TTS using the provider configured in config.json."""
    config = load_config()
    tts_config = config.get("tts", {})
    provider = tts_config.get("provider", "tiktok")
    voice = tts_config.get("voice", "jp_001")
    api_key = tts_config.get("api_key")

    if provider == "elevenlabs" and api_key:
        return _generate_elevenlabs(text, voice, api_key)
    elif provider == "openai_tts" and api_key:
        return _generate_openai_tts(text, voice, api_key)
    else:
        return generate_tts(text, voice)


def list_voices_for_provider(provider: str) -> list[dict]:
    """Return voice list for a given TTS provider."""
    if provider == "elevenlabs":
        return [{"id": k, "name": v} for k, v in ELEVENLABS_VOICES.items()]
    elif provider == "openai_tts":
        return [{"id": k, "name": v} for k, v in OPENAI_TTS_VOICES.items()]
    else:
        return list_voices()
```

- [ ] **Step 2: Add voices-by-provider endpoint to backend/api/tts.py**

Add after the existing `get_voices()` endpoint (line 29):

```python
@router.get("/api/voices/{provider}")
def get_voices_for_provider(provider: str):
    from backend.services.tts import list_voices_for_provider
    return list_voices_for_provider(provider)
```

- [ ] **Step 3: Update chat.py to use generate_tts_auto instead of generate_tts**

In `backend/api/chat.py`, find the import of `generate_tts` and add `generate_tts_auto`:

```python
from backend.services.tts import generate_tts, generate_tts_auto
```

Then replace the call to `generate_tts(sentence_text, voice)` with `generate_tts_auto(sentence_text)`. The voice is now read from config inside `generate_tts_auto`. Search for the `generate_tts` call in the TTS thread function and update it.

- [ ] **Step 4: Commit**

```bash
git add backend/services/tts.py backend/api/tts.py backend/api/chat.py
git commit -m "feat: add TTS provider abstraction with ElevenLabs and OpenAI TTS support"
```

---

### Task 5: Character Creation Endpoint

**Files:**
- Modify: `backend/services/character.py`
- Modify: `backend/api/characters.py`

- [ ] **Step 1: Add create_character function to character.py**

Add at the end of the file (before any class definitions or after the last function):

```python
VIBE_TEMPLATES = {
    "cheerful": "Bright, upbeat, and always looking on the sunny side. Uses exclamation marks freely and loves to encourage.",
    "chill": "Laid-back and easygoing. Speaks casually, never rushes, and keeps things mellow.",
    "tsundere": "Acts tough and dismissive but secretly cares deeply. Gets flustered by compliments and says 'b-baka!' when embarrassed.",
    "gothic": "Elegant, mysterious, and a touch dramatic. Speaks with poetic flair and dark humor.",
    "mysterious": "Enigmatic and thoughtful. Gives cryptic answers sometimes, always seems to know more than they let on.",
    "sassy": "Quick-witted with sharp comebacks. Playful teasing is their love language.",
    "wise": "Calm, thoughtful, and insightful. Speaks with purpose and offers gentle guidance.",
    "energetic": "Bursting with energy and enthusiasm. Talks fast, gets excited easily, and loves adventures.",
}


def create_character(
    name: str,
    personality: str,
    model_id: str,
    voice: str,
    user_name: str,
    user_about: str,
    vibe: str | None = None,
) -> str:
    """Create a new character .md file. Returns the character ID (filename stem)."""
    # Generate a safe filename from the character name
    char_id = name.lower().replace(" ", "_")
    char_id = "".join(c for c in char_id if c.isalnum() or c == "_")

    # Build speech style from vibe
    speech_style = ""
    if vibe and vibe.lower() in VIBE_TEMPLATES:
        speech_style = VIBE_TEMPLATES[vibe.lower()]
    else:
        speech_style = "Speak naturally and expressively, matching your personality."

    content = f"""---
name: {name}
live2d_model: {model_id}
voice: {voice}
default_emotion: neutral
---

## Personality
You are {name}. {personality}

## User Context
Your companion user's name is {user_name}. They describe themselves as: "{user_about}". Use their name naturally in conversation and relate to their interests when appropriate. You are their personal AI companion.

## Speech Style
{speech_style}
"""

    chars_dir = Path(__file__).parent.parent.parent / "characters"
    chars_dir.mkdir(exist_ok=True)
    filepath = chars_dir / f"{char_id}.md"
    filepath.write_text(content.strip() + "\n")

    # Invalidate cache
    if char_id in _cache:
        del _cache[char_id]

    return char_id
```

- [ ] **Step 2: Add create endpoint to backend/api/characters.py**

Add the import and endpoint after existing code:

```python
from pydantic import BaseModel
from typing import Optional

from backend.services.character import list_characters, load_character, list_all_models, create_character


class CreateCharacterRequest(BaseModel):
    name: str
    personality: str
    model_id: str = "haru"
    voice: str = "jp_001"
    user_name: str
    user_about: str
    vibe: Optional[str] = None


@router.post("/api/characters/create")
def create_new_character(body: CreateCharacterRequest):
    char_id = create_character(
        name=body.name,
        personality=body.personality,
        model_id=body.model_id,
        voice=body.voice,
        user_name=body.user_name,
        user_about=body.user_about,
        vibe=body.vibe,
    )
    return {"id": char_id}
```

Also update the existing import line at the top to include `create_character`:

Replace:
```python
from backend.services.character import list_characters, load_character, list_all_models
```
With:
```python
from backend.services.character import list_characters, load_character, list_all_models, create_character
```

And add the missing pydantic import at the top:
```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
```

- [ ] **Step 3: Commit**

```bash
git add backend/services/character.py backend/api/characters.py
git commit -m "feat: add character creation endpoint with vibe templates"
```

---

### Task 6: Onboarding Wizard (frontend/src/components/Onboarding.tsx)

**Files:**
- Create: `frontend/src/components/Onboarding.tsx`

This is the largest task. The wizard has 4 steps + a completion screen. It manages all form state internally and submits everything on completion.

- [ ] **Step 1: Create Onboarding.tsx**

```tsx
import { useState, useEffect, useRef } from "react";

interface LLMPreset {
  name: string;
  base_url: string;
  needs_key: boolean;
  default_model: string;
}

interface TTSPreset {
  name: string;
  needs_key: boolean;
}

interface Voice {
  id: string;
  name: string;
}

interface Model {
  id: string;
  type: string;
  model_file: string;
  path: string;
}

interface FormData {
  user: { name: string; about: string };
  llm: { provider: string; base_url: string; api_key: string; model: string };
  tts: { provider: string; api_key: string; voice: string };
  companion: { name: string; personality: string; vibe: string; model_id: string };
}

const VIBES = ["Cheerful", "Chill", "Tsundere", "Gothic", "Mysterious", "Sassy", "Wise", "Energetic"];

const STEPS = ["About You", "LLM Provider", "Voice & TTS", "Your Companion"];

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [llmPresets, setLlmPresets] = useState<Record<string, LLMPreset>>({});
  const [ttsPresets, setTtsPresets] = useState<Record<string, TTSPreset>>({});
  const [voices, setVoices] = useState<Voice[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [form, setForm] = useState<FormData>({
    user: { name: "", about: "" },
    llm: { provider: "", base_url: "", api_key: "", model: "" },
    tts: { provider: "tiktok", api_key: "", voice: "jp_001" },
    companion: { name: "", personality: "", vibe: "", model_id: "haru" },
  });

  // Load presets and models on mount
  useEffect(() => {
    fetch("/api/config/presets")
      .then((r) => r.json())
      .then((data) => {
        setLlmPresets(data.llm || {});
        setTtsPresets(data.tts || {});
      })
      .catch(console.error);

    fetch("/api/models")
      .then((r) => r.json())
      .then(setModels)
      .catch(console.error);
  }, []);

  // Load voices when TTS provider changes
  useEffect(() => {
    fetch(`/api/voices/${form.tts.provider}`)
      .then((r) => r.json())
      .then((data) => {
        setVoices(data);
        if (data.length > 0 && !data.find((v: Voice) => v.id === form.tts.voice)) {
          updateForm("tts", "voice", data[0].id);
        }
      })
      .catch(console.error);
  }, [form.tts.provider]);

  const updateForm = (section: keyof FormData, field: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  };

  const selectLLMPreset = (presetId: string) => {
    const preset = llmPresets[presetId];
    if (!preset) return;
    setForm((prev) => ({
      ...prev,
      llm: {
        provider: presetId,
        base_url: preset.base_url,
        api_key: prev.llm.api_key,
        model: preset.default_model,
      },
    }));
    setTestResult(null);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/config/test-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_url: form.llm.base_url,
          api_key: form.llm.api_key || null,
          model: form.llm.model,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, error: "Network error" });
    }
    setTesting(false);
  };

  const playSample = async () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello! I'm your new companion.", voice: form.tts.voice }),
      });
      const data = await res.json();
      if (data.audio) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
        audioRef.current = audio;
        audio.play().catch(() => {});
      }
    } catch {
      // Silently fail for sample
    }
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 0:
        return form.user.name.trim() !== "" && form.user.about.trim() !== "";
      case 1:
        return form.llm.provider !== "" && form.llm.model !== "" && testResult?.success === true;
      case 2:
        return form.tts.voice !== "";
      case 3:
        return form.companion.name.trim() !== "" && form.companion.personality.trim() !== "";
      default:
        return false;
    }
  };

  const handleFinish = async () => {
    setSubmitting(true);
    setError("");
    try {
      // 1. Save config
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: form.user,
          llm: {
            provider: form.llm.provider,
            base_url: form.llm.base_url,
            api_key: form.llm.api_key || null,
            model: form.llm.model,
          },
          tts: {
            provider: form.tts.provider,
            api_key: form.tts.api_key || null,
            voice: form.tts.voice,
          },
          onboarding_complete: true,
        }),
      });

      // 2. Create companion character
      const charRes = await fetch("/api/characters/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.companion.name,
          personality: form.companion.personality,
          model_id: form.companion.model_id,
          voice: form.tts.voice,
          user_name: form.user.name,
          user_about: form.user.about,
          vibe: form.companion.vibe || null,
        }),
      });
      const charData = await charRes.json();

      // 3. Set active character
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active_character: charData.id }),
      });

      // Done — transition to step 4 (completion)
      setStep(4);
      setTimeout(onComplete, 2000);
    } catch (e) {
      setError("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  };

  const selectVibe = (vibe: string) => {
    const isSelected = form.companion.vibe === vibe;
    updateForm("companion", "vibe", isSelected ? "" : vibe);
    if (!isSelected) {
      // Only populate personality if it's empty
      if (!form.companion.personality.trim()) {
        const templates: Record<string, string> = {
          Cheerful: "Bright, upbeat, and always encouraging. Loves to make people smile and celebrates every little win.",
          Chill: "Laid-back and easygoing. Never rushes, keeps things mellow, and always has a calming presence.",
          Tsundere: "Acts tough and dismissive but secretly cares deeply. Gets flustered by compliments easily.",
          Gothic: "Elegant, mysterious, and a touch dramatic. Has a poetic way of speaking with dry wit.",
          Mysterious: "Enigmatic and thoughtful. Sometimes gives cryptic answers and always seems to know more than they let on.",
          Sassy: "Quick-witted with sharp comebacks. Playful teasing is their way of showing affection.",
          Wise: "Calm, thoughtful, and insightful. Speaks with purpose and offers gentle guidance when asked.",
          Energetic: "Bursting with energy and enthusiasm. Gets excited easily and brings infectious positivity.",
        };
        updateForm("companion", "personality", templates[vibe] || "");
      }
    }
  };

  // ========== RENDER ==========

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xl">
        {/* Progress */}
        {step < 4 && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    i === step
                      ? "bg-blue-500 text-white"
                      : i < step
                        ? "bg-blue-200 text-blue-700"
                        : "bg-slate-200 text-slate-400"
                  }`}
                >
                  {i < step ? "\u2713" : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 h-0.5 ${i < step ? "bg-blue-300" : "bg-slate-200"}`} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg shadow-blue-900/5 border border-slate-100 p-8">
          {/* Step 0: About You */}
          {step === 0 && (
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Let's set up your AI companion</h2>
              <p className="text-slate-500 mb-6">Tell us a bit about yourself so your companion can get to know you.</p>

              <label className="block text-sm font-medium text-slate-700 mb-1">Your Name</label>
              <input
                type="text"
                value={form.user.name}
                onChange={(e) => updateForm("user", "name", e.target.value)}
                placeholder="What should your companion call you?"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-4"
              />

              <label className="block text-sm font-medium text-slate-700 mb-1">About Yourself</label>
              <textarea
                value={form.user.about}
                onChange={(e) => updateForm("user", "about", e.target.value)}
                placeholder="Tell your companion a bit about yourself — your interests, what you do, what you enjoy talking about..."
                rows={4}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
              />
            </div>
          )}

          {/* Step 1: LLM Provider */}
          {step === 1 && (
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Connect your AI brain</h2>
              <p className="text-slate-500 mb-6">Choose an LLM provider. Any OpenAI-compatible API works.</p>

              <div className="grid grid-cols-3 gap-2 mb-4">
                {Object.entries(llmPresets).map(([id, preset]) => (
                  <button
                    key={id}
                    onClick={() => selectLLMPreset(id)}
                    className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      form.llm.provider === id
                        ? "border-blue-400 bg-blue-50 text-blue-700"
                        : "border-slate-200 hover:border-slate-300 text-slate-600"
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>

              {form.llm.provider && (
                <>
                  {llmPresets[form.llm.provider]?.needs_key !== false && (
                    <>
                      <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
                      <input
                        type="password"
                        value={form.llm.api_key}
                        onChange={(e) => { updateForm("llm", "api_key", e.target.value); setTestResult(null); }}
                        placeholder="Paste your API key"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-4"
                      />
                    </>
                  )}

                  <label className="block text-sm font-medium text-slate-700 mb-1">Model</label>
                  <input
                    type="text"
                    value={form.llm.model}
                    onChange={(e) => { updateForm("llm", "model", e.target.value); setTestResult(null); }}
                    placeholder="e.g. gpt-4o"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-4"
                  />

                  {form.llm.provider === "custom" && (
                    <>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Base URL</label>
                      <input
                        type="text"
                        value={form.llm.base_url}
                        onChange={(e) => { updateForm("llm", "base_url", e.target.value); setTestResult(null); }}
                        placeholder="https://api.example.com/v1"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-4"
                      />
                    </>
                  )}

                  <button
                    onClick={testConnection}
                    disabled={testing}
                    className="w-full py-2.5 rounded-xl bg-slate-800 text-white font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors"
                  >
                    {testing ? "Testing..." : "Test Connection"}
                  </button>

                  {testResult && (
                    <div className={`mt-3 px-4 py-2.5 rounded-xl text-sm ${
                      testResult.success
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}>
                      {testResult.success ? "Connected successfully!" : testResult.error || "Connection failed"}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 2: Voice & TTS */}
          {step === 2 && (
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Choose a voice</h2>
              <p className="text-slate-500 mb-6">Pick a TTS provider and voice for your companion.</p>

              <label className="block text-sm font-medium text-slate-700 mb-1">TTS Provider</label>
              <div className="flex gap-2 mb-4">
                {Object.entries(ttsPresets).map(([id, preset]) => (
                  <button
                    key={id}
                    onClick={() => updateForm("tts", "provider", id)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      form.tts.provider === id
                        ? "border-blue-400 bg-blue-50 text-blue-700"
                        : "border-slate-200 hover:border-slate-300 text-slate-600"
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>

              {ttsPresets[form.tts.provider]?.needs_key && (
                <>
                  <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
                  <input
                    type="password"
                    value={form.tts.api_key}
                    onChange={(e) => updateForm("tts", "api_key", e.target.value)}
                    placeholder="Paste your API key"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-4"
                  />
                </>
              )}

              <label className="block text-sm font-medium text-slate-700 mb-1">Voice</label>
              <div className="flex gap-2 mb-4">
                <select
                  value={form.tts.voice}
                  onChange={(e) => updateForm("tts", "voice", e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
                <button
                  onClick={playSample}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 text-slate-600 text-sm font-medium transition-colors"
                >
                  Play Sample
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Your Companion */}
          {step === 3 && (
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Create your companion</h2>
              <p className="text-slate-500 mb-6">Give your companion a name and personality.</p>

              <label className="block text-sm font-medium text-slate-700 mb-1">Companion Name</label>
              <input
                type="text"
                value={form.companion.name}
                onChange={(e) => updateForm("companion", "name", e.target.value)}
                placeholder="What's your companion's name?"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-4"
              />

              <label className="block text-sm font-medium text-slate-700 mb-2">Vibe</label>
              <div className="flex flex-wrap gap-2 mb-4">
                {VIBES.map((vibe) => (
                  <button
                    key={vibe}
                    onClick={() => selectVibe(vibe)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      form.companion.vibe === vibe
                        ? "border-blue-400 bg-blue-50 text-blue-700"
                        : "border-slate-200 hover:border-slate-300 text-slate-500"
                    }`}
                  >
                    {vibe}
                  </button>
                ))}
              </div>

              <label className="block text-sm font-medium text-slate-700 mb-1">Personality</label>
              <textarea
                value={form.companion.personality}
                onChange={(e) => updateForm("companion", "personality", e.target.value)}
                placeholder="Describe your companion's personality... e.g., cheerful and energetic, calm and wise, playful and sarcastic"
                rows={4}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none mb-4"
              />

              <label className="block text-sm font-medium text-slate-700 mb-1">Model</label>
              {models.length > 1 ? (
                <select
                  value={form.companion.model_id}
                  onChange={(e) => updateForm("companion", "model_id", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.id} ({m.type})</option>
                  ))}
                </select>
              ) : (
                <div className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-sm">
                  Using default model (haru).
                  <span className="block text-xs text-slate-400 mt-1">
                    To use a custom model, place it in models/live2d/ or models/vrm/ and restart.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Completion */}
          {step === 4 && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                {"\u2713"}
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">You're all set!</h2>
              <p className="text-slate-500">Meet {form.companion.name}. Loading your companion...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 px-4 py-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Navigation */}
          {step < 4 && (
            <div className="flex justify-between mt-8">
              <button
                onClick={() => setStep(step - 1)}
                disabled={step === 0}
                className="px-6 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-700 disabled:opacity-0 transition-colors"
              >
                Back
              </button>

              {step < 3 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={!canProceed()}
                  className="px-6 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-40 transition-colors"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleFinish}
                  disabled={!canProceed() || submitting}
                  className="px-6 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-40 transition-colors"
                >
                  {submitting ? "Setting up..." : "Finish"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Onboarding.tsx
git commit -m "feat: add onboarding wizard component"
```

---

### Task 7: Settings Page (frontend/src/components/Settings.tsx)

**Files:**
- Create: `frontend/src/components/Settings.tsx`

- [ ] **Step 1: Create Settings.tsx**

```tsx
import { useState, useEffect } from "react";

interface Voice {
  id: string;
  name: string;
}

interface LLMPreset {
  name: string;
  base_url: string;
  needs_key: boolean;
  default_model: string;
}

interface TTSPreset {
  name: string;
  needs_key: boolean;
}

export function Settings({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<any>(null);
  const [llmPresets, setLlmPresets] = useState<Record<string, LLMPreset>>({});
  const [ttsPresets, setTtsPresets] = useState<Record<string, TTSPreset>>({});
  const [voices, setVoices] = useState<Voice[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Form state — separate from config so we can edit without saving
  const [userName, setUserName] = useState("");
  const [userAbout, setUserAbout] = useState("");
  const [llmProvider, setLlmProvider] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [ttsProvider, setTtsProvider] = useState("tiktok");
  const [ttsApiKey, setTtsApiKey] = useState("");
  const [ttsVoice, setTtsVoice] = useState("jp_001");

  useEffect(() => {
    Promise.all([
      fetch("/api/config").then((r) => r.json()),
      fetch("/api/config/presets").then((r) => r.json()),
    ]).then(([cfg, presets]) => {
      setConfig(cfg);
      setLlmPresets(presets.llm || {});
      setTtsPresets(presets.tts || {});

      setUserName(cfg.user?.name || "");
      setUserAbout(cfg.user?.about || "");
      setLlmProvider(cfg.llm?.provider || "");
      setLlmApiKey(""); // Don't show masked key as editable
      setLlmModel(cfg.llm?.model || "");
      setLlmBaseUrl(cfg.llm?.base_url || "");
      setTtsProvider(cfg.tts?.provider || "tiktok");
      setTtsApiKey("");
      setTtsVoice(cfg.tts?.voice || "jp_001");
    });
  }, []);

  useEffect(() => {
    fetch(`/api/voices/${ttsProvider}`)
      .then((r) => r.json())
      .then(setVoices)
      .catch(console.error);
  }, [ttsProvider]);

  const selectPreset = (id: string) => {
    const preset = llmPresets[id];
    if (!preset) return;
    setLlmProvider(id);
    setLlmBaseUrl(preset.base_url);
    setLlmModel(preset.default_model);
    setTestResult(null);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/config/test-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_url: llmBaseUrl,
          api_key: llmApiKey || null,
          model: llmModel,
        }),
      });
      setTestResult(await res.json());
    } catch {
      setTestResult({ success: false, error: "Network error" });
    }
    setTesting(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const update: any = {
      user: { name: userName, about: userAbout },
      llm: { provider: llmProvider, base_url: llmBaseUrl, model: llmModel },
      tts: { provider: ttsProvider, voice: ttsVoice },
    };
    // Only send keys if user typed something new
    if (llmApiKey) update.llm.api_key = llmApiKey;
    if (ttsApiKey) update.tts.api_key = ttsApiKey;

    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!config) return <div className="p-8 text-slate-400">Loading settings...</div>;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-slate-800">Settings</h2>
        <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700">
          Close
        </button>
      </div>

      {/* User Profile */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">Your Profile</h3>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="Your name"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <textarea
          value={userAbout}
          onChange={(e) => setUserAbout(e.target.value)}
          placeholder="About yourself"
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </section>

      {/* LLM Provider */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">LLM Provider</h3>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.entries(llmPresets).map(([id, preset]) => (
            <button
              key={id}
              onClick={() => selectPreset(id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                llmProvider === id
                  ? "border-blue-400 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-500"
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>

        {llmPresets[llmProvider]?.needs_key !== false && (
          <input
            type="password"
            value={llmApiKey}
            onChange={(e) => { setLlmApiKey(e.target.value); setTestResult(null); }}
            placeholder="API Key (leave blank to keep current)"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        )}

        <input
          type="text"
          value={llmModel}
          onChange={(e) => { setLlmModel(e.target.value); setTestResult(null); }}
          placeholder="Model name"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />

        {llmProvider === "custom" && (
          <input
            type="text"
            value={llmBaseUrl}
            onChange={(e) => { setLlmBaseUrl(e.target.value); setTestResult(null); }}
            placeholder="Base URL"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        )}

        <button
          onClick={testConnection}
          disabled={testing}
          className="w-full py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 disabled:opacity-50 transition-colors"
        >
          {testing ? "Testing..." : "Test Connection"}
        </button>
        {testResult && (
          <div className={`mt-2 px-3 py-1.5 rounded-lg text-xs ${
            testResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}>
            {testResult.success ? "Connected!" : testResult.error || "Failed"}
          </div>
        )}
      </section>

      {/* TTS */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">Voice & TTS</h3>
        <div className="flex gap-1.5 mb-3">
          {Object.entries(ttsPresets).map(([id, preset]) => (
            <button
              key={id}
              onClick={() => setTtsProvider(id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                ttsProvider === id
                  ? "border-blue-400 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-500"
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>

        {ttsPresets[ttsProvider]?.needs_key && (
          <input
            type="password"
            value={ttsApiKey}
            onChange={(e) => setTtsApiKey(e.target.value)}
            placeholder="API Key (leave blank to keep current)"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        )}

        <select
          value={ttsVoice}
          onChange={(e) => setTtsVoice(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {voices.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </section>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-50 transition-colors"
      >
        {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Settings.tsx
git commit -m "feat: add settings page component"
```

---

### Task 8: Update App.tsx to Gate on Onboarding

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add onboarding gate and settings integration**

At the top of `App.tsx`, add the imports (after existing imports at line 8):

```typescript
import { Onboarding } from "./components/Onboarding";
import { Settings } from "./components/Settings";
```

Inside the `App` function, add the onboarding state (after line 15, before existing state):

```typescript
const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
```

Add a config check effect (after the existing useEffect that fetches characters at line 54):

```typescript
// Check if onboarding is complete
useEffect(() => {
  fetch("/api/config")
    .then((r) => r.json())
    .then((data) => {
      setOnboardingComplete(data.onboarding_complete ?? false);
    })
    .catch(() => setOnboardingComplete(false));
}, []);
```

Add the onboarding gate at the start of the return block — replace the current return (line 206) with:

```typescript
// Loading state
if (onboardingComplete === null) {
  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="text-slate-400 font-medium">Loading...</div>
    </div>
  );
}

// Onboarding
if (!onboardingComplete) {
  return (
    <Onboarding
      onComplete={() => {
        setOnboardingComplete(true);
        // Re-fetch characters and models after onboarding creates them
        fetch("/api/characters").then((r) => r.json()).then((data) => {
          setCharacters(data);
          // Select the newly created companion
          fetch("/api/config").then((r) => r.json()).then((cfg) => {
            if (cfg.active_character) {
              setSelectedCharId(cfg.active_character);
            } else if (data.length > 0) {
              setSelectedCharId(data[0].id);
            }
          });
        });
        fetch("/api/models").then((r) => r.json()).then(setModels);
      }}
    />
  );
}

return (
  // ... existing JSX unchanged
```

Then update the settings panel in the right-side panel. Replace the current `settingsOpen` ternary (lines 260-275) — the part that shows `<ModelSettings>`:

Replace:
```tsx
{settingsOpen ? (
  <ModelSettings
    modelId={selectedModel?.id || ""}
    onPreviewExpression={(expr) => setCurrentExpression(expr)}
    onClose={() => {
      setSettingsOpen(false);
      if (selectedModel?.id) {
        fetch(`/api/expressions/configured/${selectedModel.id}`)
          .then((r) => r.json())
          .then((data) => {
            setExpressionsConfigured(data.configured);
            if (data.neutral) setNeutralExpression(data.neutral);
          });
      }
    }}
  />
```

With:
```tsx
{settingsOpen ? (
  <Settings
    onClose={() => {
      setSettingsOpen(false);
      // Refresh characters in case companion was edited
      fetch("/api/characters").then((r) => r.json()).then(setCharacters);
    }}
  />
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: gate app on onboarding and integrate settings page"
```

---

### Task 9: Verify and Fix Integration

**Files:**
- Various — integration checks

- [ ] **Step 1: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors. If errors appear, fix the specific type issues in the reported files.

- [ ] **Step 2: Verify backend starts**

Run: `cd /Users/meetsonawane/Code/project/MeuxVtuber && python -c "from backend.services.config import load_config, LLM_PRESETS, TTS_PRESETS; print('Config OK:', load_config()); print('Presets OK')"`

Expected: Prints the default config and "Presets OK".

- [ ] **Step 3: Verify config API module imports**

Run: `python -c "from backend.api.config import router; print('Config API OK')"`

Expected: Prints "Config API OK".

- [ ] **Step 4: Verify character creation**

Run: `python -c "from backend.services.character import create_character; cid = create_character('TestBot', 'Friendly helper', 'haru', 'jp_001', 'Test', 'Just testing', 'cheerful'); print('Created:', cid)"`

Expected: Prints "Created: testbot" and creates `characters/testbot.md`.

Then clean up: `rm characters/testbot.md`

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for onboarding system"
```

---

### Task 10: Update chat.py TTS Integration

**Files:**
- Modify: `backend/api/chat.py`

- [ ] **Step 1: Read chat.py to find the generate_tts call**

Read the file and identify where `generate_tts` is called with voice parameter.

- [ ] **Step 2: Update to use generate_tts_auto**

Update the import at the top of `chat.py`:

```python
from backend.services.tts import generate_tts_auto
```

Replace the `generate_tts(sentence_text, voice)` call with `generate_tts_auto(sentence_text)`.

The voice is now read from `config.json` inside `generate_tts_auto`, so the voice parameter from the character definition is no longer needed for the TTS call. The character's voice field in the `.md` frontmatter still exists for reference but TTS voice selection is now centralized in config.

- [ ] **Step 3: Commit**

```bash
git add backend/api/chat.py
git commit -m "feat: use config-driven TTS in chat streaming"
```

---

### Task 11: Add config.json to .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add config.json to .gitignore**

`config.json` contains API keys and should not be committed. Add this line to `.gitignore`:

```
config.json
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add config.json to gitignore"
```
