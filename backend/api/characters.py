from fastapi import APIRouter, HTTPException

from backend.services.character import list_characters, load_character, list_all_models

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
