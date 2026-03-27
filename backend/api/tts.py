from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from backend.services.tts import generate_tts, list_voices

router = APIRouter()


class TTSRequest(BaseModel):
    text: str
    voice: str = "jp_001"


class TTSResponse(BaseModel):
    audio: Optional[str] = None


@router.post("/api/tts", response_model=TTSResponse)
def text_to_speech(req: TTSRequest):
    audio_b64 = generate_tts(req.text, req.voice)
    if audio_b64 is None:
        raise HTTPException(status_code=500, detail="TTS generation failed")
    return TTSResponse(audio=audio_b64)


@router.get("/api/voices")
def get_voices():
    return list_voices()


@router.get("/api/voices/{provider}")
def get_voices_for_provider(provider: str):
    from backend.services.tts import list_voices_for_provider
    return list_voices_for_provider(provider)
