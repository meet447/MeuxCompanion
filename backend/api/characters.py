from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from backend.services.character import list_characters, load_character, list_all_models, create_character

router = APIRouter()


@router.get("/api/characters")
def get_characters():
    return list_characters()


@router.get("/api/characters/{character_id}")
def get_character(character_id: str):
    character = load_character(character_id)
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    return {
        "id": character["id"],
        "name": character["name"],
        "live2d_model": character["live2d_model"],
        "voice": character["voice"],
        "default_emotion": character["default_emotion"],
    }


@router.get("/api/models")
def get_models():
    return list_all_models()


class CreateCharacterRequest(BaseModel):
    name: str
    personality: str
    model_id: str = "haru"
    voice: str = "jp_001"
    user_name: str
    user_about: str
    vibe: Optional[str] = None
    relationship_style: Optional[str] = None
    speech_style: Optional[str] = None


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
        relationship_style=body.relationship_style,
        speech_style=body.speech_style,
    )
    return {"id": char_id}
