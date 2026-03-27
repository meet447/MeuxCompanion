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
    masked = json.loads(json.dumps(config))
    for section in ("llm", "tts"):
        key = masked.get(section, {}).get("api_key")
        if key and isinstance(key, str) and len(key) > 8:
            masked[section]["api_key"] = key[:4] + "..." + key[-4:]
        elif key:
            masked[section]["api_key"] = "***"
    return masked
