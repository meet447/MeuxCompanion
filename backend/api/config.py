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
