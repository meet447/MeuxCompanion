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
    "llm_providers": {},
    "tts_providers": {},
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
    """Write config to disk. Also persists per-provider settings."""
    # Auto-save per-provider config when llm/tts section has a provider set
    llm = config.get("llm", {})
    if llm.get("provider"):
        providers = config.setdefault("llm_providers", {})
        providers[llm["provider"]] = {
            "base_url": llm.get("base_url", ""),
            "api_key": llm.get("api_key"),
            "model": llm.get("model", ""),
        }

    tts = config.get("tts", {})
    if tts.get("provider"):
        providers = config.setdefault("tts_providers", {})
        providers[tts["provider"]] = {
            "api_key": tts.get("api_key"),
            "voice": tts.get("voice", ""),
        }

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
    # Mask per-provider keys too
    for store in ("llm_providers", "tts_providers"):
        for pid, pdata in masked.get(store, {}).items():
            key = pdata.get("api_key")
            if key and isinstance(key, str) and len(key) > 8:
                pdata["api_key"] = key[:4] + "..." + key[-4:]
            elif key:
                pdata["api_key"] = "***"
    return masked


def get_configured_providers() -> dict:
    """Return which LLM/TTS providers have been configured."""
    config = load_config()
    llm_configured = {}
    for pid, pdata in config.get("llm_providers", {}).items():
        has_key = bool(pdata.get("api_key"))
        preset = LLM_PRESETS.get(pid, {})
        needs_key = preset.get("needs_key", True)
        llm_configured[pid] = {
            "configured": (not needs_key) or has_key,
            "model": pdata.get("model", ""),
        }

    tts_configured = {}
    for pid, pdata in config.get("tts_providers", {}).items():
        has_key = bool(pdata.get("api_key"))
        preset = TTS_PRESETS.get(pid, {})
        needs_key = preset.get("needs_key", True)
        tts_configured[pid] = {
            "configured": (not needs_key) or has_key,
            "voice": pdata.get("voice", ""),
        }

    return {"llm": llm_configured, "tts": tts_configured}
