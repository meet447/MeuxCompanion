from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from openai import OpenAI

from backend.services.config import (
    load_config, save_config, mask_config,
    get_configured_providers,
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


@router.get("/api/config/configured")
def get_configured():
    """Return which providers have been configured."""
    return get_configured_providers()


class SwitchProviderRequest(BaseModel):
    provider: str


@router.post("/api/config/switch-llm")
def switch_llm(body: SwitchProviderRequest):
    """Switch active LLM provider, restoring saved per-provider config."""
    config = load_config()
    saved = config.get("llm_providers", {}).get(body.provider)
    preset = LLM_PRESETS.get(body.provider)
    if not preset:
        raise HTTPException(status_code=400, detail="Unknown provider")

    config["llm"] = {
        "provider": body.provider,
        "base_url": saved.get("base_url", preset["base_url"]) if saved else preset["base_url"],
        "api_key": saved.get("api_key") if saved else None,
        "model": saved.get("model", preset["default_model"]) if saved else preset["default_model"],
    }
    save_config(config)
    return {"ok": True}


@router.post("/api/config/switch-tts")
def switch_tts(body: SwitchProviderRequest):
    """Switch active TTS provider, restoring saved per-provider config."""
    config = load_config()
    saved = config.get("tts_providers", {}).get(body.provider)

    config["tts"] = {
        "provider": body.provider,
        "api_key": saved.get("api_key") if saved else None,
        "voice": saved.get("voice", "jp_001") if saved else "jp_001",
    }
    save_config(config)
    return {"ok": True}
